/**
 * Enhanced Shopping List Card for Home Assistant
 * Works with any todo.* entity (native HA shopping list)
 * No external dependencies — plain Web Component with Shadow DOM
 */

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseQuantity(summary) {
  const m = (summary || "").match(/^(.+?)\s*\((\d+)\)$/);
  if (m) return { name: m[1].trim(), qty: parseInt(m[2], 10) };
  return { name: (summary || "").trim(), qty: 1 };
}

function formatSummary(name, qty) {
  return qty > 1 ? `${name} (${qty})` : name;
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
    this._showConfirmClear = false;
    this._debounceTimer = null;
    this._hass = null;
    this._rendered = false;
  }

  /* ---------- HA card interface ---------- */

  setConfig(config) {
    if (!config.entity) {
      throw new Error("Please define an entity (todo.*)");
    }
    this._config = config;
    if (this._rendered) {
      this._render();
      this._fetchItems();
    }
  }

  getCardSize() { return 3; }

  static getConfigElement() {
    return document.createElement("enhanced-shopping-list-card-editor");
  }

  static getStubConfig() {
    return { entity: "", title: "Lista zakupów" };
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!this._rendered) {
      this._render();
      this._rendered = true;
      this._fetchItems();
      return;
    }
    const entity = this._config.entity;
    if (entity && oldHass) {
      const oldState = oldHass.states[entity];
      const newState = hass.states[entity];
      if (!oldState || oldState.last_updated !== newState?.last_updated) {
        this._fetchItems();
      }
    }
  }

  get hass() { return this._hass; }

  /* ---------- data: native HA todo API ---------- */

  async _fetchItems() {
    if (!this._hass || !this._config.entity) return;
    try {
      const res = await this._hass.callWS({
        type: "todo/item/list",
        entity_id: this._config.entity,
      });
      this._items = (res.items || []).map((item) => {
        const { name, qty } = parseQuantity(item.summary);
        return { uid: item.uid, name, quantity: qty, notes: item.description || "", status: item.status, summary: item.summary };
      });
      this._updateLists();
    } catch (e) {
      console.error("Enhanced Shopping List: failed to fetch items", e);
    }
  }

  async _callService(service, data) {
    if (!this._hass) return;
    try {
      await this._hass.callService("todo", service, data, {
        entity_id: this._config.entity,
      });
    } catch (e) {
      console.error(`ESL service error (todo.${service}):`, e);
    }
  }

  async _addItem(name, qty = 1) {
    await this._callService("add_item", { item: formatSummary(name, qty) });
  }

  async _toggleComplete(item) {
    const newStatus = item.status === "needs_action" ? "completed" : "needs_action";
    await this._callService("update_item", { item: item.uid, status: newStatus });
  }

  async _removeItem(item) {
    await this._callService("remove_item", { item: [item.uid] });
  }

  async _updateQuantity(item, newQty) {
    const q = Math.max(1, newQty);
    await this._callService("update_item", { item: item.uid, rename: formatSummary(item.name, q) });
  }

  async _updateName(item, newName) {
    await this._callService("update_item", { item: item.uid, rename: formatSummary(newName.trim(), item.quantity) });
  }

  async _updateNotes(item, notes) {
    await this._callService("update_item", { item: item.uid, description: notes });
  }

  async _clearCompleted() {
    const completed = this._items.filter((i) => i.status === "completed");
    if (completed.length === 0) return;
    await this._callService("remove_item", { item: completed.map((i) => i.uid) });
  }

  /* ---------- add with smart duplicate handling ---------- */

  async _addCurrentInput() {
    const name = (this._inputValue || "").trim();
    if (!name) return;
    const active = this._items.find(
      (i) => i.status === "needs_action" && i.name.toLowerCase() === name.toLowerCase()
    );
    if (active) {
      await this._updateQuantity(active, active.quantity + 1);
    } else {
      const completed = this._items.find(
        (i) => i.status === "completed" && i.name.toLowerCase() === name.toLowerCase()
      );
      if (completed) {
        await this._callService("update_item", { item: completed.uid, status: "needs_action" });
      } else {
        await this._addItem(name);
      }
    }
    this._inputValue = "";
    const input = this.shadowRoot.querySelector(".add-input");
    if (input) input.value = "";
    this._hideSuggestions();
  }

  /* ---------- sorting ---------- */

  _sortItems(items) {
    const sortBy = this._config.sort_by || "manual";
    if (sortBy === "alphabetical") {
      return [...items].sort((a, b) => a.name.localeCompare(b.name, "pl"));
    }
    return items; // manual = insertion order from HA
  }

  /* ---------- rendering ---------- */

  _render() {
    const title = this._config.title || "Lista zakupów";
    this.shadowRoot.innerHTML = `
      <style>${EnhancedShoppingListCard.cardStyles}</style>
      <ha-card>
        <div class="card-header">${esc(title)}</div>
        <div class="card-content">
          <div class="add-section">
            <div class="input-row">
              <input class="add-input" type="text" placeholder="Dodaj produkt..." />
              <button class="add-btn" title="Dodaj">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <circle cx="12" cy="12" r="10" fill="var(--primary-color)" />
                  <line x1="12" y1="7" x2="12" y2="17" stroke="white" stroke-width="2" stroke-linecap="round"/>
                  <line x1="7" y1="12" x2="17" y2="12" stroke="white" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="suggestions" style="display:none"></div>
          </div>
          <div class="section active-section">
            <div class="section-header">Do kupienia (<span class="active-count">0</span>)</div>
            <div class="active-list"></div>
          </div>
          <div class="section completed-section" style="display:none">
            <div class="section-header completed-header">
              <span>Kupione (<span class="completed-count">0</span>) <span class="chevron">&#9660;</span></span>
              <button class="clear-btn" title="Wyczyść kupione">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <div class="confirm-dialog" style="display:none">
              <span>Usunąć wszystkie kupione?</span>
              <button class="confirm-yes">Tak</button>
              <button class="confirm-no">Nie</button>
            </div>
            <div class="completed-list" style="display:none"></div>
          </div>
        </div>
      </ha-card>
    `;
    this._bindEvents();
  }

  _bindEvents() {
    const root = this.shadowRoot;
    const input = root.querySelector(".add-input");

    input.addEventListener("input", (e) => {
      this._inputValue = e.target.value;
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._updateSuggestions(), 300);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); this._addCurrentInput(); }
    });
    input.addEventListener("blur", () => {
      setTimeout(() => this._hideSuggestions(), 200);
    });

    // Add button
    root.querySelector(".add-btn").addEventListener("click", () => this._addCurrentInput());

    // Completed section toggle
    root.querySelector(".completed-header").addEventListener("click", (e) => {
      if (e.target.closest(".clear-btn")) return;
      this._completedExpanded = !this._completedExpanded;
      this._updateCompletedVisibility();
    });

    // Clear completed
    root.querySelector(".clear-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      root.querySelector(".confirm-dialog").style.display = "flex";
    });
    root.querySelector(".confirm-yes").addEventListener("click", () => {
      root.querySelector(".confirm-dialog").style.display = "none";
      this._clearCompleted();
    });
    root.querySelector(".confirm-no").addEventListener("click", () => {
      root.querySelector(".confirm-dialog").style.display = "none";
    });
  }

  _hideSuggestions() {
    this._suggestions = [];
    const sg = this.shadowRoot.querySelector(".suggestions");
    if (sg) sg.style.display = "none";
  }

  /* ---------- update lists ---------- */

  _updateLists() {
    const root = this.shadowRoot;
    if (!root) return;

    const active = this._sortItems(this._items.filter((i) => i.status === "needs_action"));
    const completed = this._sortItems(this._items.filter((i) => i.status === "completed"));

    root.querySelector(".active-count").textContent = active.length;
    root.querySelector(".completed-count").textContent = completed.length;

    const activeList = root.querySelector(".active-list");
    if (active.length === 0) {
      activeList.innerHTML = '<div class="empty">Lista zakupów jest pusta</div>';
    } else {
      activeList.innerHTML = active.map((item) => this._renderActiveItem(item)).join("");
      this._bindItemEvents(activeList, active, false);
    }

    const completedSection = root.querySelector(".completed-section");
    completedSection.style.display = completed.length > 0 ? "" : "none";
    const completedList = root.querySelector(".completed-list");
    completedList.innerHTML = completed.map((item) => this._renderCompletedItem(item)).join("");
    this._bindItemEvents(completedList, completed, true);
    this._updateCompletedVisibility();
  }

  _updateCompletedVisibility() {
    const root = this.shadowRoot;
    const list = root.querySelector(".completed-list");
    const chevron = root.querySelector(".chevron");
    if (list) list.style.display = this._completedExpanded ? "" : "none";
    if (chevron) chevron.classList.toggle("open", this._completedExpanded);
  }

  _renderActiveItem(item) {
    const hasNote = item.notes ? "has-note" : "";
    return `
      <div class="item-container" data-uid="${item.uid}">
        <div class="item-row">
          <div class="swipe-bg-right"><span class="swipe-icon">&#10003;</span></div>
          <div class="swipe-bg-left"><span class="delete-btn-swipe">Usuń</span></div>
          <div class="item" data-uid="${item.uid}">
            <div class="checkbox" data-action="toggle"></div>
            <span class="item-name" data-action="edit-name">${esc(item.name)}</span>
            <div class="qty-controls">
              <button class="qty-btn" data-action="qty-minus">&minus;</button>
              <span class="qty-value" data-action="edit-qty">${item.quantity}</span>
              <button class="qty-btn" data-action="qty-plus">+</button>
            </div>
            <button class="note-btn ${hasNote}" data-action="toggle-note" title="${esc(item.notes || "Dodaj notatkę")}">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="${item.notes ? "var(--primary-color)" : "none"}" stroke="${item.notes ? "var(--primary-color)" : "var(--secondary-text-color)"}" stroke-width="1.5"/>
                <polyline points="14,2 14,8 20,8" fill="none" stroke="${item.notes ? "var(--primary-color)" : "var(--secondary-text-color)"}" stroke-width="1.5"/>
                <line x1="8" y1="13" x2="16" y2="13" stroke="${item.notes ? "var(--primary-color)" : "var(--secondary-text-color)"}" stroke-width="1.5"/>
                <line x1="8" y1="17" x2="13" y2="17" stroke="${item.notes ? "var(--primary-color)" : "var(--secondary-text-color)"}" stroke-width="1.5"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="note-editor" style="display:none">
          <textarea class="note-input" placeholder="Dodaj notatkę...">${esc(item.notes || "")}</textarea>
        </div>
      </div>`;
  }

  _renderCompletedItem(item) {
    return `
      <div class="item-container" data-uid="${item.uid}">
        <div class="item-row">
          <div class="swipe-bg-left"><span class="delete-btn-swipe">Usuń</span></div>
          <div class="item completed-item" data-uid="${item.uid}">
            <div class="checkbox checked" data-action="toggle">
              <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="4,12 10,18 20,6" fill="none" stroke="var(--text-primary-color,#fff)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <span class="item-name completed-name">${esc(item.name)}</span>
            <span class="completed-qty">${item.quantity > 1 ? item.quantity + " szt." : ""}</span>
          </div>
        </div>
      </div>`;
  }

  /* ---------- item event binding ---------- */

  _bindItemEvents(container, items, isCompleted) {
    container.querySelectorAll(".item-container").forEach((el) => {
      const uid = el.dataset.uid;
      const item = items.find((i) => i.uid === uid);
      if (!item) return;

      // Click actions on the item-row
      const itemRow = el.querySelector(".item-row");
      itemRow.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]");
        if (!action) return;
        e.stopPropagation();
        switch (action.dataset.action) {
          case "toggle":
            this._toggleComplete(item);
            break;
          case "edit-name":
            if (!isCompleted) this._startEditName(el, item);
            else this._toggleComplete(item);
            break;
          case "qty-minus":
            this._updateQuantity(item, item.quantity - 1);
            break;
          case "qty-plus":
            this._updateQuantity(item, item.quantity + 1);
            break;
          case "edit-qty":
            this._startEditQty(el, item);
            break;
          case "toggle-note":
            this._toggleNoteEditor(el, item);
            break;
        }
      });

      if (isCompleted) {
        el.querySelector(".completed-item").addEventListener("click", (e) => {
          if (!e.target.closest("[data-action]")) this._toggleComplete(item);
        });
      }

      // Swipe delete button
      el.querySelectorAll(".delete-btn-swipe").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this._removeItem(item);
        });
      });

      // Touch swipe
      const itemEl = el.querySelector(".item");
      let touchState = null;
      let swipeOffset = 0;

      itemEl.addEventListener("touchstart", (e) => {
        const touch = e.touches[0];
        touchState = { startX: touch.clientX, startY: touch.clientY, dir: null };
        swipeOffset = 0;
        // Reset other swiped items
        container.querySelectorAll(".item").forEach((other) => {
          if (other !== itemEl) other.style.transform = "";
        });
      }, { passive: true });

      itemEl.addEventListener("touchmove", (e) => {
        if (!touchState) return;
        const touch = e.touches[0];
        const dx = touch.clientX - touchState.startX;
        const dy = touch.clientY - touchState.startY;
        if (!touchState.dir) {
          if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            touchState.dir = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
          }
        }
        if (touchState.dir === "h") {
          e.preventDefault();
          swipeOffset = isCompleted ? Math.min(0, dx) : dx;
          itemEl.style.transition = "none";
          itemEl.style.transform = `translateX(${swipeOffset}px)`;
        }
      }, { passive: false });

      itemEl.addEventListener("touchend", () => {
        if (!touchState) return;
        itemEl.style.transition = "transform 0.25s ease";
        if (swipeOffset > 80 && !isCompleted) {
          itemEl.style.transform = "";
          this._toggleComplete(item);
        } else if (swipeOffset < -80) {
          itemEl.style.transform = "translateX(-80px)";
        } else {
          itemEl.style.transform = "";
        }
        touchState = null;
      }, { passive: true });
    });
  }

  /* ---------- inline editors ---------- */

  _startEditName(container, item) {
    const nameEl = container.querySelector(".item-name");
    if (!nameEl) return;
    const input = document.createElement("input");
    input.className = "name-edit";
    input.type = "text";
    input.value = item.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let saved = false;
    const save = () => {
      if (saved) return;
      saved = true;
      const name = input.value.trim();
      if (name && name !== item.name) {
        this._updateName(item, name);
      } else {
        this._updateLists();
      }
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") { saved = true; this._updateLists(); }
    });
  }

  _startEditQty(container, item) {
    const qtyEl = container.querySelector(".qty-value");
    if (!qtyEl) return;
    const input = document.createElement("input");
    input.className = "qty-input";
    input.type = "number";
    input.min = "1";
    input.value = String(item.quantity);
    qtyEl.replaceWith(input);
    input.focus();
    input.select();
    let saved = false;
    const save = () => {
      if (saved) return;
      saved = true;
      const q = parseInt(input.value, 10);
      if (!isNaN(q) && q >= 1) {
        this._updateQuantity(item, q);
      } else {
        this._updateLists();
      }
    };
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
  }

  _toggleNoteEditor(container, item) {
    const editor = container.querySelector(".note-editor");
    if (!editor) return;
    const isOpen = editor.style.display !== "none";
    editor.style.display = isOpen ? "none" : "";
    if (!isOpen) {
      const textarea = editor.querySelector(".note-input");
      textarea.focus();
      textarea.addEventListener("blur", () => {
        const notes = textarea.value;
        if (notes !== (item.notes || "")) {
          this._updateNotes(item, notes);
        }
      }, { once: true });
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          textarea.blur();
        }
      });
    }
  }

  /* ---------- suggestions ---------- */

  _updateSuggestions() {
    const q = (this._inputValue || "").trim();
    const sgContainer = this.shadowRoot.querySelector(".suggestions");
    if (q.length < 2) { this._hideSuggestions(); return; }
    const scored = this._items
      .map((item) => ({ item, score: fuzzyScore(q, item.name) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    const seen = new Set();
    const unique = [];
    for (const s of scored) {
      const key = s.item.name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); unique.push(s); }
    }
    this._suggestions = unique.slice(0, 5);
    if (this._suggestions.length === 0) { sgContainer.style.display = "none"; return; }
    sgContainer.style.display = "";
    sgContainer.innerHTML = this._suggestions.map((s) => {
      const onList = s.item.status === "needs_action";
      const badge = onList
        ? `<span class="badge">na liście: ${s.item.quantity} szt.</span>`
        : `<span class="badge inactive">kupione</span>`;
      return `<div class="suggestion" data-uid="${s.item.uid}">
        <span class="suggestion-name">${esc(s.item.name)}</span>${badge}
      </div>`;
    }).join("");
    sgContainer.querySelectorAll(".suggestion").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const uid = el.dataset.uid;
        const item = this._items.find((i) => i.uid === uid);
        if (item) this._selectSuggestion(item);
      });
    });
  }

  async _selectSuggestion(item) {
    if (item.status === "needs_action") {
      await this._updateQuantity(item, item.quantity + 1);
    } else {
      await this._callService("update_item", { item: item.uid, status: "needs_action" });
    }
    this._inputValue = "";
    const input = this.shadowRoot.querySelector(".add-input");
    if (input) input.value = "";
    this._hideSuggestions();
  }

  /* ---------- styles ---------- */

  static get cardStyles() {
    return `
      :host { --esl-radius: 8px; --esl-item-height: 44px; }
      ha-card { overflow: hidden; }
      .card-header { padding: 16px 16px 0; font-size: 18px; font-weight: 500; color: var(--primary-text-color); }
      .card-content { padding: 12px 16px 16px; }

      /* Add input row */
      .add-section { position: relative; margin-bottom: 16px; }
      .input-row { display: flex; align-items: center; gap: 8px; }
      .add-input {
        flex: 1; box-sizing: border-box; padding: 10px 12px;
        border: 1px solid var(--divider-color, #e0e0e0); border-radius: var(--esl-radius);
        background: var(--card-background-color, #fff); color: var(--primary-text-color);
        font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.2s;
      }
      .add-input:focus { border-color: var(--primary-color); }
      .add-input::placeholder { color: var(--secondary-text-color); opacity: 0.7; }
      .add-btn {
        background: none; border: none; padding: 0; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        width: 36px; height: 36px; flex-shrink: 0; border-radius: 50%;
        transition: transform 0.15s;
      }
      .add-btn:hover { transform: scale(1.1); }
      .add-btn:active { transform: scale(0.95); }

      /* Suggestions */
      .suggestions {
        position: absolute; top: 100%; left: 0; right: 0; z-index: 10;
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e0e0e0); border-top: none;
        border-radius: 0 0 var(--esl-radius) var(--esl-radius);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); overflow: hidden;
      }
      .suggestion {
        padding: 10px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px;
        font-size: 14px; color: var(--primary-text-color); transition: background 0.15s;
      }
      .suggestion:hover { background: var(--secondary-background-color, #f5f5f5); }
      .suggestion-name { flex: 1; }
      .badge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background: var(--primary-color); color: var(--text-primary-color, #fff); white-space: nowrap;
      }
      .badge.inactive { background: var(--secondary-text-color); opacity: 0.6; }

      /* Section */
      .section { margin-bottom: 12px; }
      .section-header {
        font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
        color: var(--secondary-text-color); padding: 8px 0 6px;
      }
      .empty { padding: 20px 0; text-align: center; color: var(--secondary-text-color); font-size: 14px; opacity: 0.7; }

      /* Item container */
      .item-container { border-radius: var(--esl-radius); margin-bottom: 4px; }
      .item-row { position: relative; overflow: hidden; border-radius: var(--esl-radius); }
      .swipe-bg-right {
        position: absolute; top:0; left:0; bottom:0; width:100%;
        background: #4caf50; display: flex; align-items: center; padding-left: 16px; color: white; font-weight: bold;
      }
      .swipe-bg-left {
        position: absolute; top:0; right:0; bottom:0; width:100%;
        background: #f44336; display: flex; align-items: center; justify-content: flex-end;
      }
      .swipe-icon { font-size: 20px; }
      .delete-btn-swipe {
        display: flex; align-items: center; justify-content: center;
        width: 80px; height: 100%; color: white; font-weight: 600; font-size: 13px; cursor: pointer;
      }
      .item {
        position: relative; display: flex; align-items: center; gap: 8px; padding: 8px;
        background: var(--card-background-color, #fff); min-height: var(--esl-item-height);
        z-index: 1; touch-action: pan-y; transition: transform 0.25s ease;
      }

      /* Checkbox */
      .checkbox {
        width: 22px; height: 22px; min-width: 22px; border-radius: 50%;
        border: 2px solid var(--divider-color, #bdbdbd); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: border-color 0.2s, background 0.2s; flex-shrink: 0;
      }
      .checkbox:hover { border-color: var(--primary-color); }
      .checkbox.checked { border-color: var(--primary-color); background: var(--primary-color); opacity: 0.7; }

      /* Name */
      .item-name {
        flex: 1; font-size: 14px; color: var(--primary-text-color); cursor: pointer; min-width: 0;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .name-edit {
        flex: 1; font-size: 14px; border: 1px solid var(--primary-color); border-radius: 4px;
        padding: 4px 6px; background: var(--card-background-color, #fff); color: var(--primary-text-color);
        font-family: inherit; outline: none; min-width: 0;
      }
      .completed-name { text-decoration: line-through; opacity: 0.6; }
      .completed-item { opacity: 0.6; cursor: pointer; }
      .completed-qty { font-size: 12px; color: var(--secondary-text-color); opacity: 0.8; white-space: nowrap; }

      /* Quantity */
      .qty-controls { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
      .qty-btn {
        width: 26px; height: 26px; border-radius: 50%;
        border: 1px solid var(--divider-color, #e0e0e0);
        background: var(--secondary-background-color, #f5f5f5);
        color: var(--primary-text-color); font-size: 16px; font-weight: 500;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        padding: 0; line-height: 1; transition: background 0.15s;
      }
      .qty-btn:hover { background: var(--divider-color, #e0e0e0); }
      .qty-btn:active { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
      .qty-value {
        min-width: 24px; text-align: center; font-size: 14px; font-weight: 500;
        cursor: pointer; color: var(--primary-text-color);
      }
      .qty-input {
        width: 40px; text-align: center; font-size: 14px;
        border: 1px solid var(--primary-color); border-radius: 4px; padding: 2px;
        background: var(--card-background-color, #fff); color: var(--primary-text-color);
        font-family: inherit; outline: none; -moz-appearance: textfield;
      }
      .qty-input::-webkit-inner-spin-button, .qty-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

      /* Note button */
      .note-btn {
        background: none; border: none; padding: 4px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        border-radius: 4px; transition: background 0.15s; flex-shrink: 0;
      }
      .note-btn:hover { background: var(--secondary-background-color, #f5f5f5); }
      .note-btn.has-note svg { opacity: 1; }
      .note-btn:not(.has-note) svg { opacity: 0.4; }

      /* Note editor — outside item-row so swipe backgrounds don't cover it */
      .note-editor {
        padding: 4px 8px 8px 38px;
        background: var(--card-background-color, #fff);
        border-radius: 0 0 var(--esl-radius) var(--esl-radius);
      }
      .note-input {
        width: 100%; box-sizing: border-box; padding: 6px 8px;
        border: 1px solid var(--divider-color, #e0e0e0); border-radius: 4px;
        background: var(--secondary-background-color, #f5f5f5); color: var(--primary-text-color);
        font-size: 13px; font-family: inherit; outline: none;
        resize: vertical; min-height: 36px; max-height: 100px; transition: border-color 0.2s;
      }
      .note-input:focus { border-color: var(--primary-color); }

      /* Completed */
      .completed-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; }
      .chevron { display: inline-block; font-size: 10px; transition: transform 0.25s; margin-left: 4px; }
      .chevron.open { transform: rotate(180deg); }
      .clear-btn {
        background: none; border: none; padding: 4px 6px; cursor: pointer; border-radius: 4px;
        display: flex; align-items: center; transition: background 0.15s; color: var(--secondary-text-color);
      }
      .clear-btn:hover { background: var(--secondary-background-color, #f5f5f5); }

      /* Confirm dialog */
      .confirm-dialog {
        display: flex; align-items: center; gap: 8px; padding: 8px;
        background: var(--secondary-background-color, #f5f5f5); border-radius: var(--esl-radius);
        margin-bottom: 8px; font-size: 13px; color: var(--primary-text-color);
      }
      .confirm-dialog span { flex: 1; }
      .confirm-yes, .confirm-no { padding: 4px 12px; border-radius: 4px; border: none; font-size: 13px; cursor: pointer; font-weight: 500; }
      .confirm-yes { background: #f44336; color: white; }
      .confirm-no { background: var(--divider-color, #e0e0e0); color: var(--primary-text-color); }

      .completed-list { animation: fadeIn 0.2s ease; }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

      @media (max-width: 400px) {
        .card-content { padding: 8px 12px 12px; }
        .item { gap: 6px; padding: 6px; }
        .qty-btn { width: 24px; height: 24px; font-size: 14px; }
      }
    `;
  }
}

