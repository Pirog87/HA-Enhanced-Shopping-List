# Enhanced Shopping List for Home Assistant

A feature-rich shopping list card for Home Assistant that works with any `todo.*` entity (native HA shopping list, Todoist, Bring!, Google Tasks, etc.).

Rozbudowana lista zakupów dla Home Assistant — działa z każdą encją `todo.*`.

[![hacs_badge](https://img.shields.io/badge/HACS-Default-41BDF5.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/v/release/Pirog87/HA-Enhanced-Shopping-List)](https://github.com/Pirog87/HA-Enhanced-Shopping-List/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Validate](https://github.com/Pirog87/HA-Enhanced-Shopping-List/actions/workflows/validate.yml/badge.svg)](https://github.com/Pirog87/HA-Enhanced-Shopping-List/actions/workflows/validate.yml)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Pirog87&repository=HA-Enhanced-Shopping-List&category=integration)

## Features

- **Smart adding** — duplicates auto-increment quantity; bought items return to the active list
- **Fuzzy search** — suggestions with typo tolerance (e.g. "mlecz" finds "mleczko")
- **Quantities** — +/- buttons on every item, inline editing
- **Notes** — optional notes per product, visible on card or in expandable editor
- **Categories** — group & sort by aisle/category, quick-chip picker, badges on items
- **Swipe gestures** — swipe right = bought (green), swipe left = delete with confirmation (red)
- **4 header quick-toggles** — group by categories, category badges, category headers, note icons
- **Delete confirmation** — red overlay with Yes/No buttons before removing any item
- **Real-time sync** — changes appear instantly on all devices via HA WebSocket
- **Collapsible "Bought" section** — with restore & bulk clear
- **Configurable colors** — active/bought backgrounds, text color, icon color, palette + hex input
- **i18n** — Polish and English UI (auto-detected from HA language setting)
- **Works with any todo entity** — native `shopping_list`, Todoist, Bring!, Google Tasks, etc.

## Screenshots

<!-- Add screenshots here -->
<!-- ![Card](screenshots/card.png) -->
<!-- ![Editor](screenshots/editor.png) -->

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant
2. Search for **Enhanced Shopping List**
3. Click **Download**
4. Restart Home Assistant

Or click the button below:

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=Pirog87&repository=HA-Enhanced-Shopping-List&category=integration)

### Manual installation

1. Copy the `custom_components/enhanced_shopping_list/` folder to your `config/custom_components/` directory
2. Restart Home Assistant

## Configuration

After installation and HA restart:

1. **Settings > Devices & Services > Add Integration** > search **Enhanced Shopping List** > click **Submit**
2. The card JS registers automatically — no need to add Lovelace resources manually
3. **Edit dashboard > Add Card** > in the "Custom" section find **Enhanced Shopping List** > click and you're done

No YAML editing required. No manual file management.

### Card editor options

| Option | Description |
|--------|-------------|
| Todo entity | Select any `todo.*` entity |
| Card title | Custom title (default: "Shopping list" / "Lista zakupów") |
| Sorting | Order added / Alphabetical |
| Background colors | Active & bought item backgrounds (palette + hex + "none" for theme) |
| Text color | Custom text color or auto (theme) |
| Icon color | Tag & note icon color or auto (theme) |
| Categories | Group/sort, show badges, show headers |
| View | Show note icon on items |

### Header quick-toggles

The card header has 4 toggle buttons (right side) for quick switching:

1. **Grid** — Group by categories on/off
2. **Tag** — Category badge labels on/off
3. **Lines** — Category group headers on/off
4. **Document** — Note icon on items on/off

These preferences persist per entity in localStorage.

## How it works

This integration is **frontend-only**. It does not create custom services or a custom backend. The Lovelace card communicates directly with HA's native `todo` API:

- **Read items**: `todo/item/list` WebSocket call
- **Add/update/remove**: `todo.add_item`, `todo.update_item`, `todo.remove_item` services
- **Metadata encoding**: quantity, category, and notes are encoded in the todo item summary: `"Name (qty) [Category] // notes"`

This means it works with **any todo provider** that HA supports.

## File structure

```
custom_components/enhanced_shopping_list/
  __init__.py                        # Serves JS, registers Lovelace resource
  manifest.json                      # Integration manifest
  config_flow.py                     # Config flow (UI setup)
  const.py                           # Constants (DOMAIN)
  strings.json                       # HA integration UI texts
  translations/                      # HA integration translations (en, pl)
  enhanced-shopping-list-card.js     # Lovelace custom card
```

## Requirements

- Home Assistant 2024.1.0+

## License

[MIT](LICENSE)
