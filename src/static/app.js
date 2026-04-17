import { LitElement, html } from "https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js";
import { openMetronome } from "/metronome.js";

const COMPACT_BREAKPOINT = 720;
const VALID_SORT_OPTIONS = new Set(["artist", "lick", "goal", "best", "pct", "sessions", "first", "last"]);
const VALID_DIR_OPTIONS = new Set(["asc", "desc"]);
const VALID_PROGRESS_FILTERS = new Set(["all", "new", "progress", "done"]);
const STEPPER_INCREMENT_KEYS = ["ArrowUp", "+", "=", "NumpadAdd"];
const STEPPER_DECREMENT_KEYS = ["ArrowDown", "-", "NumpadSubtract"];

class RpmApp extends LitElement {
  static properties = {
    artists: { state: true },
    licks: { state: true },
    filterArtistId: { state: true },
    sortBy: { state: true },
    sortDir: { state: true },
    loading: { state: true },
    error: { state: true },
    activeLick: { state: true },
    editLick: { state: true },
    sessions: { state: true },
    sessionSortBy: { state: true },
    sessionSortDir: { state: true },
    addValue: { state: true },
    addSessionMax: { state: true },
    addSessionSaveAttempted: { state: true },
    addLickRows: { state: true },
    compact: { state: true },
    progressFilter: { state: true },
    lickFilter: { state: true },
  };

  createRenderRoot() {
    // Render in light DOM so global styles.css can style app content.
    return this;
  }