/* ------------------------------------------------------------------ */
/*  Card config editor (NO Shadow DOM — ha-entity-picker needs light DOM) */
/* ------------------------------------------------------------------ */
class EnhancedShoppingListCardEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
  }

  set hass(hass) {
    this._hass = hass;
    const picker = this.querySelector("ha-entity-picker");
    if (picker) picker.hass = hass;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _render() {
    this.innerHTML = `
      <style>
        .esl-editor { padding: 16px; }
        .esl-editor .row { margin-bottom: 16px; }
        .esl-editor label {
          display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500;
          color: var(--primary-text-color);
        }
        .esl-editor input[type="text"], .esl-editor select {
          width: 100%; box-sizing: border-box; padding: 8px;
          border: 1px solid var(--divider-color); border-radius: 4px;
          background: var(--card-background-color); color: var(--primary-text-color);
          font-family: inherit; font-size: 14px;
        }
      </style>
      <div class="esl-editor">
        <div class="row" id="picker-row"></div>
        <div class="row">
          <label>Tytuł karty</label>
          <input type="text" id="esl-title"
            value="${(this._config.title || "").replace(/"/g, "&quot;")}"
            placeholder="Lista zakupów" />
        </div>
        <div class="row">
          <label>Sortowanie</label>
          <select id="esl-sort">
            <option value="manual"${this._config.sort_by === "manual" || !this._config.sort_by ? " selected" : ""}>Kolejność dodania</option>
            <option value="alphabetical"${this._config.sort_by === "alphabetical" ? " selected" : ""}>Alfabetycznie</option>
          </select>
        </div>
      </div>
    `;

    // HA entity picker — works in light DOM
    const pickerRow = this.querySelector("#picker-row");
    const label = document.createElement("label");
    label.textContent = "Lista todo";
    pickerRow.appendChild(label);

    const picker = document.createElement("ha-entity-picker");
    picker.hass = this._hass;
    picker.value = this._config.entity || "";
    picker.includeDomains = ["todo"];
    picker.required = true;
    picker.addEventListener("value-changed", (e) => {
      this._config = { ...this._config, entity: e.detail.value };
      this._fireChanged();
    });
    pickerRow.appendChild(picker);

    // Title
    this.querySelector("#esl-title").addEventListener("input", (e) => {
      this._config = { ...this._config, title: e.target.value };
      this._fireChanged();
    });

    // Sort
    this.querySelector("#esl-sort").addEventListener("change", (e) => {
      this._config = { ...this._config, sort_by: e.target.value };
      this._fireChanged();
    });
  }

  _fireChanged() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Register                                                           */
/* ------------------------------------------------------------------ */
customElements.define("enhanced-shopping-list-card", EnhancedShoppingListCard);
customElements.define("enhanced-shopping-list-card-editor", EnhancedShoppingListCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "enhanced-shopping-list-card",
  name: "Enhanced Shopping List",
  description: "Rozbudowana lista zakupów z ilościami, notatkami i fuzzy search — działa z natywną listą todo HA",
  preview: false,
});

console.info(
  "%c ENHANCED-SHOPPING-LIST %c v2.1.0 ",
  "background:#4CAF50;color:white;font-weight:bold;",
  "background:#333;color:white;"
);
