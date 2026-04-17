/**
 * Enhanced Shopping List Card v2.16.0
 * Works with any todo.* entity (native HA shopping list)
 * Summary encoding: "Name (qty) [Category] // note"
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseSummary(summary) {
  const s = (summary || "").trim();
  let name = s, qty = 1, unit = "", notes = "", category = "";
  const noteIdx = s.indexOf(" // ");
  if (noteIdx >= 0) {
    notes = s.substring(noteIdx + 4).trim();
    name = s.substring(0, noteIdx).trim();
  }
  const catMatch = name.match(/^(.+?)\s*\[([^\]]+)\]$/);
  if (catMatch) {
    name = catMatch[1].trim();
    category = catMatch[2].trim();
  }
  const qm = name.match(/^(.+?)\s*\((\d+(?:[.,]\d+)?)\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ.]*)\)$/);
  if (qm) {
    name = qm[1].trim();
    qty = parseFloat(qm[2].replace(",", "."));
    unit = (qm[3] || "").trim();
  }
  return { name, qty, unit, notes, category };
}

function formatSummary(name, qty, notes, category, unit) {
  const u = unit || "";
  let s;
  if (qty !== 1 || u) {
    s = u ? `${name} (${qty} ${u})` : `${name} (${qty})`;
  } else {
    s = name;
  }
  if (category) s += ` [${category}]`;
  if (notes) s += ` // ${notes}`;
  return s;
}

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/g, "l").replace(/\u0141/g, "L");
}

function fuzzyScore(query, target) {
  const q = stripDiacritics(query.toLowerCase());
  const t = stripDiacritics(target.toLowerCase());
  if (t.includes(q)) return 1000 - t.indexOf(q);
  let qi = 0, score = 0, lastIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      if (lastIdx !== -1 && ti - lastIdx === 1) score += 5;
      lastIdx = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  i18n                                                               */
/* ------------------------------------------------------------------ */
const STRINGS = {
  pl: {
    add_placeholder: "Dodaj produkt...",
    add_title: "Dodaj",
    add_category_title: "Wybierz kategorię przed dodaniem",
    store_mode: "W sklepie",
    store_mode_exit: "Wyjdź",
    store_done: "Wszystko kupione!",
    store_undo: "Cofnij",
    store_progress: "kupione",
    to_buy: "Do kupienia",
    bought: "Kupione",
    clear_bought: "Wyczyść kupione",
    confirm_clear: "Usunąć wszystkie kupione?",
    yes: "Tak",
    no: "Nie",
    empty: "Lista jest pusta",
    other: "Inne",
    add_note: "Dodaj notatkę",
    add_note_placeholder: "Dodaj notatkę...",
    save: "Zapisz",
    new_category: "Nowa kategoria...",
    remove: "Usuń",
    remove_from_list: "Usuń z listy",
    pcs: "szt.",
    confirm_delete: "Usunąć",
    category: "Kategoria",
    toggle_group: "Grupuj po kategoriach",
    toggle_badge: "Etykiety kategorii na pozycjach",
    toggle_headers: "Nagłówki kategorii",
    toggle_notes: "Ikona notatki na pozycjach",
    copy_list: "Kopiuj listę",
    copied: "Skopiowano!",
    default_title: "Lista zakupów",
    ed_entity: "Lista todo (entity)",
    ed_choose_entity: "-- Wybierz encję todo --",
    ed_title: "Tytuł karty",
    ed_sort: "Sortowanie",
    ed_sort_manual: "Kolejność dodania",
    ed_sort_alpha: "Alfabetycznie",
    ed_color_active: "Kolor tła: Do kupienia",
    ed_color_done: "Kolor tła: Kupione",
    ed_color_none: "Brak (motyw)",
    ed_text_color: "Kolor tekstu",
    ed_icon_color: "Kolor ikon (tag, notatka)",
    ed_check_color: "Kolor znacznika ✓ (podpowiedzi)",
    ed_categories: "Kategorie",
    ed_group_sort: "Grupuj i sortuj po kategoriach",
    ed_show_badge: "Pokazuj nazwę kategorii na pozycji",
    ed_show_headers: "Pokazuj nagłówki grupowania kategorii",
    ed_cat_order: "Kolejność kategorii",
    ed_cat_order_empty: "Dodaj kategorie do produktów, aby ustalić kolejność",
    ed_cat_rename: "Zmień nazwę kategorii",
    ed_view: "Widok",
    ed_show_notes: "Pokazuj ikonę notatki na pozycjach",
    ed_item_size: "Rozmiar pozycji",
    ed_swipe_threshold: "Próg swipe (% szerokości)",
    ed_section_standard: "Widok standardowy",
    ed_section_store: "Tryb 'W sklepie'",
    ed_store_size: "Rozmiar pozycji",
    ed_size_compact: "Kompaktowy",
    ed_size_normal: "Normalny",
    ed_size_comfortable: "Wygodny",
    ed_hex_placeholder: "#rrggbb lub none",
    ed_auto: "auto",
    ed_auto_placeholder: "auto lub #rrggbb",
  },
  en: {
    add_placeholder: "Add product...",
    add_title: "Add",
    add_category_title: "Pick category before adding",
    store_mode: "In store",
    store_mode_exit: "Exit",
    store_done: "All done!",
    store_undo: "Undo",
    store_progress: "done",
    to_buy: "To buy",
    bought: "Bought",
    clear_bought: "Clear bought",
    confirm_clear: "Remove all bought items?",
    yes: "Yes",
    no: "No",
    empty: "List is empty",
    other: "Other",
    add_note: "Add note",
    add_note_placeholder: "Add note...",
    save: "Save",
    new_category: "New category...",
    remove: "Remove",
    remove_from_list: "Remove from list",
    pcs: "pcs",
    confirm_delete: "Delete",
    category: "Category",
    toggle_group: "Group by categories",
    toggle_badge: "Category labels on items",
    toggle_headers: "Category headers",
    toggle_notes: "Note icon on items",
    copy_list: "Copy list",
    copied: "Copied!",
    default_title: "Shopping list",
    ed_entity: "Todo list (entity)",
    ed_choose_entity: "-- Choose todo entity --",
    ed_title: "Card title",
    ed_sort: "Sorting",
    ed_sort_manual: "Order added",
    ed_sort_alpha: "Alphabetical",
    ed_color_active: "Background: To buy",
    ed_color_done: "Background: Bought",
    ed_color_none: "None (theme)",
    ed_text_color: "Text color",
    ed_icon_color: "Icon color (tag, note)",
    ed_check_color: "Check icon color (suggestions)",
    ed_categories: "Categories",
    ed_group_sort: "Group and sort by categories",
    ed_show_badge: "Show category name on items",
    ed_show_headers: "Show category group headers",
    ed_cat_order: "Category order",
    ed_cat_order_empty: "Add categories to products to set the order",
    ed_cat_rename: "Rename category",
    ed_view: "View",
    ed_show_notes: "Show note icon on items",
    ed_item_size: "Item size",
    ed_swipe_threshold: "Swipe threshold (% of width)",
    ed_section_standard: "Standard view",
    ed_section_store: "\"In store\" mode",
    ed_store_size: "Item size",
    ed_size_compact: "Compact",
    ed_size_normal: "Normal",
    ed_size_comfortable: "Comfortable",
    ed_hex_placeholder: "#rrggbb or none",
    ed_auto: "auto",
    ed_auto_placeholder: "auto or #rrggbb",
  },
};