  constructor() {
    super();
    this.artists = [];
    this.licks = [];
    this.filterArtistId = "";
    this.sortBy = "artist";
    this.sortDir = "asc";
    this.loading = false;
    this.error = "";
    this.activeLick = null;
    this.editLick = null;
    this.sessions = [];
    this.sessionSortBy = "date";
    this.sessionSortDir = "desc";
    this.addValue = 0;
    this.addSessionMax = 0;
    this.addSessionSaveAttempted = false;
    this.addLickRows = [this._createAddLickRow()];
    this.progressFilter = "all";
    this.lickFilter = "";
    this.compact = typeof window !== "undefined" ? window.innerWidth <= COMPACT_BREAKPOINT : false;
    this._onResize = () => {
      const next = window.innerWidth <= COMPACT_BREAKPOINT;
      if (next !== this.compact) {
        this.compact = next;
      }
    };
    this._onPopState = async () => {
      this.applyUrlState(new URLSearchParams(window.location.search));
      await this.reloadLicks();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("resize", this._onResize);
    window.addEventListener("popstate", this._onPopState);
    this._onKeydown = (event) => {
      if (this.routeAddSessionMetronomeKeydown(event)) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        const input = this.el("lickSearch");
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }
      }
      if (event.key === "Escape") {
        const input = this.el("lickSearch");
        if (input instanceof HTMLInputElement && document.activeElement === input) {
          this.lickFilter = "";
          input.blur();
        }
      }
    };
    window.addEventListener("keydown", this._onKeydown);
    this.applyUrlState(new URLSearchParams(window.location.search));
    this.loadAll();
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("popstate", this._onPopState);
    window.removeEventListener("keydown", this._onKeydown);
    super.disconnectedCallback();
  }

  applyUrlState(params) {
    const sortBy = params.get("sort");
    const sortDir = params.get("dir");
    const artist = params.get("artist");
    const progress = params.get("progress");

    if (sortBy && VALID_SORT_OPTIONS.has(sortBy)) {
      this.sortBy = sortBy;
    }
    if (sortDir && VALID_DIR_OPTIONS.has(sortDir)) {
      this.sortDir = sortDir;
    }
    if (artist !== null) {
      this.filterArtistId = artist;
    }
    if (progress && VALID_PROGRESS_FILTERS.has(progress)) {
      this.progressFilter = progress;
    }
  }

  syncUrlState() {
    const params = new URLSearchParams();
    if (this.filterArtistId) {
      params.set("artist", this.filterArtistId);
    }
    if (this.sortBy !== "artist") {
      params.set("sort", this.sortBy);
    }
    if (this.sortDir !== "asc") {
      params.set("dir", this.sortDir);
    }
    if (this.progressFilter !== "all") {
      params.set("progress", this.progressFilter);
    }
    const query = params.toString();
    const nextUrl = query ? `?${query}` : window.location.pathname;
    history.replaceState(null, "", nextUrl);
  }

  localDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  el(id) {
    return this.renderRoot?.querySelector(`#${id}`);
  }

  openDialog(id, options = {}) {
    const dialog = this.el(id);
    if (!dialog) {
      return;
    }
    dialog.showModal();
    this._applyDialogFocus(dialog, options.desktopFocusId);
  }

  closeDialog(id) {
    const dialog = this.el(id);
    if (!dialog) {
      return;
    }
    dialog.close();
  }

  _applyDialogFocus(dialog, desktopFocusId) {
    requestAnimationFrame(() => {
      if (this.compact) {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
          active.blur();
        }
        if (dialog instanceof HTMLElement) {
          dialog.focus();
        }
        return;
      }

      if (!desktopFocusId) {
        return;
      }
      const target = this.el(desktopFocusId);
      if (!(target instanceof HTMLElement)) {
        return;
      }
      target.focus();
      if (target instanceof HTMLInputElement) {
        target.select();
      }
    });
  }

  async api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("X-Local-Date", this.localDate());
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload;
  }

  async loadAll() {
    this.loading = true;
    this.error = "";
    try {
      const [artistsResp, licksResp] = await Promise.all([
        this.api("/api/artists"),
        this.api(this.licksUrl()),
      ]);
      this.artists = artistsResp.data || [];
      this.licks = licksResp.data || [];
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  licksUrl() {
    const params = new URLSearchParams();
    if (this.filterArtistId) {
      params.set("artist_id", this.filterArtistId);
    }
    params.set("sort_by", this.sortBy);
    params.set("sort_dir", this.sortDir);
    return `/api/licks?${params.toString()}`;
  }

  async reloadLicks() {
    this.loading = true;
    this.error = "";
    try {
      const resp = await this.api(this.licksUrl());
      this.licks = resp.data || [];
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  onSort(col) {
    if (this.sortBy === col) {
      this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
    } else {
      this.sortBy = col;
      this.sortDir = "asc";
    }
    this.syncUrlState();
    this.reloadLicks();
  }

  sortChip(label, key) {
    const active = this.sortBy === key;
    const marker = active ? (this.sortDir === "asc" ? "↑" : "↓") : "";
    return html`<button class="btn btn-small ${active ? "chip-active" : "chip"}" @click=${() => this.onSort(key)}>
      ${label} ${marker}
    </button>`;
  }

  async onArtistFilter(event) {
    this.filterArtistId = event.target.value;
    this.syncUrlState();
    await this.reloadLicks();
  }

  setProgressFilter(filter) {
    this.progressFilter = this.progressFilter === filter ? "all" : filter;
    this.syncUrlState();
  }

  onLickFilter(event) {
    this.lickFilter = event.target.value;
  }

  isDoneRow(row) {
    return row.pct_of_goal !== null && row.pct_of_goal >= 100;
  }

  isInProgressRow(row) {
    return row.session_count > 0 && row.pct_of_goal !== null && row.pct_of_goal < 100;
  }

  canAddSession(row) {
    return row?.can_add_today !== false;
  }

  async openSessions(lick) {
    this.activeLick = lick;
    this.sessionSortBy = "date";
    this.sessionSortDir = "desc";
    await this.loadSessions();
    this.openDialog("sessionsDialog");
  }

  async loadSessions() {
    if (!this.activeLick) {
      return;
    }
    const params = new URLSearchParams({
      sort_by: this.sessionSortBy,
      sort_dir: this.sessionSortDir,
    });
    const resp = await this.api(`/api/licks/${this.activeLick.id}/sessions?${params.toString()}`);
    this.sessions = resp.data || [];
  }

  async sortSessions(col) {
    if (this.sessionSortBy === col) {
      this.sessionSortDir = this.sessionSortDir === "asc" ? "desc" : "asc";
    } else {
      this.sessionSortBy = col;
      this.sessionSortDir = "desc";
    }
    await this.loadSessions();
  }

  openAddSession(lick) {
    if (!this.canAddSession(lick)) {
      return;
    }
    this.activeLick = lick;
    this.addSessionMax = lick.goal_rpm;
    this.addValue = Math.max(1, Math.min(this.addSessionMax, lick.best_rpm ?? 1));
    this.addSessionSaveAttempted = false;
    this.openDialog("addSessionDialog", { desktopFocusId: "addSessionMetronome" });
  }

  onAddSessionTempoChange(event) {
    this.addValue = event.detail.bpm;
    this.addSessionSaveAttempted = false;
  }

  stopAddSessionMetronome() {
    this.el("addSessionMetronome")?.stop?.();
  }

  routeAddSessionMetronomeKeydown(event) {
    const dialog = this.el("addSessionDialog");
    if (!dialog?.open || event.defaultPrevented || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
      return false;
    }
    const metronome = this.el("addSessionMetronome");
    if (!metronome?.handleKeydown) {
      return false;
    }
    metronome.handleKeydown(event);
    return true;
  }

  onAddSessionDialogKeydown(event) {
    this.routeAddSessionMetronomeKeydown(event);
  }

  _stepperButtonClass(isDisabled) {
    return `btn btn-step${isDisabled ? " btn-step-disabled" : ""}`;
  }

  _onStepperPress(event, isDisabled, adjustFn, delta) {
    event.preventDefault();
    if (isDisabled) {
      return;
    }
    adjustFn.call(this, delta);
  }

  renderStepperButton(label, isDisabled, adjustFn, delta) {
    return html`
      <button
        type="button"
        class=${this._stepperButtonClass(isDisabled)}
        aria-disabled=${String(isDisabled)}
        @click=${(event) => this._onStepperPress(event, isDisabled, adjustFn, delta)}
      >
        ${label}
      </button>
    `;
  }

  addValueValidationError() {
    if (!Number.isInteger(this.addValue)) {
      return "RPM must be an integer";
    }
    if (this.activeLick?.best_rpm !== null && this.activeLick?.best_rpm !== undefined && this.addValue <= this.activeLick.best_rpm) {
      return `RPM must be greater than current best (${this.activeLick.best_rpm})`;
    }
    if (this.addValue < 1 || this.addValue > this.addSessionMax) {
      return `RPM must be between 1 and ${this.addSessionMax}`;
    }
    return "";
  }

  _updateGoalInput(elementId, minGoal) {
    const input = this.el(elementId);
    if (!input) {
      return;
    }
    const raw = Number(input.value || 0);
    input.value = String(Math.max(minGoal, raw));
  }

  _adjustGoalInput(elementId, minGoal, delta) {
    const input = this.el(elementId);
    if (!input) {
      return;
    }
    const current = Number(input.value || 0);
    const base = Number.isFinite(current) && current > 0 ? current : minGoal;
    const next = Math.max(minGoal, base + delta);
    input.value = String(next);
  }

  _createAddLickRow() {
    return { lickName: "", goalRpm: "120" };
  }

  resetAddLickRows() {
    this.addLickRows = [this._createAddLickRow()];
  }

  _setAddLickRow(index, patch) {
    this.addLickRows = this.addLickRows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    );
  }

  updateAddLickName(index, event) {
    this._setAddLickRow(index, { lickName: event.target.value });
  }

  updateAddLickGoal(index, event) {
    const raw = event.target.value;
    if (raw === "") {
      this._setAddLickRow(index, { goalRpm: "" });
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      return;
    }
    this._setAddLickRow(index, { goalRpm: String(Math.max(1, Math.trunc(next))) });
  }

  adjustAddLickGoal(index, delta) {
    const current = Number(this.addLickRows[index]?.goalRpm || 0);
    const base = Number.isFinite(current) && current > 0 ? current : 120;
    this._setAddLickRow(index, { goalRpm: String(Math.max(1, base + delta)) });
  }

  addLickRow(index) {
    const rows = [...this.addLickRows];
    const nextIndex = index + 1;
    rows.splice(nextIndex, 0, this._createAddLickRow());
    this.addLickRows = rows;
    requestAnimationFrame(() => {
      const input = this.el(nextIndex === 0 ? "lickName" : `lickName-${nextIndex}`);
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    });
  }

  deleteAddLickRow(index) {
    if (index === 0 || this.addLickRows.length <= 1) {
      return;
    }
    this.addLickRows = this.addLickRows.filter((_, rowIndex) => rowIndex !== index);
  }

  addLickRowsValidationError() {
    const populated = this.addLickRows.filter((row) => row.lickName.trim());
    if (populated.length === 0) {
      return "Enter at least one lick";
    }
    const invalidGoal = populated.find((row) => {
      const goalRpm = Number(row.goalRpm);
      return !Number.isInteger(goalRpm) || goalRpm <= 0;
    });
    if (invalidGoal) {
      return "Each lick needs a positive integer Goal RPM";
    }
    return "";
  }

  _addLickRowKeydown(index, adjustFn) {
    return (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.addLickRow(index);
        return;
      }
      if (adjustFn) {
        this._stepperKeydown(adjustFn).call(this, event);
      }
    };
  }

  async submitAddSession() {
    if (!this.activeLick) {
      return;
    }
    if (!this.canAddSession(this.activeLick)) {
      this.error = "Cannot add session when best RPM already meets/exceeds goal";
      return;
    }
    const addError = this.addValueValidationError();
    if (addError) {
      this.addSessionSaveAttempted = true;
      this.error = addError;
      return;
    }
    try {
      await this.api(`/api/licks/${this.activeLick.id}/sessions`, {
        method: "POST",
        body: JSON.stringify({ rpm: this.addValue }),
      });
      this.closeDialog("addSessionDialog");
      await this.reloadLicks();
    } catch (err) {
      this.error = err.message;
    }
  }

  async submitAddLick() {
    const activeArtist = this.artists.find((artist) => String(artist.id) === this.filterArtistId);
    const artistName = activeArtist?.name || "";
    const validationError = this.addLickRowsValidationError();
    const licks = this.addLickRows
      .map((row) => ({
        lickName: row.lickName.trim(),
        goalRpm: Number(row.goalRpm),
      }))
      .filter((row) => row.lickName);
    if (!artistName) {
      this.error = "Select an artist before adding a lick";
      return;
    }
    if (validationError) {
      this.error = validationError;
      return;
    }

    try {
      await this.api("/api/licks", {
        method: "POST",
        body: JSON.stringify({ artistName, licks }),
      });
      this.resetAddLickRows();
      this.closeDialog("addLickDialog");
      await this.loadAll();
    } catch (err) {
      this.error = err.message;
    }
  }

  openEditLickDialog(lick) {
    this.editLick = lick;
    const nameInput = this.el("editLickName");
    const urlInput = this.el("editLickUrl");
    const goalInput = this.el("editGoalRpm");
    if (nameInput) {
      nameInput.value = lick.lick_name || "";
    }
    if (urlInput) {
      urlInput.value = lick.lick_url || "";
    }
    if (goalInput) {
      goalInput.value = String(lick.goal_rpm || "");
    }
    this.openDialog("editLickDialog", { desktopFocusId: "editGoalRpm" });
  }

  _editGoalMin() {
    return this.editLick?.best_rpm === null ? 1 : (this.editLick?.best_rpm || 1);
  }

  updateEditGoalValue() {
    this._updateGoalInput("editGoalRpm", this._editGoalMin());
  }

  adjustEditGoalValue(delta) {
    this._adjustGoalInput("editGoalRpm", this._editGoalMin(), delta);
  }

  async submitEditLick() {
    if (!this.editLick) {
      return;
    }
    const lickName = this.el("editLickName").value.trim();
    const url = this.el("editLickUrl").value.trim();
    const goalRpm = Number(this.el("editGoalRpm").value);
    try {
      await this.api(`/api/licks/${this.editLick.id}`, {
        method: "PATCH",
        body: JSON.stringify({ lickName, goalRpm, url }),
      });
      this.closeDialog("editLickDialog");
      this.editLick = null;
      await this.reloadLicks();
    } catch (err) {
      this.error = err.message;
    }
  }

  openAddLickDialog() {
    if (!this.filterArtistId) {
      this.error = "Select an artist first";
      return;
    }
    this.resetAddLickRows();
    this.openDialog("addLickDialog", { desktopFocusId: "lickName" });
  }

  openAddArtistDialog() {
    this.openDialog("addArtistDialog");
  }

  openEditArtistDialog() {
    if (!this.filterArtistId) {
      this.error = "Select an artist first";
      return;
    }
    const activeArtist = this.artists.find((artist) => String(artist.id) === this.filterArtistId);
    const input = this.el("editArtistName");
    if (input) {
      input.value = activeArtist?.name || "";
    }
    this.openDialog("editArtistDialog");
  }

  async submitAddArtist() {
    const artistName = this.el("newArtistName").value.trim();
    try {
      const created = await this.api("/api/artists", {
        method: "POST",
        body: JSON.stringify({ artistName }),
      });
      if (created?.id !== undefined && created?.id !== null) {
        this.filterArtistId = String(created.id);
      }
      this.syncUrlState();
      this.el("newArtistName").value = "";
      this.closeDialog("addArtistDialog");
      await this.loadAll();
    } catch (err) {
      this.error = err.message;
    }
  }

  async submitEditArtist() {
    if (!this.filterArtistId) {
      this.error = "Select an artist first";
      return;
    }
    const artistName = this.el("editArtistName").value.trim();
    try {
      await this.api(`/api/artists/${this.filterArtistId}`, {
        method: "PATCH",
        body: JSON.stringify({ artistName }),
      });
      this.closeDialog("editArtistDialog");
      await this.loadAll();
    } catch (err) {
      this.error = err.message;
    }
  }

  _stepperKeydown(adjustFn, guard) {
    return (event) => {
      if (guard && guard.call(this)) {
        return;
      }
      if (STEPPER_INCREMENT_KEYS.includes(event.key)) {
        event.preventDefault();
        adjustFn.call(this, 5);
        return;
      }
      if (STEPPER_DECREMENT_KEYS.includes(event.key)) {
        event.preventDefault();
        adjustFn.call(this, -5);
      }
    };
  }

  _onFormSubmit(action) {
    return (event) => {
      event.preventDefault();
      action.call(this);
    };
  }

  _renderPenIcon() {
    return html`
      <svg class="icon-pen" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 20l4.2-1 9.9-9.9-3.2-3.2L5 15.8 4 20z"></path>
        <path d="M13.8 5.9l3.2 3.2"></path>
      </svg>
    `;
  }

  fmt(value) {
    return value === null || value === undefined ? "-" : String(value);
  }

  renderLickName(row) {
    if (row.lick_url) {
      return html`<a class="lick-link" href=${row.lick_url} target="_blank" rel="noopener noreferrer">${row.lick_name}</a>`;
    }
    return html`${row.lick_name}`;
  }

  header(label, key, className = "") {
    const active = this.sortBy === key;
    const marker = this.sortDir === "asc" ? "▲" : "▼";
    return html`<th class=${className}>
      <button class=${active ? "active" : ""} @click=${() => this.onSort(key)}>
        <span>${label}</span>
        <span class="sort-marker ${active ? "sort-marker-active" : ""}" aria-hidden="true">${marker}</span>
      </button>
    </th>`;
  }

  sessionHeader(label, key) {
    const active = this.sessionSortBy === key;
    const marker = active ? (this.sessionSortDir === "asc" ? " ▲" : " ▼") : "";
    return html`<th>
      <button class=${active ? "active" : ""} @click=${() => this.sortSessions(key)}>${label}${marker}</button>
    </th>`;
  }

  render() {
    const addBlocked = !this.activeLick || !this.canAddSession(this.activeLick);
    const addValidationError = addBlocked ? "" : this.addValueValidationError();
    const showAddValidationError =
      addValidationError
      && (this.addSessionSaveAttempted || !addValidationError.startsWith("RPM must be greater than current best"));
    const newCount = this.licks.filter((row) => row.session_count === 0).length;
    const inProgressCount = this.licks.filter((row) => this.isInProgressRow(row)).length;
    const doneCount = this.licks.filter((row) => this.isDoneRow(row)).length;
    const startedPcts = this.licks
      .filter((row) => row.session_count > 0 && row.pct_of_goal !== null)
      .map((row) => row.pct_of_goal);
    const averagePct =
      startedPcts.length > 0
        ? Math.round((startedPcts.reduce((sum, pct) => sum + pct, 0) / startedPcts.length) * 10) / 10
        : null;
    const visibleLicks = this.licks.filter((row) => {
      if (this.progressFilter === "all") {
        return true;
      }
      if (this.progressFilter === "new") {
        return row.session_count === 0;
      }
      if (this.progressFilter === "progress") {
        return this.isInProgressRow(row);
      }
      return this.isDoneRow(row);
    }).filter((row) => {
      if (!this.lickFilter) {
        return true;
      }
      const query = this.lickFilter.toLowerCase();
      return row.lick_name.toLowerCase().includes(query) || row.artist_name.toLowerCase().includes(query);
    });

    return html`
      <div class="container">
        <div class="header">
          <div class="nav-row">
            <div class="page-tabs">
              <a class="btn btn-small btn-primary" href="/">RPMs</a>
              <a class="btn btn-small" href="/trends.html">Trends</a>
              <a class="btn btn-small" href="/stats.html">Stats</a>
              <button type="button" class="btn btn-small" data-metronome-open @click=${openMetronome}>Metronome</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="toolbar">
            <div class="toolbar-row toolbar-main-row">
              <div class="toolbar-group artist-filter-group">
                <label for="artistFilter">Artist</label>
                <select id="artistFilter" @change=${this.onArtistFilter}>
                  <option value="">All</option>
                  ${this.artists.map(
                    (artist) =>
                      html`<option value=${artist.id} ?selected=${String(artist.id) === this.filterArtistId}>
                        ${artist.name}
                      </option>`,
                  )}
                </select>
                <button
                  class="btn btn-small"
                  ?disabled=${!this.filterArtistId}
                  @click=${this.openEditArtistDialog}
                  aria-label="Edit artist"
                  title=${this.filterArtistId ? "Edit artist" : "Select an artist first"}
                >
                  ${this._renderPenIcon()}
                </button>
                <button class="btn btn-small btn-primary" @click=${this.openAddArtistDialog} aria-label="Add artist" title="Add artist">
                  +
                </button>
                ${this.loading ? html`<span class="muted">Loading...</span>` : ""}
              </div>
              <div class="toolbar-group stats-row">
                <button
                  class="status-chip ${this.progressFilter === "new" ? "status-chip-active" : ""}"
                  @click=${() => this.setProgressFilter("new")}
                  title="New"
                  aria-label="Filter new licks"
                >
                  <span class="status-icon status-new" aria-hidden="true"></span>
                  <span class="stat-count">${newCount}</span>
                </button>
                <button
                  class="status-chip ${this.progressFilter === "progress" ? "status-chip-active" : ""}"
                  @click=${() => this.setProgressFilter("progress")}
                  title="In progress"
                  aria-label="Filter in-progress licks"
                >
                  <span class="status-icon status-progress" aria-hidden="true"></span>
                  <span class="stat-count">${inProgressCount}</span>
                </button>
                <button
                  class="status-chip ${this.progressFilter === "done" ? "status-chip-active" : ""}"
                  @click=${() => this.setProgressFilter("done")}
                  title="Done"
                  aria-label="Filter completed licks"
                >
                  <span class="status-icon status-done" aria-hidden="true"></span>
                  <span class="stat-count">${doneCount}</span>
                </button>
                <span class="avg-pill" title="Average %">
                  <span class="status-icon avg-icon" aria-hidden="true"></span>
                  <span class="stat-count">${averagePct === null ? "-" : `${averagePct}%`}</span>
                </span>
                <button
                  class="btn btn-small btn-primary toolbar-add-lick"
                  ?disabled=${!this.filterArtistId}
                  @click=${this.openAddLickDialog}
                  aria-label="Add lick"
                  title=${this.filterArtistId ? "Add lick" : "Select an artist first"}
                >
                  +
                </button>
              </div>
            </div>
            <div class="toolbar-row filter-row">
              <input
                type="text"
                id="lickSearch"
                placeholder="Filter licks..."
                .value=${this.lickFilter}
                @input=${this.onLickFilter}
              />
            </div>
          </div>
          ${this.compact
            ? html`
                <div class="sort-chips">
                  ${this.sortChip("Artist", "artist")}
                  ${this.sortChip("Lick", "lick")}
                  ${this.sortChip("Goal", "goal")}
                  ${this.sortChip("Best", "best")}
                  ${this.sortChip("%", "pct")}
                  ${this.sortChip("#", "sessions")}
                  ${this.sortChip("Last", "last")}
                </div>
              `
            : ""}

          ${this.error ? html`<div class="alert">${this.error}</div>` : ""}

          <div class="table-wrap">
            ${this.compact
              ? html`
                  <table class="table">
                    <tbody>
                      ${visibleLicks.length === 0
                        ? html`<tr><td class="row-empty">No licks yet.</td></tr>`
                        : visibleLicks.map(
                            (row) => html`
                              <tr class="compact-main">
                                <td>
                                  <div class="compact-top">
                                    <div>
                                      <div class="muted">${row.artist_name}</div>
                                      <div><strong>${this.renderLickName(row)}</strong></div>
                                    </div>
                                    <div class="actions">
                                      <button class="btn btn-small" @click=${() => this.openEditLickDialog(row)} aria-label="Edit lick" title="Edit lick">
                                        ${this._renderPenIcon()}
                                      </button>
                                      <button class="btn btn-small" ?disabled=${row.session_count === 0} @click=${() => this.openSessions(row)}>
                                        ...
                                      </button>
                                      <button
                                        class="btn btn-small btn-primary"
                                        ?disabled=${!this.canAddSession(row)}
                                        @click=${() => this.openAddSession(row)}
                                        aria-label="Add session"
                                        title=${this.canAddSession(row) ? "Add session" : "Goal already met"}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                  <div class="compact-meta">
                                    <span>Goal ${row.goal_rpm}</span>
                                    <span class=${row.best_rpm !== null && row.best_rpm >= row.goal_rpm ? "goal-hit" : ""}>
                                      Best ${this.fmt(row.best_rpm)}
                                    </span>
                                    <span class=${row.pct_of_goal !== null && row.pct_of_goal >= 100 ? "goal-hit" : ""}>
                                      ${row.pct_of_goal === null ? "-" : `${row.pct_of_goal}%`}
                                    </span>
                                  </div>
                                  <div class="compact-dates">
                                    <span class="session-count"># ${row.session_count}</span>
                                    <span class="date-pill">
                                      <span class="date-label">First</span>
                                      <span class="date-value">${this.fmt(row.first_date)}</span>
                                    </span>
                                    <span class="date-pill">
                                      <span class="date-label">Last</span>
                                      <span class="date-value">${this.fmt(row.last_date)}</span>
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            `,
                          )}
                    </tbody>
                  </table>
                `
              : html`
                  <table class="table">
                    <thead>
                      <tr>
                        ${this.header("Artist", "artist")}
                        ${this.header("Lick", "lick")}
                        ${this.header("Goal", "goal", "col-rpm")}
                        ${this.header("Best", "best", "col-rpm")}
                        ${this.header("%", "pct", "col-rpm")}
                        ${this.header("#", "sessions", "col-rpm")}
                        ${this.header("First", "first")}
                        ${this.header("Last", "last")}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${visibleLicks.length === 0
                        ? html`<tr><td class="row-empty" colspan="9">No licks yet.</td></tr>`
                        : visibleLicks.map(
                            (row) => html`
                              <tr>
                                <td>${row.artist_name}</td>
                                <td class="lick-cell">${this.renderLickName(row)}</td>
                                <td class="col-rpm">${row.goal_rpm}</td>
                                <td class="col-rpm">
                                  <span class=${row.best_rpm !== null && row.best_rpm >= row.goal_rpm ? "goal-hit-text" : ""}>
                                    ${this.fmt(row.best_rpm)}
                                  </span>
                                </td>
                                <td class="col-rpm col-pct">
                                  <span class=${row.pct_of_goal !== null && row.pct_of_goal >= 100 ? "goal-hit-text" : ""}>
                                    ${row.pct_of_goal === null ? "-" : `${row.pct_of_goal}%`}
                                  </span>
                                </td>
                                <td class="col-rpm">${row.session_count}</td>
                                <td>${this.fmt(row.first_date)}</td>
                                <td>${this.fmt(row.last_date)}</td>
                                <td>
                                  <div class="actions">
                                    <button class="btn btn-small" @click=${() => this.openEditLickDialog(row)} aria-label="Edit lick" title="Edit lick">
                                      ${this._renderPenIcon()}
                                    </button>
                                    <button class="btn btn-small" ?disabled=${row.session_count === 0} @click=${() => this.openSessions(row)}>
                                      ...
                                    </button>
                                    <button
                                      class="btn btn-small btn-primary"
                                      ?disabled=${!this.canAddSession(row)}
                                      @click=${() => this.openAddSession(row)}
                                      aria-label="Add session"
                                      title=${this.canAddSession(row) ? "Add session" : "Goal already met"}
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            `,
                          )}
                    </tbody>
                  </table>
                `}
          </div>
        </div>
      </div>

      <dialog id="sessionsDialog" class="modal">
        <h3>Sessions</h3>
        <table class="table">
          <thead>
            <tr>
              ${this.sessionHeader("Date", "date")}
              ${this.sessionHeader("RPM", "rpm")}
            </tr>
          </thead>
          <tbody>
            ${this.sessions.length === 0
              ? html`<tr><td colspan="2" class="row-empty">No sessions.</td></tr>`
              : this.sessions.map((s) => html`<tr><td>${s.date}</td><td>${s.rpm}</td></tr>`)}
          </tbody>
        </table>
        <div class="dialog-actions">
          <button class="btn" @click=${() => this.closeDialog("sessionsDialog")}>Close</button>
        </div>
      </dialog>

      <dialog
        id="addSessionDialog"
        class="modal add-session-modal"
        @close=${this.stopAddSessionMetronome}
        @keydown=${this.onAddSessionDialogKeydown}
      >
        <form @submit=${this._onFormSubmit(this.submitAddSession)}>
          <h3>Add Session</h3>
          <div class="range-grid">
            <div class="muted">
              Lick:
              ${this.activeLick?.lick_name || "-"}
            </div>
            <div class="muted">
              Best: ${this.activeLick?.best_rpm === null ? "None" : (this.activeLick?.best_rpm ?? "-")}
              &nbsp; Goal: ${this.activeLick?.goal_rpm ?? "-"}
            </div>
            ${showAddValidationError ? html`<div class="alert">${addValidationError}</div>` : ""}
            <rpm-metronome
              id="addSessionMetronome"
              class="add-session-metronome"
              inline
              bpm=${this.addValue}
              @bpm-change=${this.onAddSessionTempoChange}
            ></rpm-metronome>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn" @click=${() => this.closeDialog("addSessionDialog")}>Cancel</button>
            <button type="submit" class="btn btn-primary" ?disabled=${addBlocked || Boolean(addValidationError)}>Save</button>
          </div>
        </form>
      </dialog>

      <dialog id="addLickDialog" class="modal add-lick-modal">
        <form @submit=${this._onFormSubmit(this.submitAddLick)}>
          <h3>Add Licks</h3>
          <div class="range-grid">
            <div class="muted">
              Artist:
              ${this.artists.find((artist) => String(artist.id) === this.filterArtistId)?.name || "-"}
            </div>
            <div class="add-lick-rows">
              <div class="add-lick-row-labels">
                <span>Lick</span>
                <span>Goal RPM</span>
                <button type="button" class="btn btn-primary row-action-btn" aria-label="Add another lick row" @click=${() => this.addLickRow(this.addLickRows.length - 1)}>+</button>
              </div>
              ${this.addLickRows.map((row, index) => {
                const rowGoal = Number(row.goalRpm || 0);
                const lickId = index === 0 ? "lickName" : `lickName-${index}`;
                const goalId = index === 0 ? "goalRpm" : `goalRpm-${index}`;
                return html`
                  <div class="add-lick-row">
                    <input
                      id=${lickId}
                      aria-label=${`Lick ${index + 1}`}
                      .value=${row.lickName}
                      @input=${(event) => this.updateAddLickName(index, event)}
                      @keydown=${this._addLickRowKeydown(index)}
                    />
                    <div class="rpm-stepper add-lick-goal-stepper">
                      ${this.renderStepperButton("-", rowGoal <= 1, (delta) => this.adjustAddLickGoal(index, delta), -5)}
                      <input
                        id=${goalId}
                        class="rpm-number-input"
                        type="number"
                        min="1"
                        step="1"
                        aria-label=${`Goal RPM ${index + 1}`}
                        .value=${row.goalRpm}
                        @input=${(event) => this.updateAddLickGoal(index, event)}
                        @keydown=${this._addLickRowKeydown(index, (delta) => this.adjustAddLickGoal(index, delta))}
                      />
                      ${this.renderStepperButton("+", false, (delta) => this.adjustAddLickGoal(index, delta), 5)}
                    </div>
                    <button
                      type="button"
                      class="btn row-action-btn"
                      aria-label=${index === 0 ? "Cannot delete the first lick row" : "Delete lick row"}
                      ?disabled=${index === 0}
                      @click=${() => this.deleteAddLickRow(index)}
                    >
                      -
                    </button>
                  </div>
                `;
              })}
            </div>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn" @click=${() => this.closeDialog("addLickDialog")}>Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </dialog>

      <dialog id="addArtistDialog" class="modal">
        <form @submit=${this._onFormSubmit(this.submitAddArtist)}>
          <h3>Add Artist</h3>
          <div class="range-grid">
            <label for="newArtistName">Artist</label>
            <input id="newArtistName" />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn" @click=${() => this.closeDialog("addArtistDialog")}>Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </dialog>

      <dialog id="editArtistDialog" class="modal">
        <form @submit=${this._onFormSubmit(this.submitEditArtist)}>
          <h3>Edit Artist</h3>
          <div class="range-grid">
            <label for="editArtistName">Artist</label>
            <input id="editArtistName" />
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn" @click=${() => this.closeDialog("editArtistDialog")}>Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </dialog>

      <dialog id="editLickDialog" class="modal">
        <form @submit=${this._onFormSubmit(this.submitEditLick)}>
          <h3>Edit Lick</h3>
          <div class="range-grid">
            <div class="muted">
              Artist:
              ${this.editLick?.artist_name || "-"}
            </div>
            <label for="editLickName">Lick</label>
            <input id="editLickName" />
            <label for="editLickUrl">URL (optional)</label>
            <input id="editLickUrl" type="url" placeholder="https://..." />
            <label for="editGoalRpm">Goal RPM</label>
            <div class="rpm-stepper">
              ${this.renderStepperButton("-", false, this.adjustEditGoalValue, -5)}
              <input
                id="editGoalRpm"
                class="rpm-number-input"
                type="number"
                min=${this.editLick?.best_rpm === null ? 1 : (this.editLick?.best_rpm || 1)}
                step="1"
                @input=${this.updateEditGoalValue}
                @keydown=${this._stepperKeydown(this.adjustEditGoalValue)}
              />
              ${this.renderStepperButton("+", false, this.adjustEditGoalValue, 5)}
            </div>
          </div>
          <div class="dialog-actions">
            <button type="button" class="btn" @click=${() => this.closeDialog("editLickDialog")}>Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </dialog>
    `;
  }
}

customElements.define("rpm-app", RpmApp);
