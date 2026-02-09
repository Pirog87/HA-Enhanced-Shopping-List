"""Enhanced Shopping List integration for Home Assistant."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
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


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Enhanced Shopping List component."""
    store = ShoppingListStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = store

    def _fire_event() -> None:
        """Fire update event so frontend cards refresh."""
        hass.bus.async_fire(EVENT_NAME)

    # --- Service handlers ---

    async def handle_add_item(call: ServiceCall) -> None:
        """Handle add_item service call."""
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
        """Handle complete_item service call."""
        try:
            await store.async_complete_item(call.data[ATTR_ITEM_ID])
            _fire_event()
        except ValueError as err:
            _LOGGER.error("complete_item failed: %s", err)

    async def handle_uncomplete_item(call: ServiceCall) -> None:
        """Handle uncomplete_item service call."""
        try:
            await store.async_uncomplete_item(call.data[ATTR_ITEM_ID])
            _fire_event()
        except ValueError as err:
            _LOGGER.error("uncomplete_item failed: %s", err)

    async def handle_remove_item(call: ServiceCall) -> None:
        """Handle remove_item service call."""
        try:
            await store.async_remove_item(call.data[ATTR_ITEM_ID])
            _fire_event()
        except ValueError as err:
            _LOGGER.error("remove_item failed: %s", err)

    async def handle_update_item(call: ServiceCall) -> None:
        """Handle update_item service call."""
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
        """Handle clear_completed service call."""
        await store.async_clear_completed()
        _fire_event()

    # Register services
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_ITEM, handle_add_item, schema=ADD_ITEM_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_COMPLETE_ITEM, handle_complete_item, schema=ITEM_ID_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UNCOMPLETE_ITEM, handle_uncomplete_item, schema=ITEM_ID_SCHEMA
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

    # --- WebSocket API for the frontend card ---

    @websocket_api.websocket_command(
        {vol.Required("type"): "enhanced_shopping_list/items"}
    )
    @callback
    def ws_get_items(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        """Return all shopping list items via WebSocket."""
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
        """Add item via WebSocket."""
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
        """Complete item via WebSocket."""
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
        """Uncomplete item via WebSocket."""
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
        """Remove item via WebSocket."""
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
        """Update item via WebSocket."""
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
        """Clear completed items via WebSocket."""
        await store.async_clear_completed()
        _fire_event()
        connection.send_result(msg["id"])

    # Register WebSocket commands
    websocket_api.async_register_command(hass, ws_get_items)
    websocket_api.async_register_command(hass, ws_add_item)
    websocket_api.async_register_command(hass, ws_complete_item)
    websocket_api.async_register_command(hass, ws_uncomplete_item)
    websocket_api.async_register_command(hass, ws_remove_item)
    websocket_api.async_register_command(hass, ws_update_item)
    websocket_api.async_register_command(hass, ws_clear_completed)

    _LOGGER.info("Enhanced Shopping List loaded successfully")
    return True
