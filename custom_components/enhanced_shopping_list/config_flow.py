"""Config flow for Enhanced Shopping List."""

from __future__ import annotations

from homeassistant.config_entries import ConfigFlow

from .const import DOMAIN


class EnhancedShoppingListConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Enhanced Shopping List."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step — single-click install, no options needed."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(
                title="Enhanced Shopping List", data={}
            )

        return self.async_show_form(step_id="user")
