"""Enhanced Shopping List integration for Home Assistant."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, EVENT_NAME
from .store import ShoppingListStore

_LOGGER = logging.getLogger(__name__)

ATTR_ITEM_ID = "item_id"
ATTR_NAME = "name"
ATTR_QUANTITY = "quantity"
ATTR_NOTES = "notes"

SERVICE_ADD_ITEM = "add_item"
SERVICE_COMPLETE_ITEM = "complete_item"
SERVICE_UNCOMPLETE_ITEM = "uncomplete_item"
SERVICE_REMOVE_ITEM = "remove_item"
SERVICE_UPDATE_ITEM = "update_item"
SERVICE_CLEAR_COMPLETED = "clear_completed"

ADD_ITEM_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_NAME): cv.string,
        vol.Optional(ATTR_QUANTITY, default=1): vol.Coerce(int),
        vol.Optional(ATTR_NOTES, default=""): cv.string,
    }
)

ITEM_ID_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ITEM_ID): cv.string,
    }
)

UPDATE_ITEM_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ITEM_ID): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
        vol.Optional(ATTR_QUANTITY): vol.Coerce(int),
        vol.Optional(ATTR_NOTES): cv.string,
    }
)

# Allow YAML-based setup to keep working (just creates a config entry)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# Frontend constants
CARD_FILENAME = "enhanced-shopping-list-card.js"
URL_BASE = f"/{DOMAIN}"
CARD_URL = f"{URL_BASE}/{CARD_FILENAME}"

# Read version from manifest.json
_MANIFEST = json.loads((Path(__file__).parent / "manifest.json").read_text())
VERSION = _MANIFEST.get("version", "0.0.0")


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up via YAML — just ensure the integration is loaded."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Enhanced Shopping List from a config entry (UI install)."""
    store = ShoppingListStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = store

    # --- Register frontend (serve JS + add to Lovelace) ---
    await _async_register_frontend(hass)

    # --- Register services ---
    _async_register_services(hass, store)

    # --- Register WebSocket API ---
    _async_register_websocket(hass, store)

    _LOGGER.info("Enhanced Shopping List v%s loaded successfully", VERSION)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry — clean up services so reload works."""
    for service_name in (
        SERVICE_ADD_ITEM,
        SERVICE_COMPLETE_ITEM,
        SERVICE_UNCOMPLETE_ITEM,
        SERVICE_REMOVE_ITEM,
        SERVICE_UPDATE_ITEM,
        SERVICE_CLEAR_COMPLETED,
    ):
        hass.services.async_remove(DOMAIN, service_name)

    hass.data.pop(DOMAIN, None)
    return True


# ------------------------------------------------------------------
#  Frontend: serve JS and register as Lovelace resource
# ------------------------------------------------------------------

async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Serve JS from integration directory and register as Lovelace resource."""
    url_with_version = f"{CARD_URL}?v={VERSION}"

    # Step 1: Register static HTTP path so HA serves the JS file
    # This makes /enhanced_shopping_list/enhanced-shopping-list-card.js available
    try:
        await hass.http.async_register_static_paths([
            StaticPathConfig(
                url_path=URL_BASE,
                path=str(Path(__file__).parent),
                cache_headers=True,
            )
        ])
        _LOGGER.debug("Static path registered: %s -> %s", URL_BASE, Path(__file__).parent)
    except RuntimeError:
        _LOGGER.debug("Static path already registered: %s", URL_BASE)

    # Step 2: Inject as extra JS module (loads on every page, all Lovelace modes)
    # This is the most reliable method — works in storage mode, YAML mode, etc.
    add_extra_js_url(hass, url_with_version)
    _LOGGER.debug("Added extra JS URL: %s", url_with_version)

    # Step 3: Also register as Lovelace resource (needed for Chromecast displays)
    await _async_register_lovelace_resource(hass, url_with_version)


