# Enhanced Shopping List

A feature-rich shopping list card for Home Assistant.

## Features

- Works with any `todo.*` entity (shopping_list, Todoist, Bring!, Google Tasks)
- Quantities with +/- buttons
- Notes per product
- Categories with grouping, sorting, badges & headers
- Swipe gestures: right = bought, left = delete with confirmation
- Fuzzy search suggestions with typo tolerance
- Configurable colors (backgrounds, text, icons)
- 4 header quick-toggles for view preferences
- i18n: Polish & English (auto-detected)
- Real-time sync across devices

## Configuration

After installation and HA restart:

1. **Settings > Devices & Services > Add Integration** > search **Enhanced Shopping List**
2. The card JS registers automatically
3. **Edit dashboard > Add Card** > find **Enhanced Shopping List** in the Custom section

No YAML editing required.
