/**
 * Enhanced Shopping List Card for Home Assistant
 * Lovelace custom card using LitElement
 */

const LitElement = customElements.get("hui-masonry-view")
  ? Object.getPrototypeOf(customElements.get("hui-masonry-view"))
  : Object.getPrototypeOf(customElements.get("hui-view"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

/* ------------------------------------------------------------------ */
/*  Fuzzy search helper                                                */
/* ------------------------------------------------------------------ */
function fuzzyScore(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 1000 - t.indexOf(q); // substring match = best
  let qi = 0;
  let score = 0;
  let lastIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      if (lastIdx !== -1 && ti - lastIdx === 1) score += 5; // consecutive bonus
      lastIdx = ti;
      qi++;
    }
  }
  return qi === q.length ? score : 0; // all chars must match
}

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */
class EnhancedShoppingListCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
      _items: { type: Array },
      _inputValue: { type: String },
      _suggestions: { type: Array },
      _completedExpanded: { type: Boolean },
      _editingNote: { type: String }, // item id with open note editor
      _editingName: { type: String }, // item id with open name editor
      _editingQty: { type: String }, // item id with open qty editor
      _showConfirmClear: { type: Boolean },
      _touchState: { type: Object },
      _swipedItemId: { type: String },
      _swipeOffset: { type: Number },
    };
  }

  constructor() {
    super();
    this._items = [];
    this._inputValue = "";
    this._suggestions = [];
    this._completedExpanded = false;
    this._editingNote = null;
    this._editingName = null;
    this._editingQty = null;
    this._showConfirmClear = false;
    this._touchState = null;
    this._swipedItemId = null;
    this._swipeOffset = 0;
    this._debounceTimer = null;
    this._unsubscribe = null;
  }

  setConfig(config) {
    this._config = config;
  }

  getCardSize() {
    return 3;
  }

  static getConfigElement() {
    return document.createElement("enhanced-shopping-list-card-editor");
  }

  static getStubConfig() {
    return { title: "Lista zakupów" };
  }

  /* ---------- lifecycle ---------- */

  connectedCallback() {
    super.connectedCallback();
    this._subscribeEvents();
    this._fetchItems();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  updated(changed) {
    if (changed.has("hass") && this.hass && !this._unsubscribe) {
      this._subscribeEvents();
      this._fetchItems();
    }
  }

  _subscribeEvents() {
    if (!this.hass || !this.hass.connection || this._unsubscribe) return;
    this.hass.connection
      .subscribeEvents(() => this._fetchItems(), "enhanced_shopping_list_updated")
      .then((unsub) => {
        this._unsubscribe = unsub;
      });
  }

  async _fetchItems() {
    if (!this.hass) return;
    try {
      const result = await this.hass.connection.sendMessagePromise({
        type: "enhanced_shopping_list/items",
      });
      this._items = result || [];
    } catch (e) {
      console.error("Enhanced Shopping List: failed to fetch items", e);
    }
  }

  /* ---------- WS helpers ---------- */

  async _wsCommand(type, data = {}) {
    if (!this.hass) return;
    try {
      await this.hass.connection.sendMessagePromise({ type, ...data });
    } catch (e) {
      console.error(`Enhanced Shopping List WS error (${type}):`, e);
    }
  }

  /* ---------- input / suggestions ---------- */

  _onInput(e) {
    this._inputValue = e.target.value;
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._updateSuggestions(), 300);
  }

  _updateSuggestions() {
    const q = (this._inputValue || "").trim();
    if (q.length < 2) {
      this._suggestions = [];
      return;
    }
    const scored = this._items
      .map((item) => ({ item, score: fuzzyScore(q, item.name) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // Deduplicate by name (keep highest score)
    const seen = new Set();
    const unique = [];
    for (const s of scored) {
      const key = s.item.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }
    this._suggestions = unique.slice(0, 5);
  }

  _onKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      this._addCurrentInput();
    }
  }

  async _addCurrentInput() {
    const name = (this._inputValue || "").trim();
    if (!name) return;
    await this._wsCommand("enhanced_shopping_list/add", { name, quantity: 1 });
    this._inputValue = "";
    this._suggestions = [];
    const input = this.shadowRoot.querySelector(".add-input");
    if (input) input.value = "";
  }

  async _selectSuggestion(item) {
    if (!item.complete) {
      // Already on active list -> +1 quantity
      await this._wsCommand("enhanced_shopping_list/update", {
        item_id: item.id,
        quantity: (item.quantity || 1) + 1,
      });
    } else {
      // Completed -> reactivate
      await this._wsCommand("enhanced_shopping_list/uncomplete", {
        item_id: item.id,
      });
    }
    this._inputValue = "";
    this._suggestions = [];
    const input = this.shadowRoot.querySelector(".add-input");
    if (input) input.value = "";
  }

  /* ---------- item actions ---------- */

  async _toggleComplete(item) {
    if (item.complete) {
      await this._wsCommand("enhanced_shopping_list/uncomplete", { item_id: item.id });
    } else {
      await this._wsCommand("enhanced_shopping_list/complete", { item_id: item.id });
    }
  }

  async _removeItem(item) {
    this._swipedItemId = null;
    this._swipeOffset = 0;
    await this._wsCommand("enhanced_shopping_list/remove", { item_id: item.id });
  }

  async _changeQty(item, delta) {
    const newQty = Math.max(1, (item.quantity || 1) + delta);
    await this._wsCommand("enhanced_shopping_list/update", {
      item_id: item.id,
      quantity: newQty,
    });
  }

  async _setQty(item, val) {
    const q = parseInt(val, 10);
    if (!isNaN(q) && q >= 1) {
      await this._wsCommand("enhanced_shopping_list/update", {
        item_id: item.id,
        quantity: q,
      });
    }
    this._editingQty = null;
  }

  async _saveNote(item, text) {
    await this._wsCommand("enhanced_shopping_list/update", {
      item_id: item.id,
      notes: text,
    });
  }

  async _saveName(item, newName) {
    const name = (newName || "").trim();
    if (name && name !== item.name) {
      await this._wsCommand("enhanced_shopping_list/update", {
        item_id: item.id,
        name,
      });
    }
    this._editingName = null;
  }

  async _clearCompleted() {
    this._showConfirmClear = false;
    await this._wsCommand("enhanced_shopping_list/clear_completed");
  }

  /* ---------- touch / swipe ---------- */

  _onTouchStart(e, item) {
    const touch = e.touches[0];
    this._touchState = {
      id: item.id,
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      locked: false,
      direction: null,
    };
    // If a different item was swiped, reset it
    if (this._swipedItemId && this._swipedItemId !== item.id) {
      this._swipedItemId = null;
      this._swipeOffset = 0;
    }
  }

  _onTouchMove(e, item) {
    if (!this._touchState || this._touchState.id !== item.id) return;
    const touch = e.touches[0];
    const dx = touch.clientX - this._touchState.startX;
    const dy = touch.clientY - this._touchState.startY;

    // Determine direction on first significant move
    if (!this._touchState.direction) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        this._touchState.direction = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
    }

    if (this._touchState.direction === "h") {
      e.preventDefault();
      // For active items: allow both left (delete) and right (complete)
      // For completed items: only left (delete)
      if (!item.complete) {
        this._swipeOffset = dx;
      } else {
        this._swipeOffset = Math.min(0, dx); // only left
      }
      this._swipedItemId = item.id;
    }
  }

  _onTouchEnd(e, item) {
    if (!this._touchState || this._touchState.id !== item.id) {
      this._touchState = null;
      return;
    }

    const offset = this._swipeOffset;
    const THRESHOLD = 80;

    if (offset > THRESHOLD && !item.complete) {
      // Swipe right -> complete
      this._swipedItemId = null;
      this._swipeOffset = 0;
      this._toggleComplete(item);
    } else if (offset < -THRESHOLD) {
      // Swipe left -> show delete button (keep swiped state)
      this._swipeOffset = -80;
    } else {
      // Not far enough -> snap back
      this._swipedItemId = null;
      this._swipeOffset = 0;
    }
    this._touchState = null;
  }

  /* ---------- render ---------- */

  get _activeItems() {
    return this._items.filter((i) => !i.complete);
  }

  get _completedItems() {
    return this._items.filter((i) => i.complete);
  }

  render() {
    const title = (this._config && this._config.title) || "Lista zakupów";
    return html`
      <ha-card>
        <div class="card-header">${title}</div>
        <div class="card-content">
          ${this._renderAddInput()}
          ${this._renderActiveList()}
          ${this._renderCompletedList()}
        </div>
      </ha-card>
    `;
  }

  _renderAddInput() {
    return html`
      <div class="add-section">
        <div class="input-wrapper">
          <input
            class="add-input"
            type="text"
            placeholder="Dodaj produkt..."
            .value="${this._inputValue}"
            @input="${this._onInput}"
            @keydown="${this._onKeyDown}"
            @blur="${() => setTimeout(() => (this._suggestions = []), 200)}"
          />
        </div>
        ${this._suggestions.length > 0
          ? html`
              <div class="suggestions">
                ${this._suggestions.map((s) => this._renderSuggestion(s.item))}
              </div>
            `
          : ""}
      </div>
    `;
  }

  _renderSuggestion(item) {
    const onList = !item.complete;
    const badge = onList
      ? html`<span class="badge">na liście: ${item.quantity || 1} szt.</span>`
      : "";
    return html`
      <div class="suggestion" @mousedown="${() => this._selectSuggestion(item)}">
        <span class="suggestion-name">${item.name}</span>
        ${badge}
      </div>
    `;
  }

  _renderActiveList() {
    const items = this._activeItems;
    return html`
      <div class="section">
        <div class="section-header">Do zakupu (${items.length})</div>
        ${items.length === 0
          ? html`<div class="empty">Lista zakupów jest pusta</div>`
          : items.map((item) => this._renderActiveItem(item))}
      </div>
    `;
  }

  _renderActiveItem(item) {
    const isSwiped = this._swipedItemId === item.id;
    const offset = isSwiped ? this._swipeOffset : 0;
    const showDeleteBtn = offset < -40;

    return html`
      <div class="item-container">
        <div class="swipe-bg-right">
          <span class="swipe-icon">&#10003;</span>
        </div>
        <div class="swipe-bg-left">
          <span
            class="delete-btn-swipe"
            @click="${() => this._removeItem(item)}"
          >Usuń</span>
        </div>
        <div
          class="item"
          style="transform: translateX(${offset}px); transition: ${
            this._touchState && this._touchState.id === item.id
              ? "none"
              : "transform 0.25s ease"
          }"
          @touchstart="${(e) => this._onTouchStart(e, item)}"
          @touchmove="${(e) => this._onTouchMove(e, item)}"
          @touchend="${(e) => this._onTouchEnd(e, item)}"
        >
          <div
            class="checkbox"
            @click="${() => this._toggleComplete(item)}"
          ></div>

          ${this._editingName === item.id
            ? html`
                <input
                  class="name-edit"
                  type="text"
                  .value="${item.name}"
                  @blur="${(e) => this._saveName(item, e.target.value)}"
                  @keydown="${(e) => {
                    if (e.key === "Enter") this._saveName(item, e.target.value);
                    if (e.key === "Escape") this._editingName = null;
                  }}"
                  @click="${(e) => e.stopPropagation()}"
                />
              `
            : html`
                <span
                  class="item-name"
                  @click="${() => (this._editingName = item.id)}"
                >${item.name}</span>
              `}

          <div class="qty-controls">
            <button class="qty-btn" @click="${() => this._changeQty(item, -1)}">-</button>
            ${this._editingQty === item.id
              ? html`
                  <input
                    class="qty-input"
                    type="number"
                    min="1"
                    .value="${String(item.quantity || 1)}"
                    @blur="${(e) => this._setQty(item, e.target.value)}"
                    @keydown="${(e) => {
                      if (e.key === "Enter") this._setQty(item, e.target.value);
                    }}"
                    @click="${(e) => e.stopPropagation()}"
                  />
                `
              : html`
                  <span
                    class="qty-value"
                    @click="${() => (this._editingQty = item.id)}"
                  >${item.quantity || 1}</span>
                `}
            <button class="qty-btn" @click="${() => this._changeQty(item, 1)}">+</button>
          </div>

          <button
            class="note-btn ${item.notes ? "has-note" : ""}"
            @click="${() =>
              (this._editingNote =
                this._editingNote === item.id ? null : item.id)}"
            title="${item.notes || "Dodaj notatkę"}"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="${item.notes ? "var(--primary-color)" : "none"}" stroke="${item.notes ? "var(--primary-color)" : "var(--secondary-text-color)"}" stroke-width="1.5"/>
              <polyline points="14,2 14,8 20,8" fill="none" stroke="${item.notes ? "var(--primary-color)" : "var(--secondary-text-color)"}" stroke-width="1.5"/>
              <line x1="8" y1="13" x2="16" y2="13" stroke="${item.notes ? "var(--primary-color)" : "var(--secondary-text-color)"}" stroke-width="1.5"/>
              <line x1="8" y1="17" x2="13" y2="17" stroke="${item.notes ? "var(--primary-color)" : "var(--secondary-text-color)"}" stroke-width="1.5"/>
            </svg>
          </button>
        </div>

        ${this._editingNote === item.id
          ? html`
              <div class="note-editor">
                <textarea
                  class="note-input"
                  placeholder="Dodaj notatkę..."
                  .value="${item.notes || ""}"
                  @blur="${(e) => this._saveNote(item, e.target.value)}"
                  @keydown="${(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      this._saveNote(item, e.target.value);
                      this._editingNote = null;
                    }
                  }}"
                ></textarea>
              </div>
            `
          : ""}
      </div>
    `;
  }

  _renderCompletedList() {
    const items = this._completedItems;
    if (items.length === 0) return "";

    return html`
      <div class="section completed-section">
        <div
          class="section-header completed-header"
          @click="${() => (this._completedExpanded = !this._completedExpanded)}"
        >
          <span>
            Kupione (${items.length})
            <span class="chevron ${this._completedExpanded ? "open" : ""}">&#9660;</span>
          </span>
          <button
            class="clear-btn"
            @click="${(e) => {
              e.stopPropagation();
              this._showConfirmClear = true;
            }}"
            title="Wyczyść kupione"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" fill="none" stroke="var(--secondary-text-color)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        ${this._showConfirmClear
          ? html`
              <div class="confirm-dialog">
                <span>Usunąć wszystkie kupione?</span>
                <button class="confirm-yes" @click="${this._clearCompleted}">Tak</button>
                <button
                  class="confirm-no"
                  @click="${() => (this._showConfirmClear = false)}"
                >Nie</button>
              </div>
            `
          : ""}

        ${this._completedExpanded
          ? html`
              <div class="completed-list">
                ${items.map((item) => this._renderCompletedItem(item))}
              </div>
            `
          : ""}
      </div>
    `;
  }

  _renderCompletedItem(item) {
    const isSwiped = this._swipedItemId === item.id;
    const offset = isSwiped ? this._swipeOffset : 0;

    return html`
      <div class="item-container">
        <div class="swipe-bg-left">
          <span
            class="delete-btn-swipe"
            @click="${() => this._removeItem(item)}"
          >Usuń</span>
        </div>
        <div
          class="item completed-item"
          style="transform: translateX(${offset}px); transition: ${
            this._touchState && this._touchState.id === item.id
              ? "none"
              : "transform 0.25s ease"
          }"
          @touchstart="${(e) => this._onTouchStart(e, item)}"
          @touchmove="${(e) => this._onTouchMove(e, item)}"
          @touchend="${(e) => this._onTouchEnd(e, item)}"
          @click="${() => this._toggleComplete(item)}"
        >
          <div class="checkbox checked">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <polyline points="4,12 10,18 20,6" fill="none" stroke="var(--primary-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <span class="item-name completed-name">${item.name}</span>
          <span class="completed-qty">${item.quantity || 1} szt.</span>
        </div>
      </div>
    `;
  }

  /* ---------- styles ---------- */

  static get styles() {
    return css`
      :host {
        --esl-radius: 8px;
        --esl-gap: 8px;
        --esl-item-height: 44px;
      }

      ha-card {
        overflow: hidden;
      }

      .card-header {
        padding: 16px 16px 0;
        font-size: 18px;
        font-weight: 500;
        color: var(--primary-text-color);
      }

      .card-content {
        padding: 12px 16px 16px;
      }

      /* --- Add input --- */
      .add-section {
        position: relative;
        margin-bottom: 16px;
      }

      .input-wrapper {
        position: relative;
      }

      .add-input {
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: var(--esl-radius);
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 14px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.2s;
      }

      .add-input:focus {
        border-color: var(--primary-color);
      }

      .add-input::placeholder {
        color: var(--secondary-text-color);
        opacity: 0.7;
      }

      /* --- Suggestions --- */
      .suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 10;
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e0e0e0);
        border-top: none;
        border-radius: 0 0 var(--esl-radius) var(--esl-radius);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        overflow: hidden;
      }

      .suggestion {
        padding: 10px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        color: var(--primary-text-color);
        transition: background 0.15s;
      }

      .suggestion:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .suggestion-name {
        flex: 1;
      }

      .badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 10px;
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        white-space: nowrap;
      }

      /* --- Section --- */
      .section {
        margin-bottom: 12px;
      }

      .section-header {
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--secondary-text-color);
        padding: 8px 0 6px;
      }

      .empty {
        padding: 20px 0;
        text-align: center;
        color: var(--secondary-text-color);
        font-size: 14px;
        opacity: 0.7;
      }

      /* --- Item --- */
      .item-container {
        position: relative;
        overflow: hidden;
        border-radius: var(--esl-radius);
        margin-bottom: 4px;
      }

      .swipe-bg-right {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 100%;
        background: #4caf50;
        display: flex;
        align-items: center;
        padding-left: 16px;
        color: white;
        font-weight: bold;
      }

      .swipe-bg-left {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        background: #f44336;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: 0;
      }

      .swipe-icon {
        font-size: 20px;
      }

      .delete-btn-swipe {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 100%;
        color: white;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
      }

      .item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 8px;
        background: var(--card-background-color, #fff);
        min-height: var(--esl-item-height);
        z-index: 1;
        touch-action: pan-y;
      }

      /* --- Checkbox --- */
      .checkbox {
        width: 22px;
        height: 22px;
        min-width: 22px;
        border-radius: 50%;
        border: 2px solid var(--divider-color, #bdbdbd);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-color 0.2s, background 0.2s;
        flex-shrink: 0;
      }

      .checkbox:hover {
        border-color: var(--primary-color);
      }

      .checkbox.checked {
        border-color: var(--primary-color);
        background: var(--primary-color);
        opacity: 0.7;
      }

      .checkbox.checked svg {
        stroke: var(--text-primary-color, #fff);
      }

      /* --- Name --- */
      .item-name {
        flex: 1;
        font-size: 14px;
        color: var(--primary-text-color);
        cursor: pointer;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .name-edit {
        flex: 1;
        font-size: 14px;
        border: 1px solid var(--primary-color);
        border-radius: 4px;
        padding: 4px 6px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-family: inherit;
        outline: none;
        min-width: 0;
      }

      .completed-name {
        text-decoration: line-through;
        opacity: 0.6;
      }

      .completed-item {
        opacity: 0.6;
        cursor: pointer;
      }

      .completed-qty {
        font-size: 12px;
        color: var(--secondary-text-color);
        opacity: 0.8;
        white-space: nowrap;
      }

      /* --- Quantity --- */
      .qty-controls {
        display: flex;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
      }

      .qty-btn {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 1px solid var(--divider-color, #e0e0e0);
        background: var(--secondary-background-color, #f5f5f5);
        color: var(--primary-text-color);
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
        transition: background 0.15s;
      }

      .qty-btn:hover {
        background: var(--divider-color, #e0e0e0);
      }

      .qty-btn:active {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-color: var(--primary-color);
      }

      .qty-value {
        min-width: 24px;
        text-align: center;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        color: var(--primary-text-color);
      }

      .qty-input {
        width: 40px;
        text-align: center;
        font-size: 14px;
        border: 1px solid var(--primary-color);
        border-radius: 4px;
        padding: 2px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-family: inherit;
        outline: none;
        -moz-appearance: textfield;
      }

      .qty-input::-webkit-inner-spin-button,
      .qty-input::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      /* --- Note button --- */
      .note-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background 0.15s;
        flex-shrink: 0;
      }

      .note-btn:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .note-btn.has-note svg {
        opacity: 1;
      }

      .note-btn:not(.has-note) svg {
        opacity: 0.4;
      }

      /* --- Note editor --- */
      .note-editor {
        padding: 0 8px 8px 38px;
        background: var(--card-background-color, #fff);
      }

      .note-input {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 8px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 4px;
        background: var(--secondary-background-color, #f5f5f5);
        color: var(--primary-text-color);
        font-size: 13px;
        font-family: inherit;
        outline: none;
        resize: vertical;
        min-height: 36px;
        max-height: 100px;
        transition: border-color 0.2s;
      }

      .note-input:focus {
        border-color: var(--primary-color);
      }

      /* --- Completed section --- */
      .completed-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
      }

      .chevron {
        display: inline-block;
        font-size: 10px;
        transition: transform 0.25s;
        margin-left: 4px;
      }

      .chevron.open {
        transform: rotate(180deg);
      }

      .clear-btn {
        background: none;
        border: none;
        padding: 4px 6px;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        transition: background 0.15s;
      }

      .clear-btn:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      /* --- Confirm dialog --- */
      .confirm-dialog {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        background: var(--secondary-background-color, #f5f5f5);
        border-radius: var(--esl-radius);
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--primary-text-color);
      }

      .confirm-dialog span {
        flex: 1;
      }

      .confirm-yes,
      .confirm-no {
        padding: 4px 12px;
        border-radius: 4px;
        border: none;
        font-size: 13px;
        cursor: pointer;
        font-weight: 500;
      }

      .confirm-yes {
        background: #f44336;
        color: white;
      }

      .confirm-no {
        background: var(--divider-color, #e0e0e0);
        color: var(--primary-text-color);
      }

      .completed-list {
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* --- Responsive --- */
      @media (max-width: 400px) {
        .card-content {
          padding: 8px 12px 12px;
        }
        .item {
          gap: 6px;
          padding: 6px;
        }
        .qty-btn {
          width: 24px;
          height: 24px;
          font-size: 14px;
        }
      }
    `;
  }
}