async def _async_register_lovelace_resource(
    hass: HomeAssistant, url: str, *, _retries: int = 0
) -> None:
    """Register JS as a Lovelace module resource (storage mode only)."""
    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        _LOGGER.debug("Lovelace not available — skipping resource registration")
        return

    # Get resources — handle both attribute and dict-style access
    # (LovelaceData structure varies across HA versions)
    if hasattr(lovelace, "resources"):
        resources = lovelace.resources
    elif isinstance(lovelace, dict) and "resources" in lovelace:
        resources = lovelace["resources"]
    else:
        _LOGGER.debug(
            "Lovelace resources not accessible — skipping resource registration"
        )
        return

    if not resources.loaded:
        if _retries < 5:
            _LOGGER.debug(
                "Lovelace resources not loaded yet, retrying in 5s (attempt %d)",
                _retries + 1,
            )
            async_call_later(
                hass,
                5,
                lambda _now: hass.async_create_task(
                    _async_register_lovelace_resource(
                        hass, url, _retries=_retries + 1
                    )
                ),
            )
        else:
            _LOGGER.warning(
                "Lovelace resources never loaded — add resource manually: %s", url
            )
        return

    url_path = url.split("?")[0]

    for item in resources.async_items():
        existing_path = item.get("url", "").split("?")[0]
        if existing_path == url_path:
            # Already registered — update if version changed
            if item["url"] != url:
                await resources.async_update_item(
                    item["id"], {"res_type": "module", "url": url}
                )
                _LOGGER.info("Updated Lovelace resource: %s", url)
            else:
                _LOGGER.debug("Lovelace resource already registered: %s", url)
            return

    # Not registered yet — create
    await resources.async_create_item({"res_type": "module", "url": url})
    _LOGGER.info("Auto-registered Lovelace resource: %s", url)


# ------------------------------------------------------------------
#  Service registration
# ------------------------------------------------------------------

def _async_register_services(hass: HomeAssistant, store: ShoppingListStore) -> None:
    """Register all HA services."""

    def _fire_event() -> None:
        hass.bus.async_fire(EVENT_NAME)

    async def handle_add_item(call: ServiceCall) -> None:
        try:
            await store.async_add_item(
                name=call.data[ATTR_NAME],
                quantity=call.data.get(ATTR_QUANTITY, 1),
                notes=call.data.get(ATTR_NOTES, ""),
            )
            _fire_event()
        except ValueError as err:
            _LOGGER.error("add_item failed: %s", err)

    async def handle_complete_item(call: ServiceCall) -> None:
        try:
            await store.async_complete_item(call.data[ATTR_ITEM_ID])
            _fire_event()
        except ValueError as err:
            _LOGGER.error("complete_item failed: %s", err)

    async def handle_uncomplete_item(call: ServiceCall) -> None:
        try:
            await store.async_uncomplete_item(call.data[ATTR_ITEM_ID])
            _fire_event()
        except ValueError as err:
            _LOGGER.error("uncomplete_item failed: %s", err)

    async def handle_remove_item(call: ServiceCall) -> None:
        try:
            await store.async_remove_item(call.data[ATTR_ITEM_ID])
            _fire_event()
        except ValueError as err:
            _LOGGER.error("remove_item failed: %s", err)

    async def handle_update_item(call: ServiceCall) -> None:
        try:
            await store.async_update_item(
                item_id=call.data[ATTR_ITEM_ID],
                name=call.data.get(ATTR_NAME),
                quantity=call.data.get(ATTR_QUANTITY),
                notes=call.data.get(ATTR_NOTES),
            )
            _fire_event()
        except ValueError as err:
            _LOGGER.error("update_item failed: %s", err)

    async def handle_clear_completed(call: ServiceCall) -> None:
        await store.async_clear_completed()
        _fire_event()

    hass.services.async_register(
        DOMAIN, SERVICE_ADD_ITEM, handle_add_item, schema=ADD_ITEM_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_COMPLETE_ITEM, handle_complete_item, schema=ITEM_ID_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_UNCOMPLETE_ITEM,
        handle_uncomplete_item,
        schema=ITEM_ID_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_REMOVE_ITEM, handle_remove_item, schema=ITEM_ID_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_ITEM, handle_update_item, schema=UPDATE_ITEM_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_CLEAR_COMPLETED, handle_clear_completed
    )


