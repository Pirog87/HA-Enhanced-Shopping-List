/**
 * Enhanced Shopping List Card v2.4.1
 * Works with any todo.* entity (native HA shopping list)
 * Notes encoded in summary: "Name (qty) // note"
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseSummary(summary) {
  const s = (summary || "").trim();
  let name = s, qty = 1, notes = "";
  const noteIdx = s.indexOf(" // ");
  if (noteIdx >= 0) {
    notes = s.substring(noteIdx + 4).trim();
    name = s.substring(0, noteIdx).trim();
  }
  const qm = name.match(/^(.+?)\s*\((\d+)\)$/);
  if (qm) { name = qm[1].trim(); qty = parseInt(qm[2], 10); }
  return { name, qty, notes };
}

function formatSummary(name, qty, notes) {
  let s = qty > 1 ? `${name} (${qty})` : name;
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
  }

  setConfig(config) {
    if (!config.entity) throw new Error("Please define an entity (todo.*)");
    this._config = config;
    if (this._rendered) { this._render(); this._fetchItems(); }
  }

  getCardSize() { return 3; }
  static getConfigElement() { return document.createElement("enhanced-shopping-list-card-editor"); }
  static getStubConfig() { return { entity: "", title: "Lista zakupów" }; }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!this._rendered) { this._render(); this._rendered = true; this._fetchItems(); return; }
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
        const { name, qty, notes } = parseSummary(it.summary);
        return { uid: it.uid, name, quantity: qty, notes, status: it.status, summary: it.summary };
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

  async _addItem(name, qty = 1, notes = "") {
    await this._callService("add_item", { item: formatSummary(name, qty, notes) });
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
    if (li) { li.quantity = q; li.summary = formatSummary(name, q, notes); }
    this._updateLists();
    clearTimeout(this._qtyTimers[item.uid]);
    this._qtyTimers[item.uid] = setTimeout(async () => {
      delete this._qtyTimers[item.uid];
      await this._callService("update_item", { item: item.uid, rename: formatSummary(name, q, notes) });
      await this._fetchItems();
    }, 500);
  }

  async _updateName(item, newName) {
    await this._callService("update_item", {
      item: item.uid, rename: formatSummary(newName.trim(), item.quantity, item.notes || ""),
    });
    await this._fetchItems();
  }

  async _updateNotes(item, notes) {
    const li = this._items.find(i => i.uid === item.uid);
    const name = li ? li.name : item.name;
    const qty = li ? li.quantity : item.quantity;
    await this._callService("update_item", {
      item: item.uid, rename: formatSummary(name, qty, notes),
    });
    if (li) li.notes = notes;
    await this._fetchItems();
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
    if (this._config.sort_by === "alphabetical") return [...items].sort((a, b) => a.name.localeCompare(b.name, "pl"));
    return items;
  }

  /* ---------- rendering ---------- */

  _hexToRgb(hex) {
    const h = (hex || "").replace("#", "");
    return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
  }

  _render() {
    const title = this._config.title || "Lista zakupów";
    const activeRgb = this._hexToRgb(this._config.color_active || "#2196f3");
    const doneRgb = this._hexToRgb(this._config.color_completed || "#4caf50");
    this.shadowRoot.innerHTML = `
      <style>
        :host { --esl-active-rgb: ${activeRgb}; --esl-done-rgb: ${doneRgb}; }
        ${EnhancedShoppingListCard.CSS}
      </style>
      <ha-card>
        <div class="header">${esc(title)}</div>
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
            <div class="completed-list" style="display:none"></div>
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
      aList.innerHTML = active.map(i => this._htmlActiveItem(i)).join("");
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
    if (l) l.style.display = this._completedExpanded ? "" : "none";
    if (ch) ch.classList.toggle("open", this._completedExpanded);
  }

  _htmlActiveItem(item) {
    const hn = item.notes ? " has-note" : "";
    const notePreview = item.notes
      ? `<div class="note-preview" data-action="toggle-note">${esc(item.notes)}</div>` : "";
    return `
    <div class="item-wrap" data-uid="${item.uid}">
      <div class="swipe-row">
        <div class="sw-bg sw-right"><svg viewBox="0 0 24 24" width="22" height="22"><polyline points="4,12 10,18 20,6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="sw-bg sw-left"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
        <div class="item" data-uid="${item.uid}">
          <div class="chk" data-action="toggle"><div class="chk-inner"></div></div>
          <div class="item-body">
            <div class="item-name" data-action="edit-name">${esc(item.name)}</div>
            ${notePreview}
          </div>
          <button class="icon-btn${hn}" data-action="toggle-note" title="${item.notes ? esc(item.notes) : "Dodaj notatke"}">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="${item.notes ? "var(--primary-color)" : "none"}" stroke="${item.notes ? "var(--primary-color)" : "var(--disabled-text-color,#999)"}" stroke-width="1.5"/><polyline points="14,2 14,8 20,8" fill="none" stroke="${item.notes ? "var(--primary-color)" : "var(--disabled-text-color,#999)"}" stroke-width="1.5"/></svg>
          </button>
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
    </div>`;
  }

  _htmlCompletedItem(item) {
    return `
    <div class="item-wrap" data-uid="${item.uid}">
      <div class="swipe-row">
        <div class="item completed-item" data-uid="${item.uid}">
          <div class="chk chk-done" data-action="toggle">
            <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="4,12 10,18 20,6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <div class="item-body">
            <div class="item-name done-name">${esc(item.name)}</div>
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

      el.querySelector(".swipe-row").addEventListener("click", e => {
        const a = e.target.closest("[data-action]");
        if (!a) { if (isCompleted) this._toggleComplete(item); return; }
        e.stopPropagation();
        switch (a.dataset.action) {
          case "toggle": this._toggleComplete(item); break;
          case "edit-name": if (!isCompleted) this._startEditName(el, item); else this._toggleComplete(item); break;
          case "qty-minus": this._updateQuantity(item, item.quantity - 1); break;
          case "qty-plus": this._updateQuantity(item, item.quantity + 1); break;
          case "edit-qty": this._startEditQty(el, item); break;
          case "toggle-note": this._toggleNoteEditor(el, item); break;
          case "delete": this._removeItem(item); break;
        }
      });

      // Pointer-based swipe (works on both touch and mouse)
      const itemEl = el.querySelector(".item");
      const swipeRow = el.querySelector(".swipe-row");
      let ts = null, off = 0;

      itemEl.addEventListener("pointerdown", e => {
        if (e.button !== 0) return;
        ts = { x: e.clientX, y: e.clientY, dir: null, id: e.pointerId };
        off = 0;
        container.querySelectorAll(".item").forEach(o => { if (o !== itemEl) o.style.transform = ""; });
        container.querySelectorAll(".swipe-row").forEach(r => { if (r !== swipeRow) r.classList.remove("swiping"); });
      });

      itemEl.addEventListener("pointermove", e => {
        if (!ts || ts.id !== e.pointerId) return;
        const dx = e.clientX - ts.x, dy = e.clientY - ts.y;
        if (!ts.dir) {
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
            ts.dir = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            if (ts.dir === "h") {
              try { itemEl.setPointerCapture(e.pointerId); } catch(_) {}
              swipeRow.classList.add("swiping");
            } else { ts = null; return; }
          } else return;
        }
        if (ts.dir === "h") {
          off = isCompleted ? Math.min(0, dx) : dx;
          itemEl.style.transition = "none";
          itemEl.style.transform = `translateX(${off}px)`;
        }
      });

      const endSwipe = () => {
        if (!ts) return;
        itemEl.style.transition = "transform 0.25s ease";
        if (off > 80 && !isCompleted) {
          itemEl.style.transform = ""; swipeRow.classList.remove("swiping"); this._toggleComplete(item);
        } else if (off < -80) {
          itemEl.style.transform = "translateX(-80px)";
        } else {
          itemEl.style.transform = "";
          setTimeout(() => swipeRow.classList.remove("swiping"), 250);
        }
        ts = null;
      };
      itemEl.addEventListener("pointerup", endSwipe);
      itemEl.addEventListener("pointercancel", () => {
        if (ts) {
          itemEl.style.transition = "transform 0.25s ease"; itemEl.style.transform = "";
          setTimeout(() => swipeRow.classList.remove("swiping"), 250);
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
      return `<div class="sg-item" data-uid="${x.i.uid}"><span class="sg-name">${esc(x.i.name)}</span>${badge}</div>`;
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
      .header { padding: 16px 20px 4px; font-size: 20px; font-weight: 500; color: var(--primary-text-color); }
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
        padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px;
        font-size: 14px; transition: background .12s;
      }
      .sg-item:hover { background: var(--secondary-background-color,#f5f5f5); }
      .sg-name { flex: 1; }
      .sg-badge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background: var(--primary-color); color: #fff; white-space: nowrap;
      }
      .sg-done { background: var(--disabled-text-color,#999); }

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

      /* --- item tile (matching HA todo-card style) --- */
      .item-wrap {
        border-radius: var(--R); margin-bottom: 8px; overflow: hidden;
      }
      .active-list .item-wrap:last-child,
      .completed-list .item-wrap:last-child { margin-bottom: 0; }
      .swipe-row { position: relative; overflow: hidden; border-radius: var(--R); }
      .sw-bg {
        position: absolute; top: 0; bottom: 0; width: 100%;
        display: flex; align-items: center;
        opacity: 0; transition: opacity .15s;
      }
      .swipe-row.swiping .sw-bg { opacity: 1; }
      .sw-right { left: 0; background: #43a047; padding-left: 18px; }
      .sw-left { right: 0; background: #e53935; justify-content: flex-end; padding-right: 18px; }
      .item {
        position: relative; display: flex; align-items: center; gap: 12px;
        padding: 4px 14px; min-height: 58px;
        border-radius: var(--R);
        z-index: 1; touch-action: pan-y; transition: transform .25s ease; cursor: pointer;
      }
      .active-list .item {
        background-color: rgba(var(--esl-active-rgb), 0.20);
      }
      .completed-list .item {
        background-color: rgba(var(--esl-done-rgb), 0.20);
      }

      /* --- checkbox --- */
      .chk {
        width: 26px; height: 26px; min-width: 26px; border-radius: 50%;
        border: 2.5px solid var(--divider-color,#ccc); cursor: pointer;
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
      .item-name {
        font-size: 16px; font-weight: 500; color: var(--primary-text-color); cursor: pointer;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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
      .qty-area { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .qty-btn {
        width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; padding: 0;
        background: var(--primary-color); color: #fff;
        transition: all .15s ease;
      }
      .qty-btn:hover { opacity: .85; transform: scale(1.1); }
      .qty-btn:active { transform: scale(.9); }
      .qty-val {
        min-width: 24px; text-align: center; font-size: 17px; font-weight: 700;
        cursor: pointer; color: var(--primary-text-color); user-select: none;
      }

      /* --- icon buttons --- */
      .icon-btn {
        background: none; border: none; padding: 8px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%; transition: background .15s; flex-shrink: 0;
        opacity: .4;
      }
      .icon-btn:hover { background: rgba(128,128,128,.15); opacity: .8; }
      .icon-btn.has-note { opacity: 1; }
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

      @media (max-width: 400px) {
        .content { padding: 6px 8px 10px; }
        .item { gap: 8px; padding: 8px 10px; }
        .qty-area { gap: 8px; }
        .qty-btn { width: 26px; height: 26px; }
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
        .color-row { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
        .color-row input[type="color"] {
          -webkit-appearance: none; -moz-appearance: none; appearance: none;
          width: 48px; height: 48px; min-width: 48px; min-height: 48px;
          border: 2px solid var(--divider-color,#ddd); border-radius: 10px;
          padding: 3px; cursor: pointer; background: none;
        }
        .color-row input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
        .color-row input[type="color"]::-webkit-color-swatch { border-radius: 6px; border: none; }
        .color-row input[type="color"]::-moz-color-swatch { border-radius: 6px; border: none; }
        .color-preview {
          flex: 1; height: 36px; border-radius: 10px; opacity: .4;
        }
        .color-hex {
          font-size: 13px; font-family: monospace; color: var(--secondary-text-color);
          min-width: 64px;
        }
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
        <div class="row">
          <label>Kolor tla: Do kupienia</label>
          <div class="color-row">
            <input type="color" id="esl-color-active" value="${this._config.color_active || "#2196f3"}" />
            <div class="color-preview" id="esl-preview-active" style="background:${this._config.color_active || "#2196f3"}"></div>
            <span class="color-hex" id="esl-hex-active">${this._config.color_active || "#2196f3"}</span>
          </div>
        </div>
        <div class="row">
          <label>Kolor tla: Kupione</label>
          <div class="color-row">
            <input type="color" id="esl-color-done" value="${this._config.color_completed || "#4caf50"}" />
            <div class="color-preview" id="esl-preview-done" style="background:${this._config.color_completed || "#4caf50"}"></div>
            <span class="color-hex" id="esl-hex-done">${this._config.color_completed || "#4caf50"}</span>
          </div>
        </div>
      </div>`;
    this._populateEntities();
    this.querySelector("#esl-entity").addEventListener("change", e => { this._config = { ...this._config, entity: e.target.value }; this._fire(); });
    this.querySelector("#esl-title").addEventListener("input", e => { this._config = { ...this._config, title: e.target.value }; this._fire(); });
    this.querySelector("#esl-sort").addEventListener("change", e => { this._config = { ...this._config, sort_by: e.target.value }; this._fire(); });
    this.querySelector("#esl-color-active").addEventListener("input", e => {
      this._config = { ...this._config, color_active: e.target.value }; this._fire();
      this.querySelector("#esl-preview-active").style.background = e.target.value;
      this.querySelector("#esl-hex-active").textContent = e.target.value;
    });
    this.querySelector("#esl-color-done").addEventListener("input", e => {
      this._config = { ...this._config, color_completed: e.target.value }; this._fire();
      this.querySelector("#esl-preview-done").style.background = e.target.value;
      this.querySelector("#esl-hex-done").textContent = e.target.value;
    });
  }

  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
  }
}

/* ------------------------------------------------------------------ */
customElements.define("enhanced-shopping-list-card", EnhancedShoppingListCard);
customElements.define("enhanced-shopping-list-card-editor", EnhancedShoppingListCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "enhanced-shopping-list-card",
  name: "Enhanced Shopping List",
  description: "Rozbudowana lista zakupow z ilosciami, notatkami i fuzzy search",
  preview: false,
});

console.info(
  "%c ENHANCED-SHOPPING-LIST %c v2.4.1 ",
  "background:#43a047;color:#fff;font-weight:bold;border-radius:4px 0 0 4px;",
  "background:#333;color:#fff;border-radius:0 4px 4px 0;"
);
