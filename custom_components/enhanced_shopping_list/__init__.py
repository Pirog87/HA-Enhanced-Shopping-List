"""Enhanced Shopping List integration for Home Assistant.

This integration only serves the frontend card JS file.
The card itself operates on native HA todo.* entities — no custom backend needed.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# Frontend constants
CARD_FILENAME = "enhanced-shopping-list-card.js"
URL_BASE = f"/{DOMAIN}"
CARD_URL = f"{URL_BASE}/{CARD_FILENAME}"

# Read version from manifest.json
_MANIFEST = json.loads((Path(__file__).parent / "manifest.json").read_text())
VERSION = _MANIFEST.get("version", "0.0.0")

# Unique cache buster per HA start — guarantees fresh JS on every restart
_STARTUP_TS = str(int(time.time()))


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up via YAML — just ensure the integration is loaded."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Enhanced Shopping List from a config entry (UI install)."""
    hass.data.setdefault(DOMAIN, {})

    await _async_register_frontend(hass)

    _LOGGER.info("Enhanced Shopping List v%s loaded (ts=%s)", VERSION, _STARTUP_TS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.data.pop(DOMAIN, None)
    return True


# ------------------------------------------------------------------
#  Frontend: serve JS and register as Lovelace resource
# ------------------------------------------------------------------

async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Serve JS from integration directory and register as Lovelace resource."""
    url_with_cache_buster = f"{CARD_URL}?v={VERSION}.{_STARTUP_TS}"

    # Step 1: Register static HTTP path so HA serves the JS file
    # cache_headers=False so browser always checks for updated file
    try:
        await hass.http.async_register_static_paths([
            StaticPathConfig(
                url_path=URL_BASE,
                path=str(Path(__file__).parent),
                cache_headers=False,
            )
        ])
    except RuntimeError:
        _LOGGER.debug("Static path already registered: %s", URL_BASE)

    # Step 2: Inject as extra JS (loads on every page, all Lovelace modes)
    add_extra_js_url(hass, url_with_cache_buster)

    # Step 3: Also register as Lovelace resource (persistent across restarts,
    # needed for Chromecast displays and as fallback)
    await _async_register_lovelace_resource(hass, url_with_cache_buster)

    _LOGGER.debug("Frontend registered: %s", url_with_cache_buster)


async def _async_register_lovelace_resource(
    hass: HomeAssistant, url: str, *, _retries: int = 0
) -> None:
    """Register JS as a Lovelace module resource (storage mode only)."""
    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        return

    # Handle both attribute and dict-style access (varies across HA versions)
    if hasattr(lovelace, "resources"):
        resources = lovelace.resources
    elif isinstance(lovelace, dict) and "resources" in lovelace:
        resources = lovelace["resources"]
    else:
        return

    if not resources.loaded:
        if _retries < 5:
            async_call_later(
                hass,
                5,
                lambda _now: hass.async_create_task(
                    _async_register_lovelace_resource(
                        hass, url, _retries=_retries + 1
                    )
                ),
            )
        return

    url_path = url.split("?")[0]

    for item in resources.async_items():
        existing_path = item.get("url", "").split("?")[0]
        if existing_path == url_path:
            if item["url"] != url:
                await resources.async_update_item(
                    item["id"], {"res_type": "module", "url": url}
                )
            return

    await resources.async_create_item({"res_type": "module", "url": url})
