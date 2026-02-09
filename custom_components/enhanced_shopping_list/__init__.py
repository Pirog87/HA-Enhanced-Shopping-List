"""Enhanced Shopping List integration for Home Assistant."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
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


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up via YAML — just ensure the integration is loaded."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Enhanced Shopping List from a config entry (UI install)."""
    store = ShoppingListStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = store

    # --- Auto-register the Lovelace card JS resource ---
    await _async_register_card(hass)

    # --- Register services ---
    _async_register_services(hass, store)

    # --- Register WebSocket API ---
    _async_register_websocket(hass, store)

    _LOGGER.info("Enhanced Shopping List loaded successfully")
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
#  Auto-register Lovelace card JS file
# ------------------------------------------------------------------

CARD_FILENAME = "enhanced-shopping-list-card.js"
LOVELACE_URL = f"/local/{CARD_FILENAME}"


async def _async_register_card(hass: HomeAssistant) -> None:
    """Copy card JS to config/www/ and register as Lovelace resource."""
    source = Path(__file__).parent / CARD_FILENAME
    www_dir = Path(hass.config.path("www"))
    dest = www_dir / CARD_FILENAME

    # Ensure config/www/ exists
    www_dir.mkdir(parents=True, exist_ok=True)

    # Copy JS (overwrite on every setup to keep it up-to-date)
    try:
        shutil.copy2(str(source), str(dest))
        _LOGGER.info("Card JS copied to %s", dest)
    except Exception:  # noqa: BLE001
        _LOGGER.error(
            "Failed to copy card JS from %s to %s", source, dest
        )
        return

    # Register as Lovelace resource
    if not _try_add_resource(hass, LOVELACE_URL):
        hass.bus.async_listen_once(
            "homeassistant_started",
            lambda _: _try_add_resource(hass, LOVELACE_URL),
        )


@callback
def _try_add_resource(hass: HomeAssistant, url: str) -> bool:
    """Add JS resource to Lovelace if not already registered."""
    try:
        resources = hass.data.get("lovelace_resources")
        if resources is None:
            _LOGGER.debug(
                "Lovelace resources not available (YAML mode?). "
                "Add manually: %s",
                url,
            )
            return False

        for item in resources.async_items():
            stored = item.get("url", "").split("?")[0]
            if stored == url or CARD_FILENAME in stored:
                _LOGGER.debug("Lovelace resource already registered")
                return True

        hass.async_create_task(
            resources.async_create_item({"res_type": "module", "url": url})
        )
        _LOGGER.info("Auto-registered Lovelace resource: %s", url)
        return True
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Could not auto-register resource. Add manually: %s", url
        )
        return False


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