/* ------------------------------------------------------------------ */
/*  Simple editor for card config                                      */
/* ------------------------------------------------------------------ */
class EnhancedShoppingListCardEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
    };
  }

  setConfig(config) {
    this._config = config;
  }

  get _title() {
    return (this._config && this._config.title) || "";
  }

  render() {
    return html`
      <div style="padding: 16px;">
        <label style="display:block; margin-bottom:4px; font-size:14px; color:var(--primary-text-color);">
          Tytuł karty
        </label>
        <input
          type="text"
          .value="${this._title}"
          @input="${this._titleChanged}"
          placeholder="Lista zakupów"
          style="width:100%; box-sizing:border-box; padding:8px; border:1px solid var(--divider-color); border-radius:4px; background:var(--card-background-color); color:var(--primary-text-color); font-family:inherit;"
        />
      </div>
    `;
  }

  _titleChanged(e) {
    const newConfig = { ...this._config, title: e.target.value };
    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

/* ------------------------------------------------------------------ */
/*  Register                                                           */
/* ------------------------------------------------------------------ */
customElements.define("enhanced-shopping-list-card", EnhancedShoppingListCard);
customElements.define(
  "enhanced-shopping-list-card-editor",
  EnhancedShoppingListCardEditor
);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "enhanced-shopping-list-card",
  name: "Enhanced Shopping List",
  description: "Rozbudowana lista zakupów z ilościami, notatkami i fuzzy search",
  preview: true,
});