function getStrings(lang) {
  return (lang || "en").startsWith("pl") ? STRINGS.pl : STRINGS.en;
}

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */
class EnhancedShoppingListCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._items = [];
    this._inputValue = "";
    this._pendingCategory = "";
    this._suggestions = [];
    this._completedExpanded = false;
    this._debounceTimer = null;
    this._qtyTimers = {};
    this._hass = null;
    this._rendered = false;
    this._retryCount = 0;
    this._knownUids = new Set();
    this._viewPrefs = {};
  }

  setConfig(config) {
    this._config = config;
    if (this._rendered) {
      try {
        this._render();
        if (config.entity) this._fetchItems();
      } catch (e) {
        console.error("ESL: render after config change failed", e);
      }
    }
  }

  getCardSize() { return 3; }
  static getConfigElement() { return document.createElement("enhanced-shopping-list-card-editor"); }
  static getStubConfig(hass) {
    const ent = hass ? Object.keys(hass.states).find(e => e.startsWith("todo.")) : "";
    return { entity: ent || "", title: getStrings(hass?.language).default_title };
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!this._rendered) {
      try {
        this._render(); this._rendered = true;
        if (this._config.entity) this._fetchItems();
      } catch (e) {
        console.error("ESL: initial render failed, will retry", e);
        this._scheduleRetry();
      }
      return;
    }
    const entity = this._config.entity;
    if (entity && oldHass) {
      const o = oldHass.states[entity], n = hass.states[entity];
      if (!o || o.last_updated !== n?.last_updated) this._fetchItems();
    }
  }

  get hass() { return this._hass; }
  _t(key) { return getStrings(this._hass?.language)[key] || key; }
  _swipeThreshold() { return Math.max(10, Math.min(90, parseInt(this._config.swipe_threshold) || 50)) / 100; }
  _qtyStep(unit) {
    switch ((unit || "").toLowerCase()) {
      case "kg": return 0.5;
      case "dag": return 5;
      case "g": case "ml": return 100;
      case "l": return 0.5;
      default: return 1;
    }
  }

  _scheduleRetry() {
    if (this._retryCount >= 5) {
      console.error("ESL: render failed after 5 retries");
      return;
    }
    this._retryCount = (this._retryCount || 0) + 1;
    const delay = this._retryCount * 2000;
    setTimeout(() => {
      if (this._rendered) return;
      try {
        this._render(); this._rendered = true;
        if (this._config.entity) this._fetchItems();
        console.info("ESL: render succeeded on retry", this._retryCount);
      } catch (e) {
        console.warn("ESL: render retry failed", this._retryCount, e);
        this._scheduleRetry();
      }
    }, delay);
  }

  /* ---------- data ---------- */

  async _fetchItems() {
    if (!this._hass || !this._config.entity) return;
    try {
      const res = await this._hass.callWS({ type: "todo/item/list", entity_id: this._config.entity });
      this._items = (res.items || []).map((it) => {
        const { name, qty, unit, notes, category } = parseSummary(it.summary);
        return { uid: it.uid, name, quantity: qty, unit: unit || "", notes, category, status: it.status, summary: it.summary };
      });
      this._updateLists();
    } catch (e) { console.error("ESL: fetch failed", e); }
  }

  async _callService(service, data) {
    if (!this._hass) return;
    try {
      await this._hass.callService("todo", service, data, { entity_id: this._config.entity });
    } catch (e) { console.error(`ESL: todo.${service} error`, e); }
  }

  async _addItem(name, qty = 1, notes = "", category = "", unit = "") {
    await this._callService("add_item", { item: formatSummary(name, qty, notes, category, unit) });
    await this._fetchItems();
  }

  async _toggleComplete(item) {
    const s = item.status === "needs_action" ? "completed" : "needs_action";
    if (s === "completed" && (item.quantity !== 1 || item.unit)) {
      const li = this._items.find(i => i.uid === item.uid);
      const name = li ? li.name : item.name;
      const notes = li ? li.notes : (item.notes || "");
      const category = li ? li.category : (item.category || "");
      await this._callService("update_item", {
        item: item.uid, rename: formatSummary(name, 1, notes, category, ""), status: s,
      });
    } else {
      await this._callService("update_item", { item: item.uid, status: s });
    }
    await this._fetchItems();
  }

  async _removeItem(item) {
    await this._callService("remove_item", { item: [item.uid] });
    await this._fetchItems();
  }

  _updateQuantity(item, newQty, newUnit) {
    const li = this._items.find(i => i.uid === item.uid);
    const resolvedUnit = newUnit !== undefined ? newUnit : (li ? li.unit : (item.unit || ""));
    const q = Math.max(resolvedUnit ? 0.1 : 1, newQty);
    const name = li ? li.name : item.name;
    const notes = li ? li.notes : (item.notes || "");
    const category = li ? li.category : (item.category || "");
    const unit = newUnit !== undefined ? newUnit : (li ? li.unit : (item.unit || ""));
    if (li) { li.quantity = q; li.unit = unit; li.summary = formatSummary(name, q, notes, category, unit); }
    this._updateLists();
    clearTimeout(this._qtyTimers[item.uid]);
    this._qtyTimers[item.uid] = setTimeout(async () => {
      delete this._qtyTimers[item.uid];
      await this._callService("update_item", { item: item.uid, rename: formatSummary(name, q, notes, category, unit) });
      await this._fetchItems();
    }, 500);
  }

  async _updateName(item, newName) {
    const li = this._items.find(i => i.uid === item.uid);
    const category = li ? li.category : (item.category || "");
    const unit = li ? li.unit : (item.unit || "");
    await this._callService("update_item", {
      item: item.uid, rename: formatSummary(newName.trim(), item.quantity, item.notes || "", category, unit),
    });
    await this._fetchItems();
  }

  async _updateNotes(item, notes) {
    const li = this._items.find(i => i.uid === item.uid);
    const name = li ? li.name : item.name;
    const qty = li ? li.quantity : item.quantity;
    const category = li ? li.category : (item.category || "");
    const unit = li ? li.unit : (item.unit || "");
    await this._callService("update_item", {
      item: item.uid, rename: formatSummary(name, qty, notes, category, unit),
    });
    if (li) li.notes = notes;
    await this._fetchItems();
  }

  async _updateCategory(item, category) {
    const li = this._items.find(i => i.uid === item.uid);
    const name = li ? li.name : item.name;
    const qty = li ? li.quantity : item.quantity;
    const notes = li ? li.notes : (item.notes || "");
    const unit = li ? li.unit : (item.unit || "");
    await this._callService("update_item", {
      item: item.uid, rename: formatSummary(name, qty, notes, category, unit),
    });
    if (li) li.category = category;
    await this._fetchItems();
  }

  _getCategories() {
    const cats = new Set();
    for (const item of this._items) {
      if (item.category) cats.add(item.category);
    }
    return [...cats].sort((a, b) => a.localeCompare(b, "pl"));
  }

  async _clearCompleted() {
    const c = this._items.filter(i => i.status === "completed");
    if (!c.length) return;
    await this._callService("remove_item", { item: c.map(i => i.uid) });
    await this._fetchItems();
  }

  async _addCurrentInput() {
    const name = (this._inputValue || "").trim();
    if (!name) return;
    const active = this._items.find(i => i.status === "needs_action" && i.name.toLowerCase() === name.toLowerCase());
    if (active) {
      this._updateQuantity(active, active.quantity + 1);
    } else {
      const done = this._items.find(i => i.status === "completed" && i.name.toLowerCase() === name.toLowerCase());
      if (done) {
        await this._callService("update_item", { item: done.uid, status: "needs_action" });
        await this._fetchItems();
      } else {
        await this._addItem(name, 1, "", this._pendingCategory);
      }
    }
    this._inputValue = "";
    this._pendingCategory = "";
    const inp = this.shadowRoot.querySelector(".add-input");
    if (inp) inp.value = "";
    this._hideSuggestions();
    this._setAddCategory("");
  }

  _sortItems(items) {
    const sorted = [...items];
    const catEnabled = this._getViewPref("show_categories");
    const hasAnyCat = catEnabled && sorted.some(i => i.category);
    if (hasAnyCat) {
      const order = this._config.category_order || [];
      const orderMap = {};
      for (let i = 0; i < order.length; i++) orderMap[order[i].toLowerCase()] = i;
      sorted.sort((a, b) => {
        const catA = (a.category || "").toLowerCase();
        const catB = (b.category || "").toLowerCase();
        if (catA && !catB) return -1;
        if (!catA && catB) return 1;
        if (catA !== catB) {
          const oA = catA in orderMap ? orderMap[catA] : 9999;
          const oB = catB in orderMap ? orderMap[catB] : 9999;
          if (oA !== oB) return oA - oB;
          return catA.localeCompare(catB, "pl");
        }
        return a.name.localeCompare(b.name, "pl");
      });
    } else if (this._config.sort_by === "alphabetical") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "pl"));
    }
    return sorted;
  }

  /* ---------- rendering ---------- */

  _hexToRgb(hex) {
    const h = (hex || "").replace("#", "");
    return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
  }

  _render() {
    const title = this._config.title || this._t("default_title");
    const activeColor = this._config.color_active || "#2196f3";
    const doneColor = this._config.color_completed || "#4caf50";
    const isActiveNone = activeColor === "none";
    const isDoneNone = doneColor === "none";
    const activeRgb = isActiveNone ? "128,128,128" : this._hexToRgb(activeColor);
    const doneRgb = isDoneNone ? "128,128,128" : this._hexToRgb(doneColor);
    const activeBg = isActiveNone ? "var(--secondary-background-color, rgba(128,128,128,0.06))" : `rgba(${activeRgb}, 0.35)`;
    const doneBg = isDoneNone ? "var(--secondary-background-color, rgba(128,128,128,0.06))" : `rgba(${doneRgb}, 0.35)`;
    const textColor = this._config.text_color || "";
    const iconColor = this._config.icon_color || "";
    const sizeClass = this._config.item_size && this._config.item_size !== "normal" ? ` size-${this._config.item_size}` : "";
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --esl-active-rgb: ${activeRgb};
          --esl-done-rgb: ${doneRgb};
          --esl-active-bg: ${activeBg};
          --esl-done-bg: ${doneBg};
          --esl-text-color: ${textColor || "var(--primary-text-color)"};
          --esl-icon-color: ${iconColor || "var(--secondary-text-color)"};
        }
        ${EnhancedShoppingListCard.CSS}
      </style>
      <ha-card class="${sizeClass.trim()}">
        <div class="header">
          <span class="header-title">${esc(title)}</span>
          <div class="header-toggles">
            <button class="hdr-toggle store-mode-btn" title="${this._t("store_mode")}">
              <svg viewBox="0 0 24 24" width="26" height="26"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="1.5"/><path d="M16 10a4 4 0 01-8 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <button class="hdr-toggle${this._getViewPref("show_categories") ? " hdr-on" : ""}" data-toggle="show_categories" title="${this._t("toggle_group")}">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            <button class="hdr-toggle${this._getViewPref("show_category_badge") ? " hdr-on" : ""}" data-toggle="show_category_badge" title="${this._t("toggle_badge")}">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>
            </button>
            <button class="hdr-toggle${this._getViewPref("show_category_headers") ? " hdr-on" : ""}" data-toggle="show_category_headers" title="${this._t("toggle_headers")}">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 6h16M4 10h10M4 14h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </button>
            <button class="hdr-toggle${this._getViewPref("show_notes") ? " hdr-on" : ""}" data-toggle="show_notes" title="${this._t("toggle_notes")}">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="14,2 14,8 20,8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            <button class="hdr-toggle copy-list-btn" title="${this._t("copy_list")}">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="9" y="9" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
          </div>
        </div>
        <div class="content">
          <div class="add-section">
            <div class="input-row">
              <input class="add-input" type="text" placeholder="${this._t("add_placeholder")}" />
              <button class="add-cat-btn" title="${this._t("add_category_title")}">
                <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke="var(--secondary-text-color)" stroke-width="1.5"/><circle cx="7" cy="7" r="1.5" fill="var(--secondary-text-color)"/></svg>
              </button>
              <button class="add-btn" title="${this._t("add_title")}">
                <svg viewBox="0 0 24 24" width="28" height="28">
                  <circle cx="12" cy="12" r="11" fill="var(--primary-color)"/>
                  <path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="pending-cat-bar" style="display:none"></div>
            <div class="add-cat-picker" style="display:none">
              <div class="cat-chips add-cat-chips"></div>
              <div class="cat-input-row">
                <input class="cat-input add-cat-input" type="text" placeholder="${this._t("new_category")}" />
                <button class="cat-save add-cat-save">${this._t("save")}</button>
              </div>
            </div>
            <div class="suggestions" style="display:none"></div>
          </div>
          <div class="section active-section">
            <div class="section-title">${this._t("to_buy")} <span class="badge-count active-count">0</span></div>
            <div class="active-list"></div>
          </div>
          <div class="section completed-section" style="display:none">
            <div class="section-title completed-header">
              <span>${this._t("bought")} <span class="badge-count completed-count">0</span> <span class="chevron">&#9660;</span></span>
              <div class="done-toggles">
                <button class="hdr-toggle hdr-toggle-sm${this._getViewPref("show_categories_done") ? " hdr-on" : ""}" data-toggle="show_categories_done" title="${this._t("toggle_group")}">
                  <svg viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                </button>
                <button class="hdr-toggle hdr-toggle-sm${this._getViewPref("show_category_badge_done") ? " hdr-on" : ""}" data-toggle="show_category_badge_done" title="${this._t("toggle_badge")}">
                  <svg viewBox="0 0 24 24" width="14" height="14"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>
                </button>
                <button class="hdr-toggle hdr-toggle-sm${this._getViewPref("show_category_headers_done") ? " hdr-on" : ""}" data-toggle="show_category_headers_done" title="${this._t("toggle_headers")}">
                  <svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 6h16M4 10h10M4 14h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
                <button class="clear-all-btn" title="${this._t("clear_bought")}">
                  <svg viewBox="0 0 24 24" width="22" height="22"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
                </button>
              </div>
            </div>
            <div class="confirm-bar" style="display:none">
              <span>${this._t("confirm_clear")}</span>
              <button class="btn-yes">${this._t("yes")}</button>
              <button class="btn-no">${this._t("no")}</button>
            </div>
            <div class="completed-list" style="height:0;overflow:hidden"></div>
          </div>
        </div>
      </ha-card>`;
    this._bindGlobalEvents();
  }

  _bindGlobalEvents() {
    const R = this.shadowRoot;
    const inp = R.querySelector(".add-input");
    inp.addEventListener("input", e => {
      this._inputValue = e.target.value;
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._updateSuggestions(), 300);
    });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); this._addCurrentInput(); } });
    inp.addEventListener("blur", () => setTimeout(() => this._hideSuggestions(), 200));
    R.querySelector(".add-btn").addEventListener("click", () => this._addCurrentInput());

    // Category picker for new items
    const catBtn = R.querySelector(".add-cat-btn");
    catBtn.addEventListener("click", () => this._toggleAddCategoryPicker());

    // Store mode
    R.querySelector(".store-mode-btn").addEventListener("click", () => this._enterStoreMode());
    R.querySelector(".copy-list-btn").addEventListener("click", () => this._copyList());

    R.querySelectorAll(".hdr-toggle").forEach(btn => {
      btn.addEventListener("click", () => this._toggleViewPref(btn.dataset.toggle));
    });
    R.querySelector(".completed-header").addEventListener("click", e => {
      if (e.target.closest(".clear-all-btn") || e.target.closest(".hdr-toggle")) return;
      this._completedExpanded = !this._completedExpanded;
      this._updateCompletedVis();
    });
    R.querySelector(".clear-all-btn").addEventListener("click", e => {
      e.stopPropagation();
      R.querySelector(".confirm-bar").style.display = "flex";
    });
    R.querySelector(".btn-yes").addEventListener("click", () => {
      R.querySelector(".confirm-bar").style.display = "none";
      this._clearCompleted();
    });
    R.querySelector(".btn-no").addEventListener("click", () => {
      R.querySelector(".confirm-bar").style.display = "none";
    });
  }

  _hideSuggestions() {
    this._suggestions = [];
    const s = this.shadowRoot.querySelector(".suggestions");
    if (s) s.style.display = "none";
  }

  _toggleAddCategoryPicker() {
    const R = this.shadowRoot;
    const picker = R.querySelector(".add-cat-picker");
    const btn = R.querySelector(".add-cat-btn");
    const open = picker.style.display !== "none";
    if (open) {
      picker.style.display = "none";
      btn.classList.remove("add-cat-active");
      return;
    }
    picker.style.display = "";
    btn.classList.add("add-cat-active");
    const cats = this._getCategories();
    const chipsEl = picker.querySelector(".add-cat-chips");
    chipsEl.innerHTML = cats.map(c =>
      `<span class="cat-chip${c === this._pendingCategory ? ' cat-chip-active' : ''}" data-cat="${esc(c)}">${esc(c)}</span>`
    ).join("");
    chipsEl.querySelectorAll(".cat-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const cat = chip.dataset.cat;
        this._setAddCategory(cat === this._pendingCategory ? "" : cat);
      });
    });
    const inp = picker.querySelector(".add-cat-input");
    inp.value = this._pendingCategory || "";
    const saveBtn = picker.querySelector(".add-cat-save");
    const newSave = saveBtn.cloneNode(true); saveBtn.replaceWith(newSave);
    newSave.addEventListener("click", () => {
      this._setAddCategory(inp.value.trim());
    });
    inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); newSave.click(); } };
    setTimeout(() => inp.focus(), 50);
  }

  _setAddCategory(cat) {
    this._pendingCategory = cat;
    const R = this.shadowRoot;
    const bar = R.querySelector(".pending-cat-bar");
    const btn = R.querySelector(".add-cat-btn");
    const picker = R.querySelector(".add-cat-picker");
    picker.style.display = "none";
    if (cat) {
      btn.classList.add("add-cat-active");
      bar.style.display = "flex";
      bar.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>` +
        `<span>${esc(cat)}</span><button class="pending-cat-clear" title="×">×</button>`;
      bar.querySelector(".pending-cat-clear").addEventListener("click", () => this._setAddCategory(""));
    } else {
      btn.classList.remove("add-cat-active");
      bar.style.display = "none";
      bar.innerHTML = "";
    }
  }

  /* ---------- copy list ---------- */

  async _copyList() {
    const active = this._sortItems(this._items.filter(i => i.status === "needs_action"));
    if (!active.length) return;
    const lines = active.map(i => {
      let line = `- ${i.name}`;
      const u = i.unit || this._t("pcs");
      if (i.quantity !== 1 || i.unit) line += ` ${i.quantity} ${u}`;
      if (i.category) line += ` [${i.category}]`;
      return line;
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      const btn = this.shadowRoot.querySelector(".copy-list-btn");
      btn.classList.add("hdr-on");
      setTimeout(() => btn.classList.remove("hdr-on"), 1500);
    } catch (_) {}
  }

  /* ---------- store mode ---------- */

  _enterStoreMode() {
    // Track totals for progress bar
    if (this._storeTotalItems == null) {
      this._storeTotalItems = this._items.filter(i => i.status === "needs_action").length;
    }
    const active = this._sortItems(this._items.filter(i => i.status === "needs_action"));
    const total = this._storeTotalItems;
    const done = total - active.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const overlay = document.createElement("div");
    overlay.className = "store-overlay";
    const catEnabled = this._getViewPref("show_categories");
    const showHeaders = this._getViewPref("show_category_headers");
    const showBadge = this._getViewPref("show_category_badge");

    // Count items per category for headers
    const catCounts = {};
    if (catEnabled && showHeaders) {
      for (const item of active) {
        const c = item.category || "";
        catCounts[c] = (catCounts[c] || 0) + 1;
      }
    }

    let listHtml = "";
    if (!active.length) {
      listHtml = `<div class="store-done">
        <svg viewBox="0 0 24 24" width="64" height="64"><path d="M5 13l4 4L19 7" fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div>${this._t("store_done")}</div>
      </div>`;
    } else {
      let lastCat = null;
      for (const item of active) {
        if (catEnabled && showHeaders && item.category !== lastCat) {
          const catLabel = item.category || this._t("other");
          const count = catCounts[item.category || ""] || 0;
          listHtml += `<div class="store-cat-header"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg> ${esc(catLabel)} <span class="store-cat-count">(${count})</span></div>`;
          lastCat = item.category;
        }
        const catBadge = (item.category && catEnabled && showBadge) ? `<span class="store-badge">${esc(item.category)}</span>` : "";
        const unitLabel = item.unit || this._t("pcs");
        const qtyBadge = `<span class="store-qty">${item.quantity} ${esc(unitLabel)}</span>`;
        const checkColor = this._config.check_color || "var(--primary-color)";
        listHtml += `<div class="store-item-wrap">
          <div class="store-sw-bg">
            <div class="store-sw-fill"></div>
            <div class="store-sw-threshold" style="left:${parseInt(this._config.swipe_threshold) || 50}%"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          </div>
          <div class="store-item" data-uid="${item.uid}">
            <span class="store-check"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M5 13l4 4L19 7" fill="none" stroke="${checkColor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <span class="store-name">${esc(item.name)}</span>${catBadge}${qtyBadge}
          </div>
        </div>`;
      }
    }

    const storeSize = localStorage.getItem("esl_store_size") || this._config.store_item_size || "normal";
    overlay.innerHTML = `
      <div class="store-header">
        <span class="store-title">${this._t("store_mode")}</span>
        <div class="store-size-picker">
          <button class="store-size-btn${storeSize === "compact" ? " store-size-active" : ""}" data-sz="compact"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="5" width="18" height="2.5" rx="1" fill="currentColor"/><rect x="3" y="10.75" width="18" height="2.5" rx="1" fill="currentColor"/><rect x="3" y="16.5" width="18" height="2.5" rx="1" fill="currentColor"/></svg></button>
          <button class="store-size-btn${storeSize === "normal" ? " store-size-active" : ""}" data-sz="normal"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="4" width="18" height="3" rx="1" fill="currentColor"/><rect x="3" y="10.5" width="18" height="3" rx="1" fill="currentColor"/><rect x="3" y="17" width="18" height="3" rx="1" fill="currentColor"/></svg></button>
          <button class="store-size-btn${storeSize === "comfortable" ? " store-size-active" : ""}" data-sz="comfortable"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="18" height="4" rx="1.5" fill="currentColor"/><rect x="3" y="10" width="18" height="4" rx="1.5" fill="currentColor"/><rect x="3" y="17" width="18" height="4" rx="1.5" fill="currentColor"/></svg></button>
        </div>
        <span class="store-counter">${active.length}</span>
        <button class="store-exit">${this._t("store_mode_exit")}</button>
      </div>
      <div class="store-progress-bar">
        <div class="store-progress-fill" style="width:${pct}%;background:${pct < 30 ? '#e53935' : pct < 60 ? '#ff9800' : pct < 90 ? '#ffc107' : '#4caf50'}"></div>
        <span class="store-progress-text">${done}/${total} ${this._t("store_progress")} (${pct}%)</span>
      </div>
      <div class="store-list store-sz-${storeSize}">${listHtml}</div>
      <div class="store-undo-toast" style="display:none">
        <span class="store-undo-text"></span>
        <button class="store-undo-btn">${this._t("store_undo")}</button>
      </div>`;

    this.shadowRoot.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("store-open"));

    overlay.querySelector(".store-exit").addEventListener("click", () => this._exitStoreMode());

    // Size picker
    overlay.querySelectorAll(".store-size-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const sz = btn.dataset.sz;
        localStorage.setItem("esl_store_size", sz);
        const list = overlay.querySelector(".store-list");
        list.className = `store-list store-sz-${sz}`;
        overlay.querySelectorAll(".store-size-btn").forEach(b => b.classList.remove("store-size-active"));
        btn.classList.add("store-size-active");
      });
    });

    // Auto-exit when all done
    if (!active.length && total > 0) {
      setTimeout(() => this._exitStoreMode(), 3500);
    }

    this._bindStoreSwipe(overlay);
  }

  _bindStoreSwipe(overlay) {
    overlay.querySelectorAll(".store-item").forEach(el => {
      const wrap = el.closest(".store-item-wrap");
      const fill = wrap.querySelector(".store-sw-fill");
      let ts = null, off = 0;
      el.addEventListener("pointerdown", e => {
        if (e.button !== 0) return;
        ts = { x: e.clientX, y: e.clientY, dir: null, id: e.pointerId };
        off = 0;
        wrap.classList.add("store-swiping");
      });
      el.addEventListener("pointermove", e => {
        if (!ts || ts.id !== e.pointerId) return;
        const dx = e.clientX - ts.x, dy = e.clientY - ts.y;
        if (!ts.dir) {
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
            ts.dir = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            if (ts.dir === "h") {
              try { el.setPointerCapture(e.pointerId); } catch(_) {}
            } else { ts = null; wrap.classList.remove("store-swiping"); return; }
          } else return;
        }
        if (ts.dir === "h") {
          off = Math.max(0, dx);
          const w = el.offsetWidth;
          const pct = Math.min(off / w, 1);
          el.style.transition = "none";
          el.style.transform = `translate3d(${off}px,0,0)`;
          fill.style.width = `${off}px`;
          if (pct >= this._swipeThreshold()) {
            wrap.classList.add("store-sw-ready");
          } else {
            wrap.classList.remove("store-sw-ready");
          }
        }
      });
      const resetSwipe = () => {
        wrap.classList.remove("store-swiping", "store-sw-ready");
        fill.style.width = "0";
      };
      const endSwipe = () => {
        if (!ts) return;
        const swThresh = el.offsetWidth * this._swipeThreshold();
        el.style.transition = "all 0.3s ease";
        if (off > swThresh) {
          el.style.transform = `translate3d(${el.offsetWidth}px,0,0)`;
          fill.style.transition = "width 0.3s ease";
          fill.style.width = "100%";
          const item = this._items.find(i => i.uid === el.dataset.uid);
          if (item) {
            // Haptic feedback
            try { navigator.vibrate(50); } catch(_) {}
            this._storeCompleteItem(item);
          }
        } else {
          el.style.transform = "";
          resetSwipe();
        }
        ts = null;
      };
      el.addEventListener("pointerup", endSwipe);
      el.addEventListener("pointercancel", () => {
        if (ts) { el.style.transition = "all 0.3s ease"; el.style.transform = ""; resetSwipe(); ts = null; }
      });
    });
  }

  async _storeCompleteItem(item) {
    await this._toggleComplete(item);
    // Show undo toast
    this._showStoreUndo(item);
    this._refreshStoreMode();
  }

  _showStoreUndo(item) {
    const overlay = this.shadowRoot.querySelector(".store-overlay");
    if (!overlay) return;
    const toast = overlay.querySelector(".store-undo-toast");
    if (!toast) return;
    clearTimeout(this._storeUndoTimer);
    toast.querySelector(".store-undo-text").textContent = `✓ ${item.name}`;
    toast.style.display = "flex";
    const btn = toast.querySelector(".store-undo-btn");
    const newBtn = btn.cloneNode(true); btn.replaceWith(newBtn);
    newBtn.addEventListener("click", async () => {
      toast.style.display = "none";
      clearTimeout(this._storeUndoTimer);
      // Find the completed item and revert
      const completed = this._items.find(i => i.uid === item.uid && i.status === "completed");
      if (completed) {
        await this._toggleComplete(completed);
        this._refreshStoreMode();
      }
    });
    this._storeUndoTimer = setTimeout(() => { toast.style.display = "none"; }, 4000);
  }

  _refreshStoreMode() {
    const overlay = this.shadowRoot.querySelector(".store-overlay");
    if (!overlay) return;
    overlay.remove();
    this._enterStoreMode();
  }

  _exitStoreMode() {
    const overlay = this.shadowRoot.querySelector(".store-overlay");
    if (!overlay) return;
    overlay.classList.remove("store-open");
    this._storeTotalItems = null;
    clearTimeout(this._storeUndoTimer);
    setTimeout(() => overlay.remove(), 250);
  }

  _updateLists() {
    const R = this.shadowRoot; if (!R) return;
    const active = this._sortItems(this._items.filter(i => i.status === "needs_action"));
    const completed = this._sortItems(this._items.filter(i => i.status === "completed"));
    R.querySelector(".active-count").textContent = active.length;
    R.querySelector(".completed-count").textContent = completed.length;
    const aList = R.querySelector(".active-list");
    const addBtn = R.querySelector(".add-btn");
    if (addBtn) addBtn.classList.toggle("add-btn-pulse", !active.length);
    if (!active.length) {
      aList.innerHTML = `<div class="empty-msg">${this._t("empty")}</div>`;
    } else {
      const catEnabled = this._getViewPref("show_categories");
      const showHeaders = this._getViewPref("show_category_headers");
      const hasAnyCat = catEnabled && active.some(i => i.category);
      let html = "";
      let lastCat = null;
      for (const item of active) {
        if (hasAnyCat && showHeaders) {
          const cat = item.category || "";
          if (cat !== lastCat) {
            if (cat) {
              html += `<div class="cat-header"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M10 3H4a1 1 0 00-1 1v6a1 1 0 001 1h1l5 5V3z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20.5 11.5L17 8l-3 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> ${esc(cat)}</div>`;
            } else {
              html += `<div class="cat-header cat-header-none">${this._t("other")}</div>`;
            }
            lastCat = cat;
          }
        }
        html += this._htmlActiveItem(item);
      }
      aList.innerHTML = html;
      if (this._knownUids.size > 0) {
        aList.querySelectorAll(".item-wrap").forEach(el => {
          const uid = el.dataset.uid;
          if (uid && !this._knownUids.has(uid)) el.classList.add("esl-new");
        });
      }
      active.forEach(i => this._knownUids.add(i.uid));
      this._bindItemEvents(aList, active, false);
    }
    const cSec = R.querySelector(".completed-section");
    cSec.style.display = completed.length ? "" : "none";
    const cList = R.querySelector(".completed-list");
    if (!completed.length) {
      cList.innerHTML = "";
    } else {
      const catEnabled = this._getViewPref("show_categories_done");
      const showHeaders = this._getViewPref("show_category_headers_done");
      const hasAnyCat = catEnabled && completed.some(i => i.category);
      let cHtml = "";
      let lastCatC = null;
      for (const item of completed) {
        if (hasAnyCat && showHeaders) {
          const cat = item.category || "";
          if (cat !== lastCatC) {
            if (cat) {
              cHtml += `<div class="cat-header"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M10 3H4a1 1 0 00-1 1v6a1 1 0 001 1h1l5 5V3z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20.5 11.5L17 8l-3 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> ${esc(cat)}</div>`;
            } else {
              cHtml += `<div class="cat-header cat-header-none">${this._t("other")}</div>`;
            }
            lastCatC = cat;
          }
        }
        cHtml += this._htmlCompletedItem(item);
      }
      cList.innerHTML = cHtml;
    }
    this._bindItemEvents(cList, completed, true);
    this._updateCompletedVis();
  }

  _updateCompletedVis() {
    const R = this.shadowRoot;
    const l = R.querySelector(".completed-list"), ch = R.querySelector(".chevron");
    if (l) {
      if (this._completedExpanded) {
        l.style.height = "";
        l.style.overflow = "";
      } else {
        l.style.height = "0";
        l.style.overflow = "hidden";
      }
    }
    if (ch) ch.classList.toggle("open", this._completedExpanded);
  }

  /* ---------- view preferences (localStorage-backed) ---------- */

  _getViewPref(key) {
    if (key in this._viewPrefs) return this._viewPrefs[key];
    const entity = this._config.entity || "default";
    const stored = localStorage.getItem(`esl_${entity}_${key}`);
    if (stored !== null) return stored === "true";
    switch (key) {
      case "show_categories": return this._config.show_categories !== false;
      case "show_category_badge": return this._config.show_category_badge !== false;
      case "show_category_headers": return this._config.show_category_headers !== false;
      case "show_notes": return this._config.show_notes !== false;
      case "show_categories_done": return this._config.show_categories !== false;
      case "show_category_badge_done": return this._config.show_category_badge !== false;
      case "show_category_headers_done": return this._config.show_category_headers !== false;
      default: return true;
    }
  }

  _toggleViewPref(key) {
    const val = !this._getViewPref(key);
    this._viewPrefs[key] = val;
    const entity = this._config.entity || "default";
    localStorage.setItem(`esl_${entity}_${key}`, String(val));
    this._updateHeaderToggles();
    this._updateLists();
  }

  _updateHeaderToggles() {
    const R = this.shadowRoot; if (!R) return;
    R.querySelectorAll(".hdr-toggle").forEach(btn => {
      const key = btn.dataset.toggle;
      btn.classList.toggle("hdr-on", this._getViewPref(key));
    });
  }

  _htmlActiveItem(item) {
    const showNotes = this._getViewPref("show_notes");
    const hn = item.notes ? " has-note" : "";
    const hc = item.category ? " has-cat" : "";
    const showBadge = this._getViewPref("show_category_badge");
    const catBadge = (item.category && showBadge)
      ? `<span class="cat-badge" data-action="edit-category">${esc(item.category)}</span>` : "";
    const notePreview = item.notes
      ? `<div class="note-preview" data-action="toggle-note">${esc(item.notes)}</div>` : "";
    return `
    <div class="item-wrap" data-uid="${item.uid}">
      <div class="swipe-row">
        <div class="sw-bg sw-right">
          <svg viewBox="0 0 24 24" width="22" height="22"><polyline points="4,12 10,18 20,6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="sw-threshold-line" style="left:${parseInt(this._config.swipe_threshold) || 50}%"></div>
        </div>
        <div class="sw-bg sw-left" data-action="swipe-delete"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
        <div class="item" data-uid="${item.uid}">
          <div class="chk" data-action="toggle"><div class="chk-inner"></div></div>
          <div class="item-body">
            <div class="item-name-row">
              <span class="item-name" data-action="edit-name">${esc(item.name)}</span>
              ${catBadge}
            </div>
            ${notePreview}
          </div>
          <button class="icon-btn cat-btn${hc}" data-action="edit-category" title="${item.category || this._t("category")}">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="${item.category ? "var(--primary-color)" : "none"}" stroke="${item.category ? "var(--primary-color)" : "var(--esl-icon-color)"}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="${item.category ? "#fff" : "var(--esl-icon-color)"}"/></svg>
          </button>
          ${showNotes ? `<button class="icon-btn${hn}" data-action="toggle-note" title="${item.notes ? esc(item.notes) : this._t("add_note")}">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="${item.notes ? "var(--primary-color)" : "none"}" stroke="${item.notes ? "var(--primary-color)" : "var(--esl-icon-color)"}" stroke-width="1.5"/><polyline points="14,2 14,8 20,8" fill="none" stroke="${item.notes ? "var(--primary-color)" : "var(--esl-icon-color)"}" stroke-width="1.5"/></svg>
          </button>` : ""}
          <div class="qty-area">
            <button class="qty-btn" data-action="qty-minus">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
            <span class="qty-val" data-action="edit-qty">${item.quantity}${item.unit ? " " + esc(item.unit) : ""}</span>
            <button class="qty-btn" data-action="qty-plus">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="note-editor" style="display:none">
        <textarea class="note-textarea" placeholder="${this._t("add_note_placeholder")}">${esc(item.notes || "")}</textarea>
        <div class="note-bar">
          <button class="note-save">${this._t("save")}</button>
        </div>
      </div>
      <div class="cat-editor" style="display:none">
        <div class="cat-chips"></div>
        <div class="cat-input-row">
          <input class="cat-input" type="text" placeholder="${this._t("new_category")}" value="${esc(item.category || "")}" />
          <button class="cat-save">${this._t("save")}</button>
          ${item.category ? `<button class="cat-remove">${this._t("remove")}</button>` : ""}
        </div>
      </div>
    </div>`;
  }

  _htmlCompletedItem(item) {
    const showBadge = this._getViewPref("show_category_badge_done");
    const catBadge = (item.category && showBadge)
      ? `<span class="cat-badge cat-badge-done">${esc(item.category)}</span>` : "";
    return `
    <div class="item-wrap" data-uid="${item.uid}">
      <div class="swipe-row">
        <div class="item completed-item" data-uid="${item.uid}">
          <div class="chk chk-done" data-action="toggle">
            <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="4,12 10,18 20,6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="item-body">
            <div class="item-name-row">
              <span class="item-name done-name">${esc(item.name)}</span>
              ${catBadge}
            </div>
            ${item.notes ? `<div class="note-preview done-note">${esc(item.notes)}</div>` : ""}
          </div>
          ${(item.quantity > 1 || item.unit) ? `<span class="done-qty">${item.quantity} ${esc(item.unit || this._t("pcs"))}</span>` : ""}
          <button class="icon-btn del-btn" data-action="delete" title="${this._t("remove_from_list")}">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12z" fill="none" stroke="var(--error-color,#e53935)" stroke-width="1.5" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }

  /* ---------- item events ---------- */

  _bindItemEvents(container, items, isCompleted) {
    container.querySelectorAll(".item-wrap").forEach(el => {
      const uid = el.dataset.uid;
      const item = items.find(i => i.uid === uid);
      if (!item) return;

      const itemEl = el.querySelector(".item");
      const swipeRow = el.querySelector(".swipe-row");

      swipeRow.addEventListener("click", e => {
        const a = e.target.closest("[data-action]");

        // Swipe-delete: revealed red area clicked → show confirmation
        if (a && a.dataset.action === "swipe-delete") {
          e.stopPropagation();
          this._showDeleteConfirm(item, el, itemEl, swipeRow);
          return;
        }

        // Confirmation button clicks
        if (e.target.closest(".dc-yes")) {
          e.stopPropagation(); return;
        }
        if (e.target.closest(".dc-no")) {
          e.stopPropagation(); return;
        }

        // If item is stuck (swiped), clicking item resets it
        if (swipeRow.classList.contains("swiping-left") && itemEl.style.transform) {
          itemEl.style.transition = "transform 0.25s ease";
          itemEl.style.transform = "";
          setTimeout(() => { swipeRow.className = "swipe-row"; }, 250);
          return;
        }

        if (!a) { if (isCompleted) this._toggleComplete(item); return; }
        e.stopPropagation();
        switch (a.dataset.action) {
          case "toggle": this._toggleComplete(item); break;
          case "edit-name": if (!isCompleted) this._startEditName(el, item); else this._toggleComplete(item); break;
          case "qty-minus": { const step = this._qtyStep(item.unit); this._updateQuantity(item, Math.round((item.quantity - step) * 100) / 100); break; }
          case "qty-plus": { const step = this._qtyStep(item.unit); this._updateQuantity(item, Math.round((item.quantity + step) * 100) / 100); break; }
          case "edit-qty": this._startEditQty(el, item); break;
          case "toggle-note": this._toggleNoteEditor(el, item); break;
          case "edit-category": if (!isCompleted) this._toggleCategoryEditor(el, item); break;
          case "delete": this._showDeleteConfirm(item, el, itemEl, swipeRow); break;
        }
      });

      // Direct click handler on delete area (mobile touch events often suppress
      // delegated clicks after swipe gestures, so we bind directly)
      const swLeft = swipeRow.querySelector(".sw-left");
      if (swLeft) {
        swLeft.addEventListener("click", (e) => {
          if (!swipeRow.classList.contains("swiping-left")) return;
          e.stopPropagation();
          this._showDeleteConfirm(item, el, itemEl, swipeRow);
        });
      }

      // Pointer-based swipe (works on both touch and mouse)
      let ts = null, off = 0;

      const resetOtherSwipes = () => {
        container.querySelectorAll(".item").forEach(o => { if (o !== itemEl) o.style.transform = ""; });
        container.querySelectorAll(".swipe-row").forEach(r => { if (r !== swipeRow) r.className = "swipe-row"; });
        // Also remove any lingering confirm overlays
        container.querySelectorAll(".delete-confirm").forEach(o => o.remove());
      };

      itemEl.addEventListener("pointerdown", e => {
        if (e.button !== 0) return;
        ts = { x: e.clientX, y: e.clientY, dir: null, id: e.pointerId };
        off = 0;
        resetOtherSwipes();
      });

      itemEl.addEventListener("pointermove", e => {
        if (!ts || ts.id !== e.pointerId) return;
        const dx = e.clientX - ts.x, dy = e.clientY - ts.y;
        if (!ts.dir) {
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
            ts.dir = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            if (ts.dir === "h") {
              try { itemEl.setPointerCapture(e.pointerId); } catch(_) {}
            } else { ts = null; return; }
          } else return;
        }
        if (ts.dir === "h") {
          off = isCompleted ? Math.min(0, dx) : dx;
          if (off > 0) {
            const pct = off / itemEl.offsetWidth;
            const th = this._swipeThreshold();
            const ready = pct >= th;
            swipeRow.className = "swipe-row swiping-right" + (ready ? " sw-ready" : "");
            const swRight = swipeRow.querySelector(".sw-right");
            if (swRight) swRight.style.background = ready ? "#43a047" : "#ff9800";
          } else if (off < 0) {
            swipeRow.className = "swipe-row swiping-left";
          }
          itemEl.style.transition = "none";
          itemEl.style.transform = `translate3d(${off}px,0,0)`;
        }
      });

      const resetSwBg = () => {
        const swRight = swipeRow.querySelector(".sw-right");
        if (swRight) swRight.style.background = "";
      };
      const endSwipe = () => {
        if (!ts) return;
        const swThresh = itemEl.offsetWidth * this._swipeThreshold();
        itemEl.style.transition = "transform 0.25s ease";
        if (off > swThresh && !isCompleted) {
          // Right swipe: complete
          itemEl.style.transform = "";
          swipeRow.className = "swipe-row"; resetSwBg();
          this._toggleComplete(item);
        } else if (off < -swThresh) {
          // Left swipe: show delete confirmation
          ts = null;
          itemEl.style.transform = "";
          swipeRow.className = "swipe-row"; resetSwBg();
          this._showDeleteConfirm(item, el, itemEl, swipeRow);
          return;
        } else {
          itemEl.style.transform = "";
          setTimeout(() => { swipeRow.className = "swipe-row"; resetSwBg(); }, 250);
        }
        ts = null;
      };
      itemEl.addEventListener("pointerup", endSwipe);
      itemEl.addEventListener("pointercancel", () => {
        if (ts) {
          itemEl.style.transition = "transform 0.25s ease"; itemEl.style.transform = "";
          setTimeout(() => { swipeRow.className = "swipe-row"; resetSwBg(); }, 250);
          ts = null;
        }
      });
    });
  }

  /* ---------- inline editors ---------- */

  _startEditName(wrap, item) {
    const el = wrap.querySelector(".item-name"); if (!el) return;
    const inp = document.createElement("input");
    inp.className = "inline-edit"; inp.type = "text"; inp.value = item.name;
    el.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const save = () => { if (done) return; done = true; const v = inp.value.trim();
      if (v && v !== item.name) this._updateName(item, v); else this._updateLists(); };
    inp.addEventListener("blur", save);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); if (e.key === "Escape") { done = true; this._updateLists(); } });
  }

  _startEditQty(wrap, item) {
    const el = wrap.querySelector(".qty-val"); if (!el) return;
    const UNITS = ["", "kg", "dag", "g", "l", "ml", "szt."];
    const container = document.createElement("div");
    container.className = "qty-editor-panel";
    const inp = document.createElement("input");
    inp.className = "inline-edit qty-edit"; inp.type = "number"; inp.min = "0.1"; inp.step = "any"; inp.value = String(item.quantity);
    container.appendChild(inp);
    const unitRow = document.createElement("div");
    unitRow.className = "unit-picker";
    const currentUnit = item.unit || "";
    unitRow.innerHTML = UNITS.map(u => {
      const label = u || this._t("pcs");
      const active = u === currentUnit ? " unit-active" : "";
      return `<button class="unit-btn${active}" data-unit="${u}">${esc(label)}</button>`;
    }).join("");
    container.appendChild(unitRow);
    el.replaceWith(container);
    inp.focus(); inp.select();
    let selectedUnit = currentUnit;
    unitRow.querySelectorAll(".unit-btn").forEach(btn => {
      btn.addEventListener("mousedown", e => { e.preventDefault(); });
      btn.addEventListener("click", () => {
        selectedUnit = btn.dataset.unit;
        unitRow.querySelectorAll(".unit-btn").forEach(b => b.classList.remove("unit-active"));
        btn.classList.add("unit-active");
      });
    });
    let done = false;
    const save = () => {
      if (done) return; done = true;
      const q = parseFloat(inp.value);
      if (!isNaN(q) && q > 0) this._updateQuantity(item, q, selectedUnit);
      else this._updateLists();
    };
    inp.addEventListener("blur", () => setTimeout(save, 150));
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  }

  _toggleNoteEditor(wrap, item) {
    const ed = wrap.querySelector(".note-editor"); if (!ed) return;
    const open = ed.style.display !== "none";
    // Close category editor if open
    const catEd = wrap.querySelector(".cat-editor");
    if (catEd) catEd.style.display = "none";
    ed.style.display = open ? "none" : "";
    if (!open) {
      const ta = ed.querySelector(".note-textarea");
      ta.focus();
      const save = () => {
        const v = ta.value;
        if (v !== (item.notes || "")) this._updateNotes(item, v);
        else ed.style.display = "none";
      };
      const btn = ed.querySelector(".note-save");
      const nb = btn.cloneNode(true); btn.replaceWith(nb);
      nb.addEventListener("click", save);
      ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } };
    }
  }

  _toggleCategoryEditor(wrap, item) {
    const ed = wrap.querySelector(".cat-editor"); if (!ed) return;
    const open = ed.style.display !== "none";
    // Close note editor if open
    const noteEd = wrap.querySelector(".note-editor");
    if (noteEd) noteEd.style.display = "none";
    ed.style.display = open ? "none" : "";
    if (!open) {
      const cats = this._getCategories();
      const chipsEl = ed.querySelector(".cat-chips");
      chipsEl.innerHTML = cats.map(c =>
        `<span class="cat-chip${c === item.category ? ' cat-chip-active' : ''}" data-cat="${esc(c)}">${esc(c)}</span>`
      ).join("");

      const inp = ed.querySelector(".cat-input");
      inp.value = item.category || "";
      setTimeout(() => inp.focus(), 50);

      // Bind chip clicks
      chipsEl.querySelectorAll(".cat-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          const cat = chip.dataset.cat;
          if (cat === item.category) {
            this._updateCategory(item, "");
          } else {
            this._updateCategory(item, cat);
          }
          ed.style.display = "none";
        });
      });

      // Save button
      const saveBtn = ed.querySelector(".cat-save");
      const newSave = saveBtn.cloneNode(true); saveBtn.replaceWith(newSave);
      newSave.addEventListener("click", () => {
        this._updateCategory(item, inp.value.trim());
        ed.style.display = "none";
      });
      inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); newSave.click(); } };

      // Remove button
      const removeBtn = ed.querySelector(".cat-remove");
      if (removeBtn) {
        const newRemove = removeBtn.cloneNode(true); removeBtn.replaceWith(newRemove);
        newRemove.addEventListener("click", () => {
          this._updateCategory(item, "");
          ed.style.display = "none";
        });
      }
    }
  }

  /* ---------- delete confirmation ---------- */

  _showDeleteConfirm(item, wrapEl, itemEl, swipeRow) {
    // Reset swipe state
    if (itemEl) { itemEl.style.transition = "transform 0.25s ease"; itemEl.style.transform = ""; }
    if (swipeRow) setTimeout(() => { swipeRow.className = "swipe-row"; }, 250);
    // Remove any existing confirm overlays in the card
    this.shadowRoot.querySelectorAll(".delete-confirm").forEach(o => o.remove());
    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "delete-confirm";
    overlay.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>
      <span class="dc-text">${this._t("confirm_delete")} <b>${esc(item.name)}</b>?</span>
      <button class="dc-yes">${this._t("yes")}</button>
      <button class="dc-no">${this._t("no")}</button>
    `;
    wrapEl.appendChild(overlay);
    overlay.querySelector(".dc-yes").addEventListener("click", (e) => {
      e.stopPropagation();
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.remove(); this._removeItem(item); }, 200);
    });
    overlay.querySelector(".dc-no").addEventListener("click", (e) => {
      e.stopPropagation();
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 200);
    });
  }

  /* ---------- suggestions ---------- */

  _updateSuggestions() {
    const q = (this._inputValue || "").trim();
    const box = this.shadowRoot.querySelector(".suggestions");
    if (q.length < 2) { this._hideSuggestions(); return; }
    const scored = this._items.map(i => ({ i, s: fuzzyScore(q, i.name) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    const seen = new Set(), uniq = [];
    for (const x of scored) { const k = stripDiacritics(x.i.name.toLowerCase()); if (!seen.has(k)) { seen.add(k); uniq.push(x); } }
    this._suggestions = uniq.slice(0, 7);
    if (!this._suggestions.length) { box.style.display = "none"; return; }
    box.style.display = "";
    box.innerHTML = this._suggestions.map(x => {
      const on = x.i.status === "needs_action";
      const badge = on ? `<span class="sg-badge">${x.i.quantity} ${esc(x.i.unit || this._t("pcs"))}</span>` : `<span class="sg-badge sg-done">${this._t("bought").toLowerCase()}</span>`;
      const catInfo = x.i.category ? `<span class="sg-cat">${esc(x.i.category)}</span>` : "";
      const checkColor = this._config.check_color || "var(--primary-color)";
      const checkIcon = `<svg class="sg-check" viewBox="0 0 24 24" width="22" height="22"><path d="M5 13l4 4L19 7" fill="none" stroke="${checkColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      return `<div class="sg-item" data-uid="${x.i.uid}">${checkIcon}<span class="sg-name">${esc(x.i.name)}</span>${catInfo}${badge}</div>`;
    }).join("");
    box.querySelectorAll(".sg-item").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        const it = this._items.find(i => i.uid === el.dataset.uid);
        if (it) this._selectSuggestion(it);
      });
    });
  }

  async _selectSuggestion(item) {
    if (item.status === "needs_action") this._updateQuantity(item, item.quantity + 1);
    else { await this._callService("update_item", { item: item.uid, status: "needs_action" }); await this._fetchItems(); }
    this._inputValue = "";
    const inp = this.shadowRoot.querySelector(".add-input");
    if (inp) inp.value = "";
    this._hideSuggestions();
  }

  /* ---------- CSS ---------- */

  static get CSS() {
    return `
      :host { --R: var(--ha-card-border-radius, 12px); }
      ha-card { overflow: visible; }
      .header {
        padding: 16px 20px 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .header-title { font-size: 20px; font-weight: 500; color: var(--primary-text-color); }
      .header-toggles { display: flex; gap: 2px; flex-shrink: 0; }
      .hdr-toggle {
        background: none; border: none; padding: 6px; cursor: pointer;
        border-radius: 8px; display: flex; align-items: center; justify-content: center;
        color: var(--disabled-text-color, #999); transition: all .15s; opacity: .5;
      }
      .hdr-toggle:hover { background: rgba(128,128,128,.12); opacity: .8; }
      .hdr-toggle.hdr-on { color: var(--primary-color); opacity: 1; }
      .store-mode-btn { opacity: 1 !important; padding: 5px; margin-right: 2px; color: #b71c1c !important; }
      .store-mode-btn:hover { color: #e53935 !important; }
      .hdr-toggle-sm { padding: 4px; }
      .hdr-toggle-sm svg { width: 14px; height: 14px; }
      .done-toggles { display: flex; align-items: center; gap: 1px; flex-shrink: 0; }
      .content { padding: 8px 12px 12px; }

      /* --- add --- */
      .add-section {
        position: relative; margin-bottom: 14px; padding: 10px;
        border: 1.5px solid var(--divider-color, rgba(127,127,127,.25));
        border-radius: var(--R); background: var(--secondary-background-color, rgba(127,127,127,.06));
      }
      .input-row { display: flex; align-items: center; gap: 10px; }
      .add-input {
        flex:1; padding: 13px 16px; border: 2px solid var(--divider-color,#ddd); border-radius: var(--R);
        background: var(--card-background-color,#fff); color: var(--primary-text-color);
        font-size: 16px; font-family: inherit; outline: none; transition: border-color .2s;
      }
      .add-input:focus { border-color: var(--primary-color); }
      .add-input::placeholder { color: var(--secondary-text-color); opacity: .6; }
      .add-cat-btn {
        background: none; border: 1.5px solid var(--divider-color,#ddd); padding: 0; cursor: pointer; display: flex;
        align-items: center; justify-content: center; width: 40px; height: 40px;
        flex-shrink: 0; border-radius: var(--R); transition: all .15s;
      }
      .add-cat-btn:hover { border-color: var(--primary-color); }
      .add-cat-btn.add-cat-active {
        border-color: var(--primary-color); background: rgba(var(--esl-active-rgb), 0.15);
      }
      .add-cat-btn.add-cat-active svg path, .add-cat-btn.add-cat-active svg circle {
        stroke: var(--primary-color); fill: var(--primary-color);
      }
      .pending-cat-bar {
        display: flex; align-items: center; gap: 6px; padding: 4px 8px; margin-top: 4px;
        font-size: 12px; color: var(--primary-color); font-weight: 600;
      }
      .pending-cat-clear {
        background: none; border: none; cursor: pointer; font-size: 16px; line-height: 1;
        color: var(--secondary-text-color); padding: 0 4px; font-weight: 700;
      }
      .pending-cat-clear:hover { color: var(--error-color, #e53935); }
      .add-cat-picker {
        padding: 10px 0 4px; border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.2));
        margin-bottom: 4px;
      }
      .add-btn {
        background: none; border: none; padding: 0; cursor: pointer; display: flex;
        align-items: center; justify-content: center; width: 40px; height: 40px;
        flex-shrink: 0; border-radius: 50%; transition: transform .15s;
      }
      .add-btn:hover { transform: scale(1.08); }
      .add-btn:active { transform: scale(.92); }
      .add-btn-pulse {
        animation: esl-pulse 1.5s ease-in-out infinite;
      }
      @keyframes esl-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); filter: brightness(1.2); }
      }

      /* --- suggestions --- */
      .suggestions {
        position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
        background: var(--secondary-background-color, #f5f5f5);
        border: 2px solid var(--primary-color); border-top: none;
        border-radius: 0 0 var(--R) var(--R);
        box-shadow: 0 8px 24px rgba(0,0,0,.25); overflow: hidden;
      }
      .sg-item {
        padding: 16px 16px; cursor: pointer; display: flex; align-items: center; gap: 12px;
        font-size: 19px; transition: background .12s; min-height: 56px; box-sizing: border-box;
        border-bottom: 1px solid var(--divider-color, rgba(127,127,127,.2));
      }
      .sg-item:last-child { border-bottom: none; }
      .sg-item:hover, .sg-item:active { background: rgba(var(--esl-active-rgb), 0.18); }
      .sg-check { flex-shrink: 0; opacity: 0.85; }
      .sg-name { flex: 1; font-weight: 500; }
      .sg-badge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background: var(--primary-color); color: #fff; white-space: nowrap;
      }
      .sg-done { background: var(--disabled-text-color,#999); }
      .sg-cat {
        font-size: 11px; padding: 2px 6px; border-radius: 6px;
        background: rgba(var(--esl-active-rgb), 0.15); color: var(--secondary-text-color);
        white-space: nowrap;
      }

      /* --- sections --- */
      .section { margin-bottom: 8px; }
      .section-title {
        font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px;
        color: var(--secondary-text-color); padding: 10px 0 6px; display: flex; align-items: center; gap: 6px;
      }
      .badge-count {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 20px; height: 20px; border-radius: 10px; padding: 0 6px;
        font-size: 11px; font-weight: 700; background: var(--primary-color); color: #fff;
      }
      .empty-msg { padding: 24px 0; text-align: center; color: var(--secondary-text-color); font-size: 14px; opacity: .6; }

      /* --- category group headers --- */
      .cat-header {
        display: flex; align-items: center; gap: 6px;
        font-size: 13px; font-weight: 600; color: var(--primary-color);
        padding: 14px 4px 6px; letter-spacing: .3px;
      }
      .cat-header svg { opacity: .7; }
      .cat-header-none { color: var(--secondary-text-color); }
      .active-list .cat-header:first-child { padding-top: 4px; }

      /* --- item tile --- */
      .item-wrap {
        position: relative; border-radius: var(--R); margin-bottom: 4px;
      }
      .item-wrap.esl-new {
        animation: esl-slide-in .35s ease-out;
      }
      @keyframes esl-slide-in {
        from { opacity: 0; transform: translateY(-12px) scale(.97); max-height: 0; }
        to { opacity: 1; transform: translateY(0) scale(1); max-height: 120px; }
      }
      .active-list .item-wrap:last-child,
      .completed-list .item-wrap:last-child { margin-bottom: 0; }
      .swipe-row {
        position: relative; border-radius: var(--R);
      }
      .sw-bg {
        position: absolute; top: 0; bottom: 0; width: 100%;
        display: flex; align-items: center;
        border-radius: var(--R);
        opacity: 0; transition: opacity .15s;
      }
      .swipe-row.swiping-right .sw-right { opacity: 1; }
      .swipe-row.swiping-left .sw-left { opacity: 1; }
      .sw-right { left: 0; background: #ff9800; padding-left: 18px; transition: background .15s; }
      .sw-ready .sw-right { background: #43a047; }
      .sw-threshold-line {
        position: absolute; top: 4px; bottom: 4px;
        border-left: 2px dashed rgba(255,255,255,.5);
        transform: translateX(-1px);
      }
      .sw-ready .sw-threshold-line {
        border-left-color: rgba(255,255,255,.9);
      }
      .sw-left { right: 0; background: #e53935; justify-content: flex-end; padding-right: 18px; cursor: pointer; }
      .item {
        position: relative; display: flex; align-items: center; gap: 8px;
        padding: 6px 10px; min-height: 48px;
        border-radius: var(--R);
        touch-action: pan-y; cursor: pointer;
      }
      .active-list .item {
        background-color: var(--esl-active-bg);
      }
      .completed-list .item {
        background-color: var(--esl-done-bg);
      }

      /* --- checkbox --- */
      .chk {
        width: 24px; height: 24px; min-width: 24px; border-radius: 50%;
        border: 2px solid var(--divider-color,#ccc); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all .2s; flex-shrink: 0;
      }
      .chk:hover { border-color: var(--primary-color); transform: scale(1.1); }
      .chk-inner {
        width: 0; height: 0; border-radius: 50%;
        background: var(--primary-color); transition: all .2s;
      }
      .chk:hover .chk-inner { width: 10px; height: 10px; }
      .chk-done {
        border-color: var(--primary-color); background: var(--primary-color);
      }

      /* --- item body --- */
      .item-body { flex: 1; min-width: 0; }
      .item-name-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .item-name {
        flex: 1; min-width: 0;
        font-size: 16px; font-weight: 500; color: var(--esl-text-color); cursor: pointer;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .cat-badge {
        font-size: 11px; padding: 2px 8px; border-radius: 8px;
        background: rgba(var(--esl-active-rgb), 0.25);
        color: var(--secondary-text-color); white-space: nowrap;
        cursor: pointer; flex-shrink: 0;
      }
      .cat-badge:hover { opacity: .8; }
      .cat-badge-done {
        background: rgba(var(--esl-done-rgb), 0.25);
        opacity: .6;
      }
      .note-preview {
        font-size: 14px; font-weight: 400; color: var(--secondary-text-color);
        opacity: .7; margin-top: 2px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;
      }
      .done-name { text-decoration: line-through; opacity: .5; }
      .done-note { opacity: .4; }
      .done-qty { font-size: 13px; color: var(--secondary-text-color); opacity: .6; white-space: nowrap; margin-right: 4px; }
      .completed-item { opacity: .7; }

      /* --- quantity --- */
      .qty-area { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .qty-btn {
        width: 26px; height: 26px; border-radius: 50%; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; padding: 0;
        background: var(--primary-color); color: #fff;
        transition: all .15s ease;
      }
      .qty-btn:hover { opacity: .85; transform: scale(1.1); }
      .qty-btn:active { transform: scale(.9); }
      .qty-val {
        min-width: 18px; text-align: center; font-size: 15px; font-weight: 700;
        cursor: pointer; color: var(--esl-text-color); user-select: none;
      }

      /* --- icon buttons --- */
      .icon-btn {
        background: none; border: none; padding: 4px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%; transition: background .15s; flex-shrink: 0;
        opacity: .65;
      }
      .icon-btn:hover { background: rgba(128,128,128,.15); opacity: 1; }
      .icon-btn.has-note, .icon-btn.has-cat { opacity: 1; }
      .cat-btn { opacity: .55; }
      .cat-btn.has-cat { opacity: 1; }
      .del-btn { opacity: .5; }
      .del-btn:hover { background: rgba(229,57,53,.15); opacity: 1; }

      /* --- inline edit --- */
      .inline-edit {
        font-size: 15px; border: 1.5px solid var(--primary-color); border-radius: 6px;
        padding: 4px 8px; background: var(--card-background-color,#fff); color: var(--primary-text-color);
        font-family: inherit; outline: none; width: 100%; box-sizing: border-box;
      }
      .qty-edit { width: 56px; text-align: center; -moz-appearance: textfield; }
      .qty-edit::-webkit-inner-spin-button, .qty-edit::-webkit-outer-spin-button { -webkit-appearance: none; }
      .qty-editor-panel { display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .unit-picker {
        display: flex; gap: 3px; flex-wrap: wrap; justify-content: center;
      }
      .unit-btn {
        padding: 3px 8px; border: 1.5px solid var(--divider-color, #ddd); border-radius: 6px;
        background: transparent; color: var(--secondary-text-color); font-size: 11px;
        cursor: pointer; transition: all .12s; font-weight: 600;
      }
      .unit-btn:hover { border-color: var(--primary-color); color: var(--primary-color); }
      .unit-active {
        background: var(--primary-color); color: #fff !important;
        border-color: var(--primary-color);
      }

      /* --- note editor --- */
      .note-editor {
        padding: 8px 14px 12px 52px;
        background: transparent;
      }
      .note-textarea {
        width: 100%; box-sizing: border-box; padding: 8px 10px;
        border: 1.5px solid var(--divider-color,#ddd); border-radius: 8px;
        background: var(--secondary-background-color,#f8f8f8); color: var(--primary-text-color);
        font-size: 13px; font-family: inherit; outline: none;
        resize: vertical; min-height: 40px; max-height: 120px; transition: border-color .2s;
      }
      .note-textarea:focus { border-color: var(--primary-color); }
      .note-bar { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
      .note-save {
        padding: 6px 16px; border-radius: 8px; border: none; font-size: 13px;
        cursor: pointer; font-weight: 600;
        background: var(--primary-color); color: #fff; transition: opacity .15s;
      }
      .note-save:hover { opacity: .85; }

      /* --- category editor --- */
      .cat-editor {
        padding: 8px 14px 12px 52px;
        background: transparent;
      }
      .cat-chips {
        display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;
      }
      .cat-chip {
        font-size: 13px; padding: 5px 12px; border-radius: 16px; cursor: pointer;
        background: rgba(var(--esl-active-rgb), 0.15);
        color: var(--primary-text-color); transition: all .15s;
        border: 1.5px solid transparent;
      }
      .cat-chip:hover { background: rgba(var(--esl-active-rgb), 0.30); }
      .cat-chip-active {
        background: var(--primary-color); color: #fff;
        border-color: var(--primary-color);
      }
      .cat-input-row { display: flex; gap: 8px; align-items: center; }
      .cat-input {
        flex: 1; padding: 8px 10px;
        border: 1.5px solid var(--divider-color,#ddd); border-radius: 8px;
        background: var(--secondary-background-color,#f8f8f8); color: var(--primary-text-color);
        font-size: 13px; font-family: inherit; outline: none; transition: border-color .2s;
      }
      .cat-input:focus { border-color: var(--primary-color); }
      .cat-save, .cat-remove {
        padding: 6px 14px; border-radius: 8px; border: none; font-size: 13px;
        cursor: pointer; font-weight: 600; transition: opacity .15s; white-space: nowrap;
      }
      .cat-save { background: var(--primary-color); color: #fff; }
      .cat-save:hover { opacity: .85; }
      .cat-remove { background: rgba(229,57,53,.15); color: var(--error-color,#e53935); }
      .cat-remove:hover { background: rgba(229,57,53,.25); }

      /* --- completed section --- */
      .completed-header {
        display: flex; align-items: center; justify-content: space-between;
        cursor: pointer; user-select: none;
      }
      .chevron { display: inline-block; font-size: 10px; transition: transform .25s; margin-left: 4px; }
      .chevron.open { transform: rotate(180deg); }
      .clear-all-btn {
        background: none; border: none; padding: 6px; cursor: pointer; border-radius: 8px;
        display: flex; align-items: center; transition: background .12s; color: var(--secondary-text-color);
      }
      .clear-all-btn:hover { background: var(--secondary-background-color,#f0f0f0); }
      .confirm-bar {
        display: flex; align-items: center; gap: 8px; padding: 12px 14px;
        background: var(--secondary-background-color,#f5f5f5); border-radius: var(--R);
        margin-bottom: 8px; font-size: 14px;
      }
      .confirm-bar span { flex: 1; }
      .btn-yes, .btn-no {
        padding: 6px 14px; border-radius: 8px; border: none; font-size: 13px;
        cursor: pointer; font-weight: 600;
      }
      .btn-yes { background: #e53935; color: #fff; }
      .btn-no { background: var(--divider-color,#ddd); color: var(--primary-text-color); }

      .completed-list { animation: fadeIn .2s ease; }
      @keyframes fadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }

      /* --- delete confirmation overlay --- */
      .delete-confirm {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(229,57,53,0.92); border-radius: var(--R);
        display: flex; align-items: center; justify-content: center; gap: 10px;
        z-index: 10; animation: fadeIn .15s ease;
        padding: 0 12px; box-sizing: border-box;
        transition: opacity .2s;
      }
      .delete-confirm svg { flex-shrink: 0; }
      .dc-text {
        color: #fff; font-size: 13px; font-weight: 500;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        flex: 1; min-width: 0;
      }
      .dc-yes, .dc-no {
        padding: 7px 16px; border-radius: 8px; border: none;
        font-size: 13px; font-weight: 700; cursor: pointer;
        white-space: nowrap; flex-shrink: 0; transition: opacity .12s;
      }
      .dc-yes { background: #fff; color: #e53935; }
      .dc-yes:hover { opacity: .85; }
      .dc-no { background: rgba(255,255,255,.2); color: #fff; }
      .dc-no:hover { background: rgba(255,255,255,.35); }

      /* --- compact size --- */
      .size-compact .item { padding: 2px 8px; min-height: 36px; gap: 6px; }
      .size-compact .item-name { font-size: 14px; }
      .size-compact .chk { width: 20px; height: 20px; min-width: 20px; }
      .size-compact .chk-done svg { width: 13px; height: 13px; }
      .size-compact .qty-btn { width: 22px; height: 22px; }
      .size-compact .qty-btn svg { width: 12px; height: 12px; }
      .size-compact .qty-val { font-size: 13px; min-width: 14px; }
      .size-compact .icon-btn { padding: 2px; }
      .size-compact .icon-btn svg { width: 17px; height: 17px; }
      .size-compact .item-wrap { margin-bottom: 2px; }
      .size-compact .cat-badge { font-size: 10px; padding: 1px 6px; }
      .size-compact .note-preview { font-size: 12px; }
      .size-compact .cat-header { padding: 10px 4px 4px; font-size: 12px; }
      .size-compact .done-qty { font-size: 12px; }

      /* --- comfortable size --- */
      .size-comfortable .item { padding: 10px 14px; min-height: 58px; gap: 10px; }
      .size-comfortable .item-name { font-size: 17px; }
      .size-comfortable .chk { width: 28px; height: 28px; min-width: 28px; }
      .size-comfortable .qty-btn { width: 30px; height: 30px; }
      .size-comfortable .qty-btn svg { width: 16px; height: 16px; }
      .size-comfortable .qty-val { font-size: 17px; min-width: 22px; }
      .size-comfortable .icon-btn { padding: 6px; }
      .size-comfortable .icon-btn svg { width: 22px; height: 22px; }
      .size-comfortable .item-wrap { margin-bottom: 6px; }
      .size-comfortable .cat-badge { font-size: 12px; padding: 3px 10px; }
      .size-comfortable .note-preview { font-size: 15px; }
      .size-comfortable .cat-header { padding: 16px 4px 8px; font-size: 14px; }
      .size-comfortable .done-qty { font-size: 14px; }

      @media (max-width: 500px) {
        .content { padding: 6px 8px 10px; }
        .item { gap: 6px; padding: 4px 8px; }
        .icon-btn { padding: 3px; }
        .icon-btn svg { width: 18px; height: 18px; }
        .qty-btn { width: 24px; height: 24px; }
        .qty-btn svg { width: 12px; height: 12px; }
        .cat-editor, .note-editor { padding-left: 36px; }
        /* compact stays compact on mobile */
        .size-compact .item { padding: 2px 6px; }
        /* comfortable tones down slightly on mobile */
        .size-comfortable .item { padding: 8px 10px; min-height: 52px; }
      }

      /* --- store mode overlay --- */
      .store-overlay {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999;
        background: var(--primary-background-color, #111);
        color: var(--primary-text-color, #fff);
        display: flex; flex-direction: column;
        opacity: 0; transition: opacity .25s ease;
        overflow: hidden;
      }
      .store-overlay.store-open { opacity: 1; }
      .store-header {
        display: flex; align-items: center; gap: 12px;
        padding: 16px 20px; flex-shrink: 0;
        border-bottom: 2px solid var(--divider-color, rgba(127,127,127,.2));
      }
      .store-title {
        font-size: 22px; font-weight: 700; flex: 1;
      }
      .store-size-picker {
        display: flex; gap: 4px; background: rgba(127,127,127,.15);
        border-radius: 8px; padding: 2px;
      }
      .store-size-btn {
        padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;
        background: transparent; color: var(--secondary-text-color);
        transition: all .15s; display: flex; align-items: center;
      }
      .store-size-btn:hover { background: rgba(127,127,127,.15); }
      .store-size-active {
        background: var(--primary-color) !important; color: #fff !important;
      }
      .store-sz-compact .store-item { padding: 8px 12px; min-height: 36px; }
      .store-sz-compact .store-item-wrap { margin: 2px 0; }
      .store-sz-compact .store-name { font-size: 16px; }
      .store-sz-compact .store-check svg { width: 22px; height: 22px; }
      .store-sz-compact .store-cat-header { padding: 12px 8px 4px; font-size: 12px; }
      .store-sz-comfortable .store-item { padding: 18px 16px; min-height: 64px; }
      .store-sz-comfortable .store-item-wrap { margin: 6px 0; }
      .store-sz-comfortable .store-name { font-size: 22px; }
      .store-sz-comfortable .store-check svg { width: 32px; height: 32px; }
      .store-counter {
        font-size: 18px; font-weight: 700; padding: 4px 14px;
        border-radius: 20px; background: var(--primary-color); color: #fff;
      }
      .store-exit {
        padding: 10px 24px; border-radius: 10px; border: 2px solid var(--divider-color,#555);
        background: transparent; color: var(--primary-text-color); font-size: 16px;
        font-weight: 600; cursor: pointer; transition: all .15s;
      }
      .store-exit:hover { border-color: var(--primary-color); color: var(--primary-color); }
      .store-progress-bar {
        position: relative; height: 36px; margin: 0 16px 10px;
        background: rgba(127,127,127,.25); border-radius: 18px; overflow: hidden;
        flex-shrink: 0; border: 2px solid rgba(127,127,127,.2);
      }
      .store-progress-fill {
        position: absolute; top: 0; left: 0; bottom: 0;
        border-radius: 18px; transition: width .5s ease, background .5s ease;
        min-width: 8px;
      }
      .store-progress-text {
        position: absolute; inset: 0; display: flex; align-items: center;
        justify-content: center; font-size: 13px; font-weight: 700;
        color: var(--primary-text-color); text-shadow: 0 0 4px var(--primary-background-color, #000), 0 0 4px var(--primary-background-color, #000);
      }
      .store-list {
        flex: 1; overflow-y: auto; padding: 8px 12px;
        -webkit-overflow-scrolling: touch;
      }
      .store-cat-header {
        display: flex; align-items: center; gap: 8px;
        padding: 18px 8px 8px; font-size: 14px; font-weight: 700;
        text-transform: uppercase; letter-spacing: .6px;
        color: var(--secondary-text-color); opacity: .8;
      }
      .store-cat-count { font-weight: 400; opacity: .7; }
      .store-item-wrap {
        position: relative; margin: 4px 0; border-radius: 14px; overflow: hidden;
      }
      .store-sw-bg {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        border-radius: 14px; overflow: hidden; display: none;
      }
      .store-swiping .store-sw-bg { display: block; }
      .store-sw-fill {
        position: absolute; top: 0; left: 0; bottom: 0; width: 0;
        background: rgba(255, 152, 0, 0.4);
        transition: none;
      }
      .store-sw-ready .store-sw-fill {
        background: rgba(76, 175, 80, 0.55);
      }
      .store-sw-threshold {
        position: absolute; top: 0; bottom: 0;
        transform: translateX(-50%);
        display: flex; align-items: center; justify-content: center;
        opacity: 0.3;
        border-left: 2px dashed rgba(255,255,255,.4);
        padding-left: 8px;
      }
      .store-sw-ready .store-sw-threshold {
        opacity: 1;
      }
      .store-sw-ready .store-sw-threshold svg path {
        stroke: #4caf50;
      }
      .store-item {
        position: relative;
        display: flex; align-items: center; gap: 16px;
        padding: 12px 16px; border-radius: 14px;
        background: var(--esl-active-bg);
        cursor: pointer; transition: all .3s ease;
        min-height: 48px; box-sizing: border-box;
        user-select: none; -webkit-user-select: none;
        border: 1.5px solid transparent;
        touch-action: pan-y;
      }
      .store-check { flex-shrink: 0; display: flex; }
      .store-name { flex: 1; font-size: 20px; font-weight: 500; }
      .store-badge {
        font-size: 12px; padding: 3px 10px; border-radius: 10px;
        background: rgba(var(--esl-active-rgb), 0.25);
        color: var(--secondary-text-color); white-space: nowrap;
      }
      .store-qty {
        font-size: 14px; font-weight: 700; padding: 4px 12px;
        border-radius: 10px; background: var(--primary-color); color: #fff;
        white-space: nowrap;
      }
      .store-done {
        text-align: center; padding: 60px 20px;
        font-size: 24px; font-weight: 600; opacity: .8;
        display: flex; flex-direction: column; align-items: center; gap: 16px;
      }
      .store-done svg {
        animation: store-done-pop .5s ease;
      }
      @keyframes store-done-pop {
        0% { transform: scale(0); } 50% { transform: scale(1.2); } 100% { transform: scale(1); }
      }
      .store-undo-toast {
        position: absolute; bottom: 24px; left: 20px; right: 20px;
        display: flex; align-items: center; gap: 12px;
        padding: 14px 18px; border-radius: 14px;
        background: var(--card-background-color, #333);
        box-shadow: 0 6px 24px rgba(0,0,0,.4);
        font-size: 16px; font-weight: 500;
        animation: store-toast-in .25s ease;
      }
      @keyframes store-toast-in {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .store-undo-text { flex: 1; color: var(--primary-text-color); }
      .store-undo-btn {
        padding: 8px 20px; border-radius: 10px; border: none;
        background: var(--primary-color); color: #fff;
        font-size: 15px; font-weight: 700; cursor: pointer;
        transition: opacity .15s;
      }
      .store-undo-btn:hover { opacity: .85; }
    `;
  }
}

/* ------------------------------------------------------------------ */
/*  Editor — plain <select> for entity (works everywhere)              */
/* ------------------------------------------------------------------ */
class EnhancedShoppingListCardEditor extends HTMLElement {
  constructor() { super(); this._config = {}; this._hass = null; }
  _t(key) { return getStrings(this._hass?.language)[key] || key; }

  set hass(hass) {
    this._hass = hass;
    this._populateEntities();
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _populateEntities() {
    const sel = this.querySelector("#esl-entity");
    if (!sel || !this._hass) return;
    const ents = Object.keys(this._hass.states).filter(e => e.startsWith("todo.")).sort();
    const cur = this._config.entity || "";
    sel.innerHTML = `<option value="">${this._t("ed_choose_entity")}</option>` +
      ents.map(e => {
        const fn = this._hass.states[e].attributes.friendly_name || e;
        return `<option value="${e}"${e === cur ? " selected" : ""}>${fn} (${e})</option>`;
      }).join("");
  }

  _render() {
    const PALETTE = [
      "#2196f3","#1976d2","#0d47a1","#03a9f4","#00bcd4","#009688",
      "#4caf50","#43a047","#2e7d32","#8bc34a","#cddc39","#ffeb3b",
      "#ffc107","#ff9800","#ff5722","#f44336","#e53935","#b71c1c",
      "#9c27b0","#7b1fa2","#673ab7","#3f51b5","#607d8b","#795548",
    ];
    const activeColor = this._config.color_active || "#2196f3";
    const doneColor = this._config.color_completed || "#4caf50";
    const textColor = this._config.text_color || "";
    const iconColor = this._config.icon_color || "";
    const checkColor = this._config.check_color || "";
    const showCat = this._config.show_categories !== false;
    const showBadge = this._config.show_category_badge !== false;
    const showHeaders = this._config.show_category_headers !== false;
    const showNotes = this._config.show_notes !== false;
    const itemSize = this._config.item_size || "normal";

    this.innerHTML = `
      <style>
        .esl-ed { padding: 16px; }
        .esl-ed .row { margin-bottom: 16px; }
        .esl-ed label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; color: var(--primary-text-color); }
        .esl-ed select, .esl-ed input[type="text"] {
          width: 100%; box-sizing: border-box; padding: 10px 12px;
          border: 1.5px solid var(--divider-color,#ddd);
          border-radius: var(--ha-card-border-radius, 12px);
          background: var(--card-background-color,#fff); color: var(--primary-text-color);
          font-family: inherit; font-size: 14px;
        }
        .esl-ed .sep { border: none; border-top: 1px solid var(--divider-color,#ddd); margin: 16px 0 12px; }
        .ed-section-header {
          font-size: 13px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .8px; color: var(--primary-color);
          padding: 4px 0 8px; margin-top: 2px;
        }
        /* --- swatch color picker --- */
        .color-section { margin-top: 4px; }
        .color-swatches {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr)); gap: 4px; margin-bottom: 8px;
        }
        .color-swatch {
          width: 100%; aspect-ratio: 1; border-radius: 6px; border: 2px solid transparent;
          cursor: pointer; transition: transform .12s, border-color .12s;
        }
        .color-swatch:hover { transform: scale(1.12); }
        .color-swatch.active { border-color: var(--primary-text-color); transform: scale(1.12); }
        .color-swatch-none {
          background: var(--card-background-color, #fff) !important;
          border: 2.5px dashed var(--divider-color, #ccc);
          position: relative; overflow: hidden;
        }
        .color-swatch-none::after {
          content: ""; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: repeating-linear-gradient(
            135deg, transparent, transparent 45%, var(--divider-color, #ccc) 45%, var(--divider-color, #ccc) 55%, transparent 55%
          );
          opacity: .5;
        }
        .color-swatch-none.active { border-color: var(--primary-text-color); border-style: solid; }
        .color-hex-row { display: flex; align-items: center; gap: 8px; }
        .color-hex-input {
          flex: 1; padding: 6px 10px; font-size: 14px; font-family: monospace;
          border: 1.5px solid var(--divider-color,#ddd); border-radius: 8px;
          background: var(--card-background-color,#fff); color: var(--primary-text-color);
          outline: none; box-sizing: border-box;
        }
        .color-hex-input:focus { border-color: var(--primary-color); }
        .color-current {
          width: 36px; height: 36px; border-radius: 8px; flex-shrink: 0;
          border: 1.5px solid var(--divider-color,#ddd);
        }
        /* --- checkbox row --- */
        .check-row {
          display: flex; align-items: center; gap: 10px; padding: 8px 0; cursor: pointer;
          user-select: none;
        }
        .check-row input[type="checkbox"] {
          width: 20px; height: 20px; accent-color: var(--primary-color);
          cursor: pointer; flex-shrink: 0;
        }
        .check-label { font-size: 14px; color: var(--primary-text-color); }
        /* --- category order --- */
        .cat-order-section { margin-top: 10px; }
        .cat-order-section label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; color: var(--secondary-text-color); }
        .cat-order-list { display: flex; flex-direction: column; gap: 4px; }
        .cat-order-empty { font-size: 13px; color: var(--secondary-text-color); opacity: .6; padding: 6px 0; }
        .cat-order-item {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 10px; border-radius: 8px;
          background: var(--secondary-background-color, #f5f5f5);
          font-size: 14px; color: var(--primary-text-color);
        }
        .cat-order-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-order-num { font-size: 11px; color: var(--secondary-text-color); opacity: .6; min-width: 16px; text-align: center; }
        .cat-order-btn {
          background: none; border: none; padding: 6px 8px; cursor: pointer;
          color: var(--secondary-text-color); border-radius: 6px;
          display: flex; align-items: center; transition: all .12s;
          min-width: 32px; min-height: 32px; justify-content: center;
        }
        .cat-order-btn:hover { background: rgba(128,128,128,.15); color: var(--primary-text-color); }
        .cat-order-btn:disabled { opacity: .2; cursor: default; }
        .cat-order-btn:disabled:hover { background: none; }
        .cat-edit-btn { min-width: 28px; min-height: 28px; padding: 4px 6px; }
        .cat-edit-btn:hover { color: var(--primary-color); }
        .cat-rename-input {
          width: 100%; padding: 4px 8px; border: 2px solid var(--primary-color);
          border-radius: 6px; font-size: 14px; font-family: inherit;
          background: var(--card-background-color, #fff); color: var(--primary-text-color);
          outline: none;
        }
        /* --- size picker --- */
        .threshold-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
        .threshold-row input[type="range"] { flex: 1; accent-color: var(--primary-color); }
        .threshold-val { font-weight: 700; font-size: 14px; min-width: 36px; text-align: center; }
        .size-picker { display: flex; gap: 8px; margin-top: 4px; }
        .size-btn {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 10px 6px; border-radius: 10px; cursor: pointer;
          border: 2px solid var(--divider-color, #ddd);
          background: var(--card-background-color, #fff);
          color: var(--secondary-text-color); font-size: 12px; font-family: inherit;
          transition: all .15s;
        }
        .size-btn:hover { border-color: var(--primary-color); opacity: .85; }
        .size-btn.size-active {
          border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 33,150,243), 0.08);
          color: var(--primary-color); font-weight: 600;
        }
      </style>
      <div class="esl-ed">
        <div class="row">
          <label>${this._t("ed_entity")}</label>
          <select id="esl-entity"><option value="">${this._t("ed_choose_entity")}</option></select>
        </div>
        <div class="row">
          <label>${this._t("ed_title")}</label>
          <input type="text" id="esl-title" value="${(this._config.title || "").replace(/"/g, "&quot;")}" placeholder="${this._t("default_title")}" />
        </div>
        <div class="row">
          <label>${this._t("ed_sort")}</label>
          <select id="esl-sort">
            <option value="manual"${!this._config.sort_by || this._config.sort_by === "manual" ? " selected" : ""}>${this._t("ed_sort_manual")}</option>
            <option value="alphabetical"${this._config.sort_by === "alphabetical" ? " selected" : ""}>${this._t("ed_sort_alpha")}</option>
          </select>
        </div>
        <hr class="sep"/>
        <div class="row">
          <label>${this._t("ed_color_active")}</label>
          <div class="color-section" id="esl-cp-active">
            <div class="color-swatches">
              <div class="color-swatch color-swatch-none${activeColor === 'none' ? ' active' : ''}" data-color="none" title="${this._t("ed_color_none")}"></div>
              ${PALETTE.map(c => `<div class="color-swatch${c === activeColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join("")}
            </div>
            <div class="color-hex-row">
              <div class="color-current" id="esl-cur-active" style="background:${activeColor === 'none' ? 'var(--card-background-color,#fff)' : activeColor}"></div>
              <input class="color-hex-input" id="esl-hex-active" type="text" value="${activeColor}" maxlength="7" placeholder="${this._t("ed_hex_placeholder")}" />
            </div>
          </div>
        </div>
        <div class="row">
          <label>${this._t("ed_color_done")}</label>
          <div class="color-section" id="esl-cp-done">
            <div class="color-swatches">
              <div class="color-swatch color-swatch-none${doneColor === 'none' ? ' active' : ''}" data-color="none" title="${this._t("ed_color_none")}"></div>
              ${PALETTE.map(c => `<div class="color-swatch${c === doneColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join("")}
            </div>
            <div class="color-hex-row">
              <div class="color-current" id="esl-cur-done" style="background:${doneColor === 'none' ? 'var(--card-background-color,#fff)' : doneColor}"></div>
              <input class="color-hex-input" id="esl-hex-done" type="text" value="${doneColor}" maxlength="7" placeholder="${this._t("ed_hex_placeholder")}" />
            </div>
          </div>
        </div>
        <hr class="sep"/>
        <div class="row">
          <label>${this._t("ed_text_color")}</label>
          <div class="color-section" id="esl-cp-text">
            <div class="color-swatches">
              <div class="color-swatch color-swatch-none${!textColor ? ' active' : ''}" data-color="" title="${this._t("ed_auto")}"></div>
              ${PALETTE.map(c => `<div class="color-swatch${c === textColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join("")}
            </div>
            <div class="color-hex-row">
              <div class="color-current" id="esl-cur-text" style="background:${textColor || 'var(--primary-text-color)'}"></div>
              <input class="color-hex-input" id="esl-hex-text" type="text" value="${textColor || this._t("ed_auto")}" placeholder="${this._t("ed_auto_placeholder")}" />
            </div>
          </div>
        </div>
        <div class="row">
          <label>${this._t("ed_icon_color")}</label>
          <div class="color-section" id="esl-cp-icon">
            <div class="color-swatches">
              <div class="color-swatch color-swatch-none${!iconColor ? ' active' : ''}" data-color="" title="${this._t("ed_auto")}"></div>
              ${PALETTE.map(c => `<div class="color-swatch${c === iconColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join("")}
            </div>
            <div class="color-hex-row">
              <div class="color-current" id="esl-cur-icon" style="background:${iconColor || 'var(--secondary-text-color)'}"></div>
              <input class="color-hex-input" id="esl-hex-icon" type="text" value="${iconColor || this._t("ed_auto")}" placeholder="${this._t("ed_auto_placeholder")}" />
            </div>
          </div>
        </div>
        <div class="row">
          <label>${this._t("ed_check_color")}</label>
          <div class="color-section" id="esl-cp-check">
            <div class="color-swatches">
              <div class="color-swatch color-swatch-none${!checkColor ? ' active' : ''}" data-color="" title="${this._t("ed_auto")}"></div>
              ${PALETTE.map(c => `<div class="color-swatch${c === checkColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join("")}
            </div>
            <div class="color-hex-row">
              <div class="color-current" id="esl-cur-check" style="background:${checkColor || 'var(--primary-color)'}"></div>
              <input class="color-hex-input" id="esl-hex-check" type="text" value="${checkColor || this._t("ed_auto")}" placeholder="${this._t("ed_auto_placeholder")}" />
            </div>
          </div>
        </div>
        <hr class="sep"/>
        <div class="row">
          <label>${this._t("ed_categories")}</label>
          <div class="check-row" id="esl-chk-cat-row">
            <input type="checkbox" id="esl-chk-cat" ${showCat ? "checked" : ""} />
            <span class="check-label">${this._t("ed_group_sort")}</span>
          </div>
          <div class="check-row" id="esl-chk-badge-row">
            <input type="checkbox" id="esl-chk-badge" ${showBadge ? "checked" : ""} />
            <span class="check-label">${this._t("ed_show_badge")}</span>
          </div>
          <div class="check-row" id="esl-chk-headers-row">
            <input type="checkbox" id="esl-chk-headers" ${showHeaders ? "checked" : ""} />
            <span class="check-label">${this._t("ed_show_headers")}</span>
          </div>
          <div class="cat-order-section">
            <label>${this._t("ed_cat_order")}</label>
            <div class="cat-order-list" id="esl-cat-order"></div>
          </div>
        </div>
        <hr class="sep"/>
        <div class="ed-section-header">${this._t("ed_section_standard")}</div>
        <div class="row">
          <label>${this._t("ed_view")}</label>
          <div class="check-row" id="esl-chk-notes-row">
            <input type="checkbox" id="esl-chk-notes" ${showNotes ? "checked" : ""} />
            <span class="check-label">${this._t("ed_show_notes")}</span>
          </div>
        </div>
        <div class="row">
          <label>${this._t("ed_item_size")}</label>
          <div class="size-picker" id="esl-size-picker">
            <button class="size-btn${itemSize === "compact" ? " size-active" : ""}" data-size="compact">
              <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="2.5" rx="1" fill="currentColor"/><rect x="3" y="10.75" width="18" height="2.5" rx="1" fill="currentColor"/><rect x="3" y="16.5" width="18" height="2.5" rx="1" fill="currentColor"/></svg>
              <span>${this._t("ed_size_compact")}</span>
            </button>
            <button class="size-btn${itemSize === "normal" ? " size-active" : ""}" data-size="normal">
              <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="4" width="18" height="3" rx="1" fill="currentColor"/><rect x="3" y="10.5" width="18" height="3" rx="1" fill="currentColor"/><rect x="3" y="17" width="18" height="3" rx="1" fill="currentColor"/></svg>
              <span>${this._t("ed_size_normal")}</span>
            </button>
            <button class="size-btn${itemSize === "comfortable" ? " size-active" : ""}" data-size="comfortable">
              <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="18" height="4" rx="1.5" fill="currentColor"/><rect x="3" y="10" width="18" height="4" rx="1.5" fill="currentColor"/><rect x="3" y="17" width="18" height="4" rx="1.5" fill="currentColor"/></svg>
              <span>${this._t("ed_size_comfortable")}</span>
            </button>
          </div>
        </div>
        <hr class="sep"/>
        <div class="ed-section-header">${this._t("ed_section_store")}</div>
        <div class="row">
          <label>${this._t("ed_store_size")}</label>
          <div class="size-picker" id="esl-store-size-picker">
            <button class="size-btn${(this._config.store_item_size || "normal") === "compact" ? " size-active" : ""}" data-size="compact">
              <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="2.5" rx="1" fill="currentColor"/><rect x="3" y="10.75" width="18" height="2.5" rx="1" fill="currentColor"/><rect x="3" y="16.5" width="18" height="2.5" rx="1" fill="currentColor"/></svg>
              <span>${this._t("ed_size_compact")}</span>
            </button>
            <button class="size-btn${(this._config.store_item_size || "normal") === "normal" ? " size-active" : ""}" data-size="normal">
              <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="4" width="18" height="3" rx="1" fill="currentColor"/><rect x="3" y="10.5" width="18" height="3" rx="1" fill="currentColor"/><rect x="3" y="17" width="18" height="3" rx="1" fill="currentColor"/></svg>
              <span>${this._t("ed_size_normal")}</span>
            </button>
            <button class="size-btn${(this._config.store_item_size || "normal") === "comfortable" ? " size-active" : ""}" data-size="comfortable">
              <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="3" width="18" height="4" rx="1.5" fill="currentColor"/><rect x="3" y="10" width="18" height="4" rx="1.5" fill="currentColor"/><rect x="3" y="17" width="18" height="4" rx="1.5" fill="currentColor"/></svg>
              <span>${this._t("ed_size_comfortable")}</span>
            </button>
          </div>
        </div>
        <div class="row">
          <label>${this._t("ed_swipe_threshold")}</label>
          <div class="threshold-row">
            <input type="range" id="esl-swipe-threshold" min="15" max="85" step="5" value="${this._config.swipe_threshold || 50}" />
            <span class="threshold-val" id="esl-threshold-val">${this._config.swipe_threshold || 50}%</span>
          </div>
        </div>
      </div>`;
    this._populateEntities();

    // Basic inputs
    this.querySelector("#esl-entity").addEventListener("change", e => { this._config = { ...this._config, entity: e.target.value }; this._fire(); });
    this.querySelector("#esl-title").addEventListener("input", e => { this._config = { ...this._config, title: e.target.value }; this._fire(); });
    this.querySelector("#esl-sort").addEventListener("change", e => { this._config = { ...this._config, sort_by: e.target.value }; this._fire(); });

    // Color picker: active
    this._bindColorPicker("esl-cp-active", "esl-hex-active", "esl-cur-active", "color_active");
    // Color picker: done
    this._bindColorPicker("esl-cp-done", "esl-hex-done", "esl-cur-done", "color_completed");

    // Text color
    this._bindColorPicker("esl-cp-text", "esl-hex-text", "esl-cur-text", "text_color", "var(--primary-text-color)");
    // Icon color
    this._bindColorPicker("esl-cp-icon", "esl-hex-icon", "esl-cur-icon", "icon_color", "var(--secondary-text-color)");
    // Check icon color
    this._bindColorPicker("esl-cp-check", "esl-hex-check", "esl-cur-check", "check_color", "var(--primary-color)");

    // Category checkboxes
    this.querySelector("#esl-chk-cat").addEventListener("change", e => {
      this._config = { ...this._config, show_categories: e.target.checked }; this._fire();
    });
    this.querySelector("#esl-chk-badge").addEventListener("change", e => {
      this._config = { ...this._config, show_category_badge: e.target.checked }; this._fire();
    });
    this.querySelector("#esl-chk-headers").addEventListener("change", e => {
      this._config = { ...this._config, show_category_headers: e.target.checked }; this._fire();
    });
    this.querySelector("#esl-chk-notes").addEventListener("change", e => {
      this._config = { ...this._config, show_notes: e.target.checked }; this._fire();
    });
    // Make entire row clickable
    ["esl-chk-cat-row", "esl-chk-badge-row", "esl-chk-headers-row", "esl-chk-notes-row"].forEach(rowId => {
      this.querySelector(`#${rowId}`).addEventListener("click", e => {
        if (e.target.type === "checkbox") return;
        const cb = this.querySelector(`#${rowId} input[type="checkbox"]`);
        cb.checked = !cb.checked; cb.dispatchEvent(new Event("change"));
      });
    });

    // Size picker
    this.querySelectorAll("#esl-size-picker .size-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this._config = { ...this._config, item_size: btn.dataset.size }; this._fire();
        this.querySelectorAll("#esl-size-picker .size-btn").forEach(b => b.classList.remove("size-active"));
        btn.classList.add("size-active");
      });
    });

    // Swipe threshold
    const thSlider = this.querySelector("#esl-swipe-threshold");
    const thVal = this.querySelector("#esl-threshold-val");
    thSlider.addEventListener("input", e => {
      thVal.textContent = `${e.target.value}%`;
    });
    thSlider.addEventListener("change", e => {
      this._config = { ...this._config, swipe_threshold: parseInt(e.target.value) }; this._fire();
    });

    // Store size picker
    this.querySelectorAll("#esl-store-size-picker .size-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this._config = { ...this._config, store_item_size: btn.dataset.size }; this._fire();
        this.querySelectorAll("#esl-store-size-picker .size-btn").forEach(b => b.classList.remove("size-active"));
        btn.classList.add("size-active");
      });
    });

    // Category order
    this._renderCatOrder();
  }

  async _renderCatOrder() {
    const container = this.querySelector("#esl-cat-order");
    if (!container || !this._hass || !this._config.entity) {
      if (container) container.innerHTML = `<div class="cat-order-empty">${this._t("ed_cat_order_empty")}</div>`;
      return;
    }
    try {
      const res = await this._hass.callWS({ type: "todo/item/list", entity_id: this._config.entity });
      const cats = new Set();
      for (const it of (res.items || [])) {
        const parsed = parseSummary(it.summary);
        if (parsed.category) cats.add(parsed.category);
      }
      if (!cats.size) {
        container.innerHTML = `<div class="cat-order-empty">${this._t("ed_cat_order_empty")}</div>`;
        return;
      }
      // Merge: config order first, then any new cats appended
      const saved = this._config.category_order || [];
      const ordered = [];
      for (const c of saved) { if (cats.has(c)) ordered.push(c); }
      for (const c of cats) { if (!ordered.includes(c)) ordered.push(c); }

      this._config = { ...this._config, category_order: ordered };
      this._buildCatOrderUI(container, ordered);
    } catch (e) {
      container.innerHTML = `<div class="cat-order-empty">${this._t("ed_cat_order_empty")}</div>`;
    }
  }

  _buildCatOrderUI(container, ordered) {
    container.innerHTML = ordered.map((cat, i) => `
      <div class="cat-order-item" data-idx="${i}">
        <span class="cat-order-num">${i + 1}</span>
        <span class="cat-order-name">${esc(cat)}</span>
        <button class="cat-order-btn cat-edit-btn" data-dir="edit" title="${this._t("ed_cat_rename")}">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/></svg>
        </button>
        <button class="cat-order-btn" data-dir="up" ${i === 0 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 5l-7 7h14z" fill="currentColor"/></svg>
        </button>
        <button class="cat-order-btn" data-dir="down" ${i === ordered.length - 1 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 19l-7-7h14z" fill="currentColor"/></svg>
        </button>
      </div>
    `).join("");

    container.querySelectorAll(".cat-order-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".cat-order-item");
        const idx = parseInt(item.dataset.idx, 10);
        const dir = btn.dataset.dir;

        if (dir === "edit") {
          this._startCatRename(container, ordered, idx);
          return;
        }

        const newOrder = [...ordered];
        const swapIdx = dir === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= newOrder.length) return;
        [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
        this._config = { ...this._config, category_order: newOrder };
        this._fire();
        this._buildCatOrderUI(container, newOrder);
      });
    });
  }

  _startCatRename(container, ordered, idx) {
    const oldName = ordered[idx];
    const item = container.querySelector(`[data-idx="${idx}"]`);
    const nameEl = item.querySelector(".cat-order-name");
    nameEl.innerHTML = `<input class="cat-rename-input" type="text" value="${esc(oldName)}" />`;
    const inp = nameEl.querySelector(".cat-rename-input");
    inp.focus();
    inp.select();

    const doRename = async () => {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) {
        this._buildCatOrderUI(container, ordered);
        return;
      }
      // Update category_order config
      const newOrder = ordered.map(c => c === oldName ? newName : c);
      this._config = { ...this._config, category_order: newOrder };
      this._fire();

      // Rename category in all items via HA service
      if (this._hass && this._config.entity) {
        try {
          const res = await this._hass.callWS({ type: "todo/item/list", entity_id: this._config.entity });
          const items = res.items || [];
          for (const it of items) {
            if (it.summary && it.summary.includes(`[${oldName}]`)) {
              const updated = it.summary.replace(`[${oldName}]`, `[${newName}]`);
              await this._hass.callService("todo", "update_item", {
                item: it.uid, rename: updated,
              }, { entity_id: this._config.entity });
            }
          }
        } catch (e) {
          console.error("ESL: category rename failed", e);
        }
      }
      this._buildCatOrderUI(container, newOrder);
    };

    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); doRename(); }
      if (e.key === "Escape") { this._buildCatOrderUI(container, ordered); }
    });
    inp.addEventListener("blur", () => doRename());
  }

  _bindColorPicker(sectionId, hexId, previewId, configKey, defaultCss) {
    const section = this.querySelector(`#${sectionId}`);
    const hexInput = this.querySelector(`#${hexId}`);
    const preview = this.querySelector(`#${previewId}`);

    const setColor = (color) => {
      this._config = { ...this._config, [configKey]: color }; this._fire();
      if (color === "none") {
        preview.style.background = "var(--card-background-color,#fff)";
        hexInput.value = "none";
      } else if (!color || color === "") {
        preview.style.background = defaultCss || "var(--primary-text-color)";
        hexInput.value = "auto";
      } else {
        preview.style.background = color;
        hexInput.value = color;
      }
      section.querySelectorAll(".color-swatch").forEach(s => {
        s.classList.toggle("active", s.dataset.color === color);
      });
    };

    section.querySelectorAll(".color-swatch").forEach(s => {
      s.addEventListener("click", () => setColor(s.dataset.color));
    });

    hexInput.addEventListener("change", () => {
      let v = hexInput.value.trim().toLowerCase();
      if (v === "auto" || v === "") { setColor(""); return; }
      if (v === "none") { setColor("none"); return; }
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
    });
    hexInput.addEventListener("keydown", e => { if (e.key === "Enter") hexInput.blur(); });
  }

  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
  }
}

/* ------------------------------------------------------------------ */
if (!customElements.get("enhanced-shopping-list-card")) {
  customElements.define("enhanced-shopping-list-card", EnhancedShoppingListCard);
}
if (!customElements.get("enhanced-shopping-list-card-editor")) {
  customElements.define("enhanced-shopping-list-card-editor", EnhancedShoppingListCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "enhanced-shopping-list-card",
  name: "Enhanced Shopping List",
  description: "Enhanced shopping list with quantities, notes, categories, swipe gestures & fuzzy search",
  preview: false,
});

console.info(
  "%c ENHANCED-SHOPPING-LIST %c v2.16.0 ",
  "background:#43a047;color:#fff;font-weight:bold;border-radius:4px 0 0 4px;",
  "background:#333;color:#fff;border-radius:0 4px 4px 0;"
);

// Auto-recover from race condition on hard refresh:
// If the card rendered as "error" before this JS loaded,
// force HA to re-render by finding and replacing error cards that
// reference our element type.
(function eslAutoRecover() {
  if (window.__eslRecoverScheduled) return;
  window.__eslRecoverScheduled = true;

  const findAndFixErrorCards = (root) => {
    if (!root) return 0;
    let fixed = 0;
    const walk = (node) => {
      if (!node) return;
      // Check shadow root
      if (node.shadowRoot) walk(node.shadowRoot);
      // Check children
      const children = node.querySelectorAll ? node.querySelectorAll("*") : [];
      for (const el of children) {
        const tag = el.tagName && el.tagName.toLowerCase();
        if (tag === "hui-error-card" || tag === "hui-warning") {
          const cfg = el._config || el.config;
          const type = cfg && (cfg.origConfig?.type || cfg.type || "");
          if (typeof type === "string" && type.includes("enhanced-shopping-list-card")) {
            // Replace with a fresh card element
            const parent = el.parentNode;
            if (parent && cfg && cfg.origConfig) {
              try {
                const newCard = document.createElement("enhanced-shopping-list-card");
                newCard.setConfig(cfg.origConfig);
                parent.replaceChild(newCard, el);
                fixed++;
              } catch (_) {}
            }
          }
        }
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(root);
    return fixed;
  };

  const tryRecover = (attempt) => {
    if (!customElements.get("enhanced-shopping-list-card")) return;
    const ha = document.querySelector("home-assistant");
    const fixed = findAndFixErrorCards(ha);
    if (fixed === 0 && attempt < 5) {
      setTimeout(() => tryRecover(attempt + 1), 300);
    }
  };

  // Start after DOM settles
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => tryRecover(0));
  } else {
    setTimeout(() => tryRecover(0), 100);
  }
})();
