# Enhanced Shopping List for Home Assistant

Rozbudowana lista zakupów dla Home Assistant z ilościami, notatkami, fuzzy search i real-time sync.

## Funkcje

- **Inteligentne dodawanie** - duplikaty automatycznie zwiększają ilość, kupione produkty wracają na listę
- **Fuzzy search** - podpowiedzi z tolerancją na literówki (np. "mlecz" znajdzie "mleczko")
- **Ilości** - przyciski +/- przy każdej pozycji
- **Notatki** - opcjonalne uwagi przy każdym produkcie
- **Swipe gestures** - przesuń w prawo = kupione, w lewo = usuń (mobile)
- **Real-time sync** - zmiany widoczne natychmiast na wszystkich urządzeniach
- **Sekcja "Kupione"** - zwijana, z opcją przywracania i masowego czyszczenia

## Instalacja

### HACS (zalecane)

1. Otwórz HACS w Home Assistant
2. Kliknij menu (3 kropki) > **Custom repositories**
3. Wklej URL tego repozytorium, kategoria: **Integration**
4. Kliknij **Install**
5. Zrestartuj Home Assistant

### Ręczna instalacja

1. Skopiuj folder `custom_components/enhanced_shopping_list/` do katalogu `config/custom_components/`
2. Skopiuj plik `www/enhanced-shopping-list-card.js` do katalogu `config/www/`
3. Zrestartuj Home Assistant

## Konfiguracja

### 1. Aktywacja integracji

Dodaj do `configuration.yaml`:

```yaml
enhanced_shopping_list:
```

Zrestartuj Home Assistant.

### 2. Rejestracja karty Lovelace

Przejdź do **Ustawienia > Dashboardy > Zasoby** (lub edytuj dashboard > menu > zasoby) i dodaj:

- **URL:** `/local/enhanced-shopping-list-card.js`
- **Typ:** JavaScript Module

### 3. Dodanie karty do dashboardu

W edytorze dashboardu dodaj kartę ręcznie (YAML):

```yaml
type: custom:enhanced-shopping-list-card
title: "Lista zakupów"
```

## Serwisy

Dostępne serwisy do użycia w automatyzacjach i skryptach:

| Serwis | Opis | Parametry |
|--------|------|-----------|
| `enhanced_shopping_list.add_item` | Dodaj produkt | `name` (wymagane), `quantity` (domyślnie 1), `notes` |
| `enhanced_shopping_list.complete_item` | Oznacz jako kupione | `item_id` |
| `enhanced_shopping_list.uncomplete_item` | Przywróć do listy | `item_id` |
| `enhanced_shopping_list.remove_item` | Usuń pozycję | `item_id` |
| `enhanced_shopping_list.update_item` | Edytuj pozycję | `item_id`, `name`, `quantity`, `notes` |
| `enhanced_shopping_list.clear_completed` | Wyczyść kupione | brak |

### Przykład automatyzacji (dodawanie głosem)

```yaml
automation:
  - alias: "Dodaj do listy zakupów głosem"
    trigger:
      - platform: event
        event_type: custom_sentence
    action:
      - service: enhanced_shopping_list.add_item
        data:
          name: "{{ trigger.event.data.product }}"
          quantity: "{{ trigger.event.data.quantity | default(1) }}"
```

## Widget na Androida

Aplikacja Home Assistant Companion na Androida obsługuje widgety. Aby korzystać z listy zakupów jako widgetu:

1. Zainstaluj **Home Assistant Companion** z Google Play
2. Skonfiguruj aplikację z Twoim serwerem HA
3. Utwórz skrypt w HA wywołujący serwisy `enhanced_shopping_list`
4. Dodaj widget **Entity** lub **Template** na ekranie Androida, wskazujący na skrypt lub dashboard z kartą
5. Alternatywnie: użyj widgetu **WebView**, który otwiera dashboard Lovelace z kartą enhanced-shopping-list-card

Najprostsze podejście: ustaw dashboard z kartą listy zakupów jako domyślny widok w aplikacji Companion.

## Struktura plików

```
custom_components/enhanced_shopping_list/
  __init__.py       # Setup, serwisy, WebSocket API
  manifest.json     # Manifest integracji HA
  const.py          # Stale (DOMAIN, STORAGE_KEY, EVENT_NAME)
  store.py          # Persystencja danych (JSON via HA Store)
  services.yaml     # Definicje serwisow
www/
  enhanced-shopping-list-card.js   # Lovelace custom card (LitElement)
```

## Wymagania

- Home Assistant 2024.1.0+
- Python 3.12+

## Licencja

MIT
