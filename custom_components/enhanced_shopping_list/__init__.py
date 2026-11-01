"""Enhanced Shopping List integration for Home Assistant.

This integration only serves the frontend card JS file.
The card itself operates on native HA todo.* entities — no custom backend needed.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from aiohttp import web
from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.components.http import HomeAssistantView
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
LOADER_URL = f"{URL_BASE}/esl-loader.js"

# Read version from manifest.json
_MANIFEST = json.loads((Path(__file__).parent / "manifest.json").read_text())
VERSION = _MANIFEST.get("version", "0.0.0")

# JS file path
_JS_PATH = Path(__file__).parent / CARD_FILENAME

# Browsers may store the response but must revalidate it on every use
# (a cheap 304 via ETag/Last-Modified). Without an explicit Cache-Control
# they cache heuristically and can keep serving a stale or broken copy.
_NO_CACHE = {"Cache-Control": "no-cache"}

# A broken copy of the card (truncated, or an HTML error page) can sit in
# the HTTP cache or in Home Assistant's service worker cache, where it
# survives normal reloads. A failed module import cannot be retried under
# the same URL within a page, so the loader retries under a unique URL,
# which no cache can answer.
_LOADER_JS = f"""const url = "{CARD_URL}?v={VERSION}";
import(url)
  .catch(() => import(`${{url}}&r=${{Date.now()}}`))
  .catch((err) => console.error("Enhanced Shopping List: card failed to load", err));
"""


class CardView(HomeAssistantView):
    """Serve the card JS with revalidation forced on every load."""

    url = CARD_URL
    name = "enhanced_shopping_list:card"
    requires_auth = False

    async def get(self, request: web.Request) -> web.StreamResponse:
        """Return the card file; FileResponse answers conditional GETs with 304."""
        return web.FileResponse(
            _JS_PATH,
            headers={**_NO_CACHE, "Content-Type": "application/javascript"},
        )


class LoaderView(HomeAssistantView):
    """Serve the loader module that imports the card with a retry."""

    url = LOADER_URL
    name = "enhanced_shopping_list:loader"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        """Return the loader module."""
        # charset must go in its own argument: aiohttp raises ValueError when
        # content_type contains it, which surfaces as an HTTP 500.
        return web.Response(
            text=_LOADER_JS,
            content_type="application/javascript",
            charset="utf-8",
            headers=_NO_CACHE,
        )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the HTTP views as early as possible, before entry setup."""
    _register_views(hass)
    return True


def _register_views(hass: HomeAssistant) -> None:
    """Register the card and loader views once per HA process."""
    data = hass.data.setdefault(DOMAIN, {})
    if data.get("views_registered"):
        return
    hass.http.register_view(CardView())
    hass.http.register_view(LoaderView())
    data["views_registered"] = True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Enhanced Shopping List from a config entry (UI install)."""
    # Preserve old JS URL from a previous load (set by async_unload_entry)
    # so we can remove it *after* the new one is registered (no gap).
    prev_url = hass.data.get(DOMAIN, {}).get("js_url")

    hass.data.setdefault(DOMAIN, {})

    # Cache buster based on VERSION only — stable across restarts/reloads,
    # changes only when the integration is actually updated. A stable URL
    # means the Lovelace resource stored in .storage stays valid across
    # restarts, so clients that load the dashboard before this integration
    # finishes setup still reference a working script URL (no race).
    await _async_register_frontend(hass)

    # Clean up stale URL only *after* the new one is active, and only if
    # the cache buster actually changed (i.e. the integration was updated).
    new_url = hass.data[DOMAIN]["js_url"]
    if prev_url and prev_url != new_url:
        try:
            remove_extra_js_url(hass, prev_url)
        except (KeyError, ValueError):
            pass

    _LOGGER.info("Enhanced Shopping List v%s loaded", VERSION)
    return True


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Migrate old config entries."""
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry.

    NOTE: We intentionally do NOT remove the extra JS URL here.
    Removing it triggers a frontend event that unloads the script,
    which causes "Configuration error" until the new URL is loaded.
    Instead, async_setup_entry cleans up the old URL *after* the new
    one is registered, ensuring there is never a gap.
    """
    # Keep js_url in hass.data so async_setup_entry can read it
    # after re-setup to remove the stale entry if needed.
    hass.data.setdefault(DOMAIN, {})
    return True


# ------------------------------------------------------------------
#  Frontend: serve JS and register as Lovelace resource
# ------------------------------------------------------------------

async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Register the loader as extra JS and as a Lovelace resource."""
    url_with_cache_buster = f"{LOADER_URL}?v={VERSION}"

    # Store URL so async_unload_entry can remove it on reload
    hass.data[DOMAIN]["js_url"] = url_with_cache_buster

    # Step 1: Ensure the views are registered (normally already done in
    # async_setup, which runs earlier — this is a safety net).
    _register_views(hass)

    # Step 2: Inject as extra JS (loads on every page, all Lovelace modes)
    add_extra_js_url(hass, url_with_cache_buster)

    # Step 3: Also register as Lovelace resource (persistent across restarts,
    # needed for Chromecast displays and as fallback).
    # Runs with retries since lovelace may not be ready yet at startup.
    await _async_register_lovelace_resource(hass, url_with_cache_buster)

    _LOGGER.debug("Frontend registered: %s", url_with_cache_buster)


