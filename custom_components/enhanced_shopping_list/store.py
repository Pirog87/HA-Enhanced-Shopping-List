"""Storage handler for Enhanced Shopping List."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION


class ShoppingListStore:
    """Manage persistence of the enhanced shopping list."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store."""
        self._hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._items: list[dict[str, Any]] = []

    @property
    def items(self) -> list[dict[str, Any]]:
        """Return all items."""
        return list(self._items)

    async def async_load(self) -> None:
        """Load items from disk."""
        data = await self._store.async_load()
        if data and isinstance(data, dict):
            self._items = data.get("items", [])
        else:
            self._items = []

    async def async_save(self) -> None:
        """Persist items to disk."""
        await self._store.async_save({"items": self._items})

    def _find_by_id(self, item_id: str) -> dict[str, Any] | None:
        """Find an item by its UUID."""
        for item in self._items:
            if item["id"] == item_id:
                return item
        return None

    def _find_by_name(
        self, name: str, *, complete: bool | None = None
    ) -> dict[str, Any] | None:
        """Find an item by name (case-insensitive), optionally filtered by status."""
        lower_name = name.lower().strip()
        for item in self._items:
            if item["name"].lower().strip() == lower_name:
                if complete is None or item["complete"] == complete:
                    return item
        return None

    async def async_add_item(
        self, name: str, quantity: int = 1, notes: str = ""
    ) -> dict[str, Any]:
        """Add an item with smart duplicate handling.

        1. If an active (incomplete) item with the same name exists, increase quantity.
        2. If a completed item with the same name exists, reactivate it with new quantity.
        3. Otherwise, create a new item.
        """
        name = name.strip()
        if not name:
            raise ValueError("Item name cannot be empty")
        quantity = max(1, int(quantity))

        # Check active items first
        active = self._find_by_name(name, complete=False)
        if active is not None:
            active["quantity"] = active.get("quantity", 1) + quantity
            if notes:
                active["notes"] = notes
            await self.async_save()
            return active

        # Check completed items
        completed = self._find_by_name(name, complete=True)
        if completed is not None:
            completed["complete"] = False
            completed["completed_at"] = None
            completed["quantity"] = quantity
            if notes:
                completed["notes"] = notes
            await self.async_save()
            return completed

        # Create new item
        now = datetime.now(timezone.utc).isoformat()
        item: dict[str, Any] = {
            "id": uuid.uuid4().hex,
            "name": name,
            "quantity": quantity,
            "notes": notes,
            "complete": False,
            "added_at": now,
            "completed_at": None,
        }
        self._items.append(item)
        await self.async_save()
        return item

    async def async_complete_item(self, item_id: str) -> dict[str, Any]:
        """Mark an item as completed."""
        item = self._find_by_id(item_id)
        if item is None:
            raise ValueError(f"Item {item_id} not found")
        item["complete"] = True
        item["completed_at"] = datetime.now(timezone.utc).isoformat()
        await self.async_save()
        return item

    async def async_uncomplete_item(self, item_id: str) -> dict[str, Any]:
        """Move a completed item back to the active list."""
        item = self._find_by_id(item_id)
        if item is None:
            raise ValueError(f"Item {item_id} not found")
        item["complete"] = False
        item["completed_at"] = None
        await self.async_save()
        return item

    async def async_remove_item(self, item_id: str) -> None:
        """Remove an item from the list entirely."""
        item = self._find_by_id(item_id)
        if item is None:
            raise ValueError(f"Item {item_id} not found")
        self._items.remove(item)
        await self.async_save()

    async def async_update_item(
        self,
        item_id: str,
        name: str | None = None,
        quantity: int | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Update an item's mutable fields."""
        item = self._find_by_id(item_id)
        if item is None:
            raise ValueError(f"Item {item_id} not found")
        if name is not None:
            stripped = name.strip()
            if not stripped:
                raise ValueError("Item name cannot be empty")
            item["name"] = stripped
        if quantity is not None:
            item["quantity"] = max(1, int(quantity))
        if notes is not None:
            item["notes"] = notes
        await self.async_save()
        return item

    async def async_clear_completed(self) -> None:
        """Remove all completed items."""
        self._items = [i for i in self._items if not i["complete"]]
        await self.async_save()
