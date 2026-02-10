/**
 * Enhanced Shopping List Card v2.6.2
 * Works with any todo.* entity (native HA shopping list)
 * Summary encoding: "Name (qty) [Category] // note"
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseSummary(summary) {
  const s = (summary || "").trim();
  let name = s, qty = 1, notes = "", category = "";
  // 1. Extract notes after " // "
  const noteIdx = s.indexOf(" // ");
  if (noteIdx >= 0) {
    notes = s.substring(noteIdx + 4).trim();
    name = s.substring(0, noteIdx).trim();
  }
  // 2. Extract category from [...]
  const catMatch = name.match(/^(.+?)\s*\[([^\]]+)\]$/);
  if (catMatch) {
    name = catMatch[1].trim();
    category = catMatch[2].trim();
  }
  // 3. Extract quantity from (N)
  const qm = name.match(/^(.+?)\s*\((\d+)\)$/);
  if (qm) { name = qm[1].trim(); qty = parseInt(qm[2], 10); }
  return { name, qty, notes, category };
}

function formatSummary(name, qty, notes, category) {
  let s = qty > 1 ? `${name} (${qty})` : name;
  if (category) s += ` [${category}]`;
  if (notes) s += ` // ${notes}`;
  return s;
}

function fuzzyScore(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
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
/*  Card                                                               */
/* ------------------------------------------------------------------ */
class EnhancedShoppingListCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._items = [];
    this._inputValue = "";
    this._suggestions = [];
    this._completedExpanded = false;
    this._debounceTimer = null;
    this._qtyTimers = {};
    this._hass = null;
    this._rendered = false;
    this._viewPrefs = {};
  }

  setConfig(config) {
    this._config = config;
    if (this._rendered) { this._render(); if (config.entity) this._fetchItems(); }
  }

  getCardSize() { return 3; }
  static getConfigElement() { return document.createElement("enhanced-shopping-list-card-editor"); }
  static getStubConfig(hass) {
    const ent = hass ? Object.keys(hass.states).find(e => e.startsWith("todo.")) : "";
    return { entity: ent || "", title: "Lista zakupów" };
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!this._rendered) {
      this._render(); this._rendered = true;
      if (this._config.entity) this._fetchItems();
      return;
    }
    const entity = this._config.entity;
    if (entity && oldHass) {
      const o = oldHass.states[entity], n = hass.states[entity];
      if (!o || o.last_updated !== n?.last_updated) this._fetchItems();
    }
  }

  get hass() { return this._hass; }

  /* ---------- data ---------- */

  async _fetchItems() {
    if (!this._hass || !this._config.entity) return;
    try {
      const res = await this._hass.callWS({ type: "todo/item/list", entity_id: this._config.entity });
      this._items = (res.items || []).map((it) => {
        const { name, qty, notes, category } = parseSummary(it.summary);
        return { uid: it.uid, name, quantity: qty, notes, category, status: it.status, summary: it.summary };
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

  async _addItem(name, qty = 1, notes = "", category = "") {
    await this._callService("add_item", { item: formatSummary(name, qty, notes, category) });
    await this._fetchItems();
  }

  async _toggleComplete(item) {
    const s = item.status === "needs_action" ? "completed" : "needs_action";
    await this._callService("update_item", { item: item.uid, status: s });
    await this._fetchItems();
  }

  async _removeItem(item) {
    await this._callService("remove_item", { item: [item.uid] });
    await this._fetchItems();
  }

  _updateQuantity(item, newQty) {
    const q = Math.max(1, newQty);
    const li = this._items.find(i => i.uid === item.uid);
    const name = li ? li.name : item.name;
    const notes = li ? li.notes : (item.notes || "");
    const category = li ? li.category : (item.category || "");
    if (li) { li.quantity = q; li.summary = formatSummary(name, q, notes, category); }
    this._updateLists();
    clearTimeout(this._qtyTimers[item.uid]);
    this._qtyTimers[item.uid] = setTimeout(async () => {
      delete this._qtyTimers[item.uid];
      await this._callService("update_item", { item: item.uid, rename: formatSummary(name, q, notes, category) });
      await this._fetchItems();
    }, 500);
  }

  async _updateName(item, newName) {
    const li = this._items.find(i => i.uid === item.uid);
    const category = li ? li.category : (item.category || "");
    await this._callService("update_item", {
      item: item.uid, rename: formatSummary(newName.trim(), item.quantity, item.notes || "", category),
    });
    await this._fetchItems();
  }

  async _updateNotes(item, notes) {
    const li = this._items.find(i => i.uid === item.uid);
    const name = li ? li.name : item.name;
    const qty = li ? li.quantity : item.quantity;
    const category = li ? li.category : (item.category || "");
    await this._callService("update_item", {
      item: item.uid, rename: formatSummary(name, qty, notes, category),
    });
    if (li) li.notes = notes;
    await this._fetchItems();
  }

  async _updateCategory(item, category) {
    const li = this._items.find(i => i.uid === item.uid);
    const name = li ? li.name : item.name;
    const qty = li ? li.quantity : item.quantity;
    const notes = li ? li.notes : (item.notes || "");
    await this._callService("update_item", {
      item: item.uid, rename: formatSummary(name, qty, notes, category),
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
        await this._addItem(name);
      }
    }
    this._inputValue = "";
    const inp = this.shadowRoot.querySelector(".add-input");
    if (inp) inp.value = "";
    this._hideSuggestions();
  }

  _sortItems(items) {
    const sorted = [...items];
    const catEnabled = this._getViewPref("show_categories");
    const hasAnyCat = catEnabled && sorted.some(i => i.category);
    if (hasAnyCat) {
      sorted.sort((a, b) => {
        const catA = (a.category || "").toLowerCase();
        const catB = (b.category || "").toLowerCase();
        if (catA && !catB) return -1;
        if (!catA && catB) return 1;
        if (catA !== catB) return catA.localeCompare(catB, "pl");
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
    const title = this._config.title || "Lista zakupów";
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
      <ha-card>
        <div class="header">
          <span class="header-title">${esc(title)}</span>
          <div class="header-toggles">
            <button class="hdr-toggle${this._getViewPref("show_categories") ? " hdr-on" : ""}" data-toggle="show_categories" title="Grupuj po kategoriach">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            <button class="hdr-toggle${this._getViewPref("show_category_badge") ? " hdr-on" : ""}" data-toggle="show_category_badge" title="Etykiety kategorii na pozycjach">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>
            </button>
            <button class="hdr-toggle${this._getViewPref("show_category_headers") ? " hdr-on" : ""}" data-toggle="show_category_headers" title="Naglowki kategorii">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 6h16M4 10h10M4 14h16M4 18h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </button>
            <button class="hdr-toggle${this._getViewPref("show_notes") ? " hdr-on" : ""}" data-toggle="show_notes" title="Ikona notatki na pozycjach">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="none" stroke="currentColor" stroke-width="1.5"/><polyline points="14,2 14,8 20,8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
          </div>
        </div>
        <div class="content">
          <div class="add-section">
            <div class="input-row">
              <input class="add-input" type="text" placeholder="Dodaj produkt..." />
              <button class="add-btn" title="Dodaj">
                <svg viewBox="0 0 24 24" width="28" height="28">
                  <circle cx="12" cy="12" r="11" fill="var(--primary-color)"/>
                  <path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="suggestions" style="display:none"></div>
          </div>
          <div class="section active-section">
            <div class="section-title">Do kupienia <span class="badge-count active-count">0</span></div>
            <div class="active-list"></div>
          </div>
          <div class="section completed-section" style="display:none">
            <div class="section-title completed-header">
              <span>Kupione <span class="badge-count completed-count">0</span> <span class="chevron">&#9660;</span></span>
              <button class="clear-all-btn" title="Wyczysc kupione">
                <svg viewBox="0 0 24 24" width="22" height="22"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <div class="confirm-bar" style="display:none">
              <span>Usunac wszystkie kupione?</span>
              <button class="btn-yes">Tak</button>
              <button class="btn-no">Nie</button>
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
    R.querySelectorAll(".hdr-toggle").forEach(btn => {
      btn.addEventListener("click", () => this._toggleViewPref(btn.dataset.toggle));
    });
    R.querySelector(".completed-header").addEventListener("click", e => {
      if (e.target.closest(".clear-all-btn")) return;
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

  _updateLists() {
    const R = this.shadowRoot; if (!R) return;
    const active = this._sortItems(this._items.filter(i => i.status === "needs_action"));
    const completed = this._sortItems(this._items.filter(i => i.status === "completed"));
    R.querySelector(".active-count").textContent = active.length;
    R.querySelector(".completed-count").textContent = completed.length;
    const aList = R.querySelector(".active-list");
    if (!active.length) {
      aList.innerHTML = '<div class="empty-msg">Lista jest pusta</div>';
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
              html += `<div class="cat-header cat-header-none">Inne</div>`;
            }
            lastCat = cat;
          }
        }
        html += this._htmlActiveItem(item);
      }
      aList.innerHTML = html;
      this._bindItemEvents(aList, active, false);
    }
    const cSec = R.querySelector(".completed-section");
    cSec.style.display = completed.length ? "" : "none";
    const cList = R.querySelector(".completed-list");
    cList.innerHTML = completed.map(i => this._htmlCompletedItem(i)).join("");
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
        <div class="sw-bg sw-right"><svg viewBox="0 0 24 24" width="22" height="22"><polyline points="4,12 10,18 20,6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
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
          <button class="icon-btn cat-btn${hc}" data-action="edit-category" title="${item.category || "Kategoria"}">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="${item.category ? "var(--primary-color)" : "none"}" stroke="${item.category ? "var(--primary-color)" : "var(--esl-icon-color)"}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="${item.category ? "#fff" : "var(--esl-icon-color)"}"/></svg>
          </button>
          ${showNotes ? `<button class="icon-btn${hn}" data-action="toggle-note" title="${item.notes ? esc(item.notes) : "Dodaj notatke"}">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="${item.notes ? "var(--primary-color)" : "none"}" stroke="${item.notes ? "var(--primary-color)" : "var(--esl-icon-color)"}" stroke-width="1.5"/><polyline points="14,2 14,8 20,8" fill="none" stroke="${item.notes ? "var(--primary-color)" : "var(--esl-icon-color)"}" stroke-width="1.5"/></svg>
          </button>` : ""}
          <div class="qty-area">
            <button class="qty-btn" data-action="qty-minus">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
            <span class="qty-val" data-action="edit-qty">${item.quantity}</span>
            <button class="qty-btn" data-action="qty-plus">
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="note-editor" style="display:none">
        <textarea class="note-textarea" placeholder="Dodaj notatke...">${esc(item.notes || "")}</textarea>
        <div class="note-bar">
          <button class="note-save">Zapisz</button>
        </div>
      </div>
      <div class="cat-editor" style="display:none">
        <div class="cat-chips"></div>
        <div class="cat-input-row">
          <input class="cat-input" type="text" placeholder="Nowa kategoria..." value="${esc(item.category || "")}" />
          <button class="cat-save">Zapisz</button>
          ${item.category ? '<button class="cat-remove">Usun</button>' : ""}
        </div>
      </div>
    </div>`;
  }

  _htmlCompletedItem(item) {
    const showBadge = this._getViewPref("show_category_badge");
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
          ${item.quantity > 1 ? `<span class="done-qty">${item.quantity} szt.</span>` : ""}
          <button class="icon-btn del-btn" data-action="delete" title="Usun z listy">
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
          case "qty-minus": this._updateQuantity(item, item.quantity - 1); break;
          case "qty-plus": this._updateQuantity(item, item.quantity + 1); break;
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
            swipeRow.className = "swipe-row swiping-right";
          } else if (off < 0) {
            swipeRow.className = "swipe-row swiping-left";
          }
          itemEl.style.transition = "none";
          itemEl.style.transform = `translate3d(${off}px,0,0)`;
        }
      });

      const endSwipe = () => {
        if (!ts) return;
        itemEl.style.transition = "transform 0.25s ease";
        if (off > 80 && !isCompleted) {
          // Right swipe: complete
          itemEl.style.transform = "";
          swipeRow.className = "swipe-row";
          this._toggleComplete(item);
        } else if (off < -80) {
          // Left swipe: show delete confirmation
          ts = null;
          itemEl.style.transform = "";
          swipeRow.className = "swipe-row";
          this._showDeleteConfirm(item, el, itemEl, swipeRow);
          return;
        } else {
          itemEl.style.transform = "";
          setTimeout(() => { swipeRow.className = "swipe-row"; }, 250);
        }
        ts = null;
      };
      itemEl.addEventListener("pointerup", endSwipe);
      itemEl.addEventListener("pointercancel", () => {
        if (ts) {
          itemEl.style.transition = "transform 0.25s ease"; itemEl.style.transform = "";
          setTimeout(() => { swipeRow.className = "swipe-row"; }, 250);
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
    const inp = document.createElement("input");
    inp.className = "inline-edit qty-edit"; inp.type = "number"; inp.min = "1"; inp.value = String(item.quantity);
    el.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const save = () => { if (done) return; done = true; const q = parseInt(inp.value, 10);
      if (!isNaN(q) && q >= 1) this._updateQuantity(item, q); else this._updateLists(); };
    inp.addEventListener("blur", save);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") inp.blur(); });
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
      <span class="dc-text">Usunac <b>${esc(item.name)}</b>?</span>
      <button class="dc-yes">Tak</button>
      <button class="dc-no">Nie</button>
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
    for (const x of scored) { const k = x.i.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); uniq.push(x); } }
    this._suggestions = uniq.slice(0, 5);
    if (!this._suggestions.length) { box.style.display = "none"; return; }
    box.style.display = "";
    box.innerHTML = this._suggestions.map(x => {
      const on = x.i.status === "needs_action";
      const badge = on ? `<span class="sg-badge">${x.i.quantity} szt.</span>` : `<span class="sg-badge sg-done">kupione</span>`;
      const catInfo = x.i.category ? `<span class="sg-cat">${esc(x.i.category)}</span>` : "";
      return `<div class="sg-item" data-uid="${x.i.uid}"><span class="sg-name">${esc(x.i.name)}</span>${catInfo}${badge}</div>`;
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
      .content { padding: 8px 12px 12px; }

      /* --- add --- */
      .add-section { position: relative; margin-bottom: 14px; }
      .input-row { display: flex; align-items: center; gap: 10px; }
      .add-input {
        flex:1; padding: 11px 14px; border: 1.5px solid var(--divider-color,#ddd); border-radius: var(--R);
        background: var(--card-background-color,#fff); color: var(--primary-text-color);
        font-size: 15px; font-family: inherit; outline: none; transition: border-color .2s;
      }
      .add-input:focus { border-color: var(--primary-color); }
      .add-input::placeholder { color: var(--secondary-text-color); opacity: .6; }
      .add-btn {
        background: none; border: none; padding: 0; cursor: pointer; display: flex;
        align-items: center; justify-content: center; width: 40px; height: 40px;
        flex-shrink: 0; border-radius: 50%; transition: transform .15s;
      }
      .add-btn:hover { transform: scale(1.08); }
      .add-btn:active { transform: scale(.92); }

      /* --- suggestions --- */
      .suggestions {
        position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
        background: var(--card-background-color,#fff);
        border: 1px solid var(--divider-color,#ddd); border-top: none;
        border-radius: 0 0 var(--R) var(--R);
        box-shadow: 0 6px 16px rgba(0,0,0,.12); overflow: hidden;
      }
      .sg-item {
        padding: 13px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px;
        font-size: 15px; transition: background .12s; min-height: 44px; box-sizing: border-box;
      }
      .sg-item:hover { background: var(--secondary-background-color,#f5f5f5); }
      .sg-name { flex: 1; }
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
      .sw-right { left: 0; background: #43a047; padding-left: 18px; }
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
      .qty-edit { width: 48px; text-align: center; -moz-appearance: textfield; }
      .qty-edit::-webkit-inner-spin-button, .qty-edit::-webkit-outer-spin-button { -webkit-appearance: none; }

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

      @media (max-width: 500px) {
        .content { padding: 6px 8px 10px; }
        .item { gap: 6px; padding: 4px 8px; }
        .icon-btn { padding: 3px; }
        .icon-btn svg { width: 18px; height: 18px; }
        .qty-btn { width: 24px; height: 24px; }
        .qty-btn svg { width: 12px; height: 12px; }
        .cat-editor, .note-editor { padding-left: 36px; }
      }
    `;
  }
}

/* ------------------------------------------------------------------ */
/*  Editor — plain <select> for entity (works everywhere)              */
/* ------------------------------------------------------------------ */
class EnhancedShoppingListCardEditor extends HTMLElement {
  constructor() { super(); this._config = {}; this._hass = null; }

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
    sel.innerHTML = '<option value="">-- Wybierz encje todo --</option>' +
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
    const showCat = this._config.show_categories !== false;
    const showBadge = this._config.show_category_badge !== false;
    const showHeaders = this._config.show_category_headers !== false;
    const showNotes = this._config.show_notes !== false;

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
      </style>
      <div class="esl-ed">
        <div class="row">
          <label>Lista todo (entity)</label>
          <select id="esl-entity"><option value="">-- Wybierz encje todo --</option></select>
        </div>
        <div class="row">
          <label>Tytul karty</label>
          <input type="text" id="esl-title" value="${(this._config.title || "").replace(/"/g, "&quot;")}" placeholder="Lista zakupow" />
        </div>
        <div class="row">
          <label>Sortowanie</label>
          <select id="esl-sort">
            <option value="manual"${!this._config.sort_by || this._config.sort_by === "manual" ? " selected" : ""}>Kolejnosc dodania</option>
            <option value="alphabetical"${this._config.sort_by === "alphabetical" ? " selected" : ""}>Alfabetycznie</option>
          </select>
        </div>
        <hr class="sep"/>
        <div class="row">
          <label>Kolor tla: Do kupienia</label>
          <div class="color-section" id="esl-cp-active">
            <div class="color-swatches">
              <div class="color-swatch color-swatch-none${activeColor === 'none' ? ' active' : ''}" data-color="none" title="Brak (motyw)"></div>
              ${PALETTE.map(c => `<div class="color-swatch${c === activeColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join("")}
            </div>
            <div class="color-hex-row">
              <div class="color-current" id="esl-cur-active" style="background:${activeColor === 'none' ? 'var(--card-background-color,#fff)' : activeColor}"></div>
              <input class="color-hex-input" id="esl-hex-active" type="text" value="${activeColor}" maxlength="7" placeholder="#rrggbb lub none" />
            </div>
          </div>
        </div>
        <div class="row">
          <label>Kolor tla: Kupione</label>
          <div class="color-section" id="esl-cp-done">
            <div class="color-swatches">
              <div class="color-swatch color-swatch-none${doneColor === 'none' ? ' active' : ''}" data-color="none" title="Brak (motyw)"></div>
              ${PALETTE.map(c => `<div class="color-swatch${c === doneColor ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`).join("")}
            </div>
            <div class="color-hex-row">
              <div class="color-current" id="esl-cur-done" style="background:${doneColor === 'none' ? 'var(--card-background-color,#fff)' : doneColor}"></div>
              <input class="color-hex-input" id="esl-hex-done" type="text" value="${doneColor}" maxlength="7" placeholder="#rrggbb lub none" />
            </div>
          </div>
        </div>
        <hr class="sep"/>
        <div class="row">
          <label>Kolor tekstu</label>
          <div class="color-hex-row">
            <div class="color-current" id="esl-cur-text" style="background:${textColor || 'var(--primary-text-color)'}"></div>
            <input class="color-hex-input" id="esl-hex-text" type="text" value="${textColor || 'auto'}" placeholder="auto lub #rrggbb" />
          </div>
        </div>
        <div class="row">
          <label>Kolor ikon (tag, notatka)</label>
          <div class="color-hex-row">
            <div class="color-current" id="esl-cur-icon" style="background:${iconColor || 'var(--secondary-text-color)'}"></div>
            <input class="color-hex-input" id="esl-hex-icon" type="text" value="${iconColor || 'auto'}" placeholder="auto lub #rrggbb" />
          </div>
        </div>
        <hr class="sep"/>
        <div class="row">
          <label>Kategorie</label>
          <div class="check-row" id="esl-chk-cat-row">
            <input type="checkbox" id="esl-chk-cat" ${showCat ? "checked" : ""} />
            <span class="check-label">Grupuj i sortuj po kategoriach</span>
          </div>
          <div class="check-row" id="esl-chk-badge-row">
            <input type="checkbox" id="esl-chk-badge" ${showBadge ? "checked" : ""} />
            <span class="check-label">Pokazuj nazwe kategorii na pozycji</span>
          </div>
          <div class="check-row" id="esl-chk-headers-row">
            <input type="checkbox" id="esl-chk-headers" ${showHeaders ? "checked" : ""} />
            <span class="check-label">Pokazuj naglowki grupowania kategorii</span>
          </div>
        </div>
        <hr class="sep"/>
        <div class="row">
          <label>Widok</label>
          <div class="check-row" id="esl-chk-notes-row">
            <input type="checkbox" id="esl-chk-notes" ${showNotes ? "checked" : ""} />
            <span class="check-label">Pokazuj ikone notatki na pozycjach</span>
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
    this._bindSimpleColor("esl-hex-text", "esl-cur-text", "text_color", "var(--primary-text-color)");
    // Icon color
    this._bindSimpleColor("esl-hex-icon", "esl-cur-icon", "icon_color", "var(--secondary-text-color)");

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
  }

  _bindSimpleColor(hexId, previewId, configKey, defaultCss) {
    const hexInput = this.querySelector(`#${hexId}`);
    const preview = this.querySelector(`#${previewId}`);
    hexInput.addEventListener("change", () => {
      let v = hexInput.value.trim().toLowerCase();
      if (v === "auto" || v === "") {
        this._config = { ...this._config, [configKey]: "" }; this._fire();
        preview.style.background = defaultCss;
        hexInput.value = "auto";
        return;
      }
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        this._config = { ...this._config, [configKey]: v }; this._fire();
        preview.style.background = v;
        hexInput.value = v;
      }
    });
    hexInput.addEventListener("keydown", e => { if (e.key === "Enter") hexInput.blur(); });
  }

  _bindColorPicker(sectionId, hexId, previewId, configKey) {
    const section = this.querySelector(`#${sectionId}`);
    const hexInput = this.querySelector(`#${hexId}`);
    const preview = this.querySelector(`#${previewId}`);

    const setColor = (color) => {
      this._config = { ...this._config, [configKey]: color }; this._fire();
      const isNone = color === "none";
      preview.style.background = isNone ? "var(--card-background-color,#fff)" : color;
      hexInput.value = color;
      section.querySelectorAll(".color-swatch").forEach(s => {
        s.classList.toggle("active", s.dataset.color === color);
      });
    };

    section.querySelectorAll(".color-swatch").forEach(s => {
      s.addEventListener("click", () => setColor(s.dataset.color));
    });

    hexInput.addEventListener("change", () => {
      let v = hexInput.value.trim().toLowerCase();
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
  description: "Rozbudowana lista zakupow z ilosciami, notatkami, kategoriami i fuzzy search",
  preview: false,
});

console.info(
  "%c ENHANCED-SHOPPING-LIST %c v2.6.2 ",
  "background:#43a047;color:#fff;font-weight:bold;border-radius:4px 0 0 4px;",
  "background:#333;color:#fff;border-radius:0 4px 4px 0;"
);