async def _async_register_lovelace_resource(
    hass: HomeAssistant, url: str, *, _retries: int = 0
) -> None:
    """Register JS as a Lovelace module resource (storage mode only)."""
    max_retries = 10

    lovelace = hass.data.get("lovelace")
    if lovelace is None:
        if _retries < max_retries:
            _LOGGER.debug(
                "Lovelace not ready yet, retry %s/%s in 3s", _retries + 1, max_retries
            )
            async_call_later(
                hass,
                3,
                lambda _now: hass.async_create_background_task(
                    _async_register_lovelace_resource(
                        hass, url, _retries=_retries + 1
                    ),
                    name="esl_register_resource_retry",
                ),
            )
        else:
            _LOGGER.warning(
                "Lovelace data not available after %s retries; "
                "resource not registered (card still works via extra_js)",
                max_retries,
            )
        return

    # Handle both attribute and dict-style access (varies across HA versions)
    if hasattr(lovelace, "resources"):
        resources = lovelace.resources
    elif isinstance(lovelace, dict) and "resources" in lovelace:
        resources = lovelace["resources"]
    else:
        _LOGGER.debug("Lovelace has no resources collection — skipping")
        return

    if not resources.loaded:
        if _retries < max_retries:
            _LOGGER.debug(
                "Lovelace resources not loaded, retry %s/%s in 3s",
                _retries + 1,
                max_retries,
            )
            async_call_later(
                hass,
                3,
                lambda _now: hass.async_create_background_task(
                    _async_register_lovelace_resource(
                        hass, url, _retries=_retries + 1
                    ),
                    name="esl_register_resource_retry",
                ),
            )
        else:
            _LOGGER.warning(
                "Lovelace resources not loaded after %s retries; "
                "resource not registered (card still works via extra_js)",
                max_retries,
            )
        return

    # Earlier versions registered the card itself; those entries are
    # migrated to the loader so the card is never loaded without the retry.
    own_paths = {CARD_URL, LOADER_URL}

    try:
        ours = [
            item
            for item in resources.async_items()
            if item.get("url", "").split("?")[0] in own_paths
        ]
        if not ours:
            await resources.async_create_item({"res_type": "module", "url": url})
            _LOGGER.debug("Created Lovelace resource: %s", url)
            return

        keep, *duplicates = ours
        if keep["url"] != url:
            await resources.async_update_item(
                keep["id"], {"res_type": "module", "url": url}
            )
            _LOGGER.debug("Updated Lovelace resource URL: %s", url)
        for item in duplicates:
            await resources.async_delete_item(item["id"])
            _LOGGER.debug("Removed duplicate Lovelace resource: %s", item["url"])
    except Exception:
        _LOGGER.exception("Failed to register Lovelace resource")