# ------------------------------------------------------------------
#  WebSocket API registration
# ------------------------------------------------------------------

def _async_register_websocket(hass: HomeAssistant, store: ShoppingListStore) -> None:
    """Register all WebSocket commands."""

    def _fire_event() -> None:
        hass.bus.async_fire(EVENT_NAME)

    @websocket_api.websocket_command(
        {vol.Required("type"): "enhanced_shopping_list/items"}
    )
    @callback
    def ws_get_items(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        connection.send_result(msg["id"], store.items)

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "enhanced_shopping_list/add",
            vol.Required(ATTR_NAME): str,
            vol.Optional(ATTR_QUANTITY, default=1): int,
            vol.Optional(ATTR_NOTES, default=""): str,
        }
    )
    @websocket_api.async_response
    async def ws_add_item(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        try:
            item = await store.async_add_item(
                name=msg[ATTR_NAME],
                quantity=msg.get(ATTR_QUANTITY, 1),
                notes=msg.get(ATTR_NOTES, ""),
            )
            _fire_event()
            connection.send_result(msg["id"], item)
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_input", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "enhanced_shopping_list/complete",
            vol.Required(ATTR_ITEM_ID): str,
        }
    )
    @websocket_api.async_response
    async def ws_complete_item(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        try:
            item = await store.async_complete_item(msg[ATTR_ITEM_ID])
            _fire_event()
            connection.send_result(msg["id"], item)
        except ValueError as err:
            connection.send_error(msg["id"], "not_found", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "enhanced_shopping_list/uncomplete",
            vol.Required(ATTR_ITEM_ID): str,
        }
    )
    @websocket_api.async_response
    async def ws_uncomplete_item(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        try:
            item = await store.async_uncomplete_item(msg[ATTR_ITEM_ID])
            _fire_event()
            connection.send_result(msg["id"], item)
        except ValueError as err:
            connection.send_error(msg["id"], "not_found", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "enhanced_shopping_list/remove",
            vol.Required(ATTR_ITEM_ID): str,
        }
    )
    @websocket_api.async_response
    async def ws_remove_item(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        try:
            await store.async_remove_item(msg[ATTR_ITEM_ID])
            _fire_event()
            connection.send_result(msg["id"])
        except ValueError as err:
            connection.send_error(msg["id"], "not_found", str(err))

    @websocket_api.websocket_command(
        {
            vol.Required("type"): "enhanced_shopping_list/update",
            vol.Required(ATTR_ITEM_ID): str,
            vol.Optional(ATTR_NAME): str,
            vol.Optional(ATTR_QUANTITY): int,
            vol.Optional(ATTR_NOTES): str,
        }
    )
    @websocket_api.async_response
    async def ws_update_item(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        try:
            item = await store.async_update_item(
                item_id=msg[ATTR_ITEM_ID],
                name=msg.get(ATTR_NAME),
                quantity=msg.get(ATTR_QUANTITY),
                notes=msg.get(ATTR_NOTES),
            )
            _fire_event()
            connection.send_result(msg["id"], item)
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_input", str(err))

    @websocket_api.websocket_command(
        {vol.Required("type"): "enhanced_shopping_list/clear_completed"}
    )
    @websocket_api.async_response
    async def ws_clear_completed(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        await store.async_clear_completed()
        _fire_event()
        connection.send_result(msg["id"])

    websocket_api.async_register_command(hass, ws_get_items)
    websocket_api.async_register_command(hass, ws_add_item)
    websocket_api.async_register_command(hass, ws_complete_item)
    websocket_api.async_register_command(hass, ws_uncomplete_item)
    websocket_api.async_register_command(hass, ws_remove_item)
    websocket_api.async_register_command(hass, ws_update_item)
    websocket_api.async_register_command(hass, ws_clear_completed)
