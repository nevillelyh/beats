import { LitElement, html } from "https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js";

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
    sessions: { state: true },
    sessionSortBy: { state: true },
    sessionSortDir: { state: true },
    addValue: { state: true },
    addMin: { state: true },
    addMax: { state: true },
    compact: { state: true },
    progressFilter: { state: true },
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
    this.sortDir = this.defaultMainSortDir("artist");
    this.loading = false;
    this.error = "";
    this.activeLick = null;
    this.sessions = [];
    this.sessionSortBy = "date";
    this.sessionSortDir = "desc";
    this.addValue = 0;
    this.addMin = 0;
    this.addMax = 0;
    this.progressFilter = "all";
    this.compact = typeof window !== "undefined" ? window.innerWidth <= 720 : false;
    this._onResize = () => {
      const next = window.innerWidth <= 720;
      if (next !== this.compact) {
        this.compact = next;
      }
    };
    this._onPopState = async () => {
      this.applyUrlState(new URLSearchParams(window.location.search));
      await this.reloadLicks();
    };
  }

  defaultMainSortDir(sortBy) {
    return "asc";
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("resize", this._onResize);
    window.addEventListener("popstate", this._onPopState);
    this.applyUrlState(new URLSearchParams(window.location.search));
    this.loadAll();
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("popstate", this._onPopState);
    super.disconnectedCallback();
  }

  applyUrlState(params) {
    const validSort = new Set(["artist", "lick", "goal", "best", "pct", "sessions", "first", "last"]);
    const validDir = new Set(["asc", "desc"]);
    const validProgress = new Set(["all", "todo", "done"]);

    const sortBy = params.get("sort");
    const sortDir = params.get("dir");
    const artist = params.get("artist");
    const progress = params.get("progress");

    if (sortBy && validSort.has(sortBy)) {
      this.sortBy = sortBy;
    }
    if (sortDir && validDir.has(sortDir)) {
      this.sortDir = sortDir;
    }
    if (artist !== null) {
      this.filterArtistId = artist;
    }
    if (progress && validProgress.has(progress)) {
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
    if (this.sortDir !== this.defaultMainSortDir(this.sortBy)) {
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
    return new Date().toLocaleDateString("en-CA");
  }

  el(id) {
    return this.renderRoot?.querySelector(`#${id}`);
  }

  openDialog(id) {
    const dialog = this.el(id);
    if (!dialog) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      return;
    }
    dialog.setAttribute("open", "open");
  }

  closeDialog(id) {
    const dialog = this.el(id);
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function") {
      dialog.close();
      return;
    }
    dialog.removeAttribute("open");
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
      this.sortDir = this.defaultMainSortDir(col);
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

  cycleProgressFilter() {
    if (this.progressFilter === "all") {
      this.progressFilter = "todo";
      this.syncUrlState();
      return;
    }
    if (this.progressFilter === "todo") {
      this.progressFilter = "done";
      this.syncUrlState();
      return;
    }
    this.progressFilter = "all";
    this.syncUrlState();
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
    this.activeLick = lick;
    const best = lick.best_rpm || 0;
    const min = lick.best_rpm === null ? 1 : lick.best_rpm + 1;
    const max = lick.goal_rpm;
    const suggested =
      lick.best_rpm === null
        ? Math.ceil((lick.goal_rpm / 2) / 10) * 10
        : Math.floor(best / 5) * 5 + 5;
    this.addMin = min;
    this.addMax = max;
    this.addValue = Math.max(min, Math.min(max, suggested));
    this.openDialog("addSessionDialog");
  }

  updateAddValue(event) {
    const raw = Number(event.target.value);
    if (!Number.isFinite(raw)) {
      this.addValue = this.addMin;
      return;
    }
    this.addValue = Math.trunc(raw);
  }

  adjustAddValue(delta) {
    const next = this.addValue + delta;
    this.addValue = Math.max(this.addMin, Math.min(this.addMax, next));
  }

  addValueValidationError() {
    if (!Number.isInteger(this.addValue)) {
      return "RPM must be an integer";
    }
    if (this.addValue < this.addMin || this.addValue > this.addMax) {
      return `RPM must be between ${this.addMin} and ${this.addMax}`;
    }
    return "";
  }

  updateGoalValue(event) {
    const raw = Number(event.target.value || 0);
    const clamped = Math.max(1, raw);
    event.target.value = String(clamped);
  }

  adjustGoalValue(delta) {
    const input = this.el("goalRpm");
    if (!input) {
      return;
    }
    const current = Number(input.value || 0);
    const base = Number.isFinite(current) && current > 0 ? current : 0;
    const next = Math.max(1, base + delta);
    input.value = String(next);
  }

  async submitAddSession() {
    if (!this.activeLick) {
      return;
    }
    const addError = this.addValueValidationError();
    if (addError) {
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
    const lickName = this.el("lickName").value.trim();
    const url = this.el("lickUrl").value.trim();
    const goalRpm = Number(this.el("goalRpm").value);
    if (!artistName) {
      this.error = "Select an artist before adding a lick";
      return;
    }

    try {
      await this.api("/api/licks", {
        method: "POST",
        body: JSON.stringify({ artistName, lickName, goalRpm, url }),
      });
      this.el("lickName").value = "";
      this.el("lickUrl").value = "";
      this.el("goalRpm").value = "";
      this.closeDialog("addLickDialog");
      await this.loadAll();
    } catch (err) {
      this.error = err.message;
    }
  }

  openAddLickDialog() {
    if (!this.filterArtistId) {
      this.error = "Select an artist first";
      return;
    }
    const goalInput = this.el("goalRpm");
    if (goalInput && !goalInput.value) {
      goalInput.value = "100";
    }
    this.openDialog("addLickDialog");
  }

  openAddArtistDialog() {
    this.openDialog("addArtistDialog");
  }

  async submitAddArtist() {
    const artistName = this.el("newArtistName").value.trim();
    try {
      await this.api("/api/artists", {
        method: "POST",
        body: JSON.stringify({ artistName }),
      });
      this.el("newArtistName").value = "";
      this.closeDialog("addArtistDialog");
      await this.loadAll();
    } catch (err) {
      this.error = err.message;
    }
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

  header(label, key) {
    const active = this.sortBy === key;
    const marker = active ? (this.sortDir === "asc" ? " ▲" : " ▼") : "";
    return html`<th>
      <button class=${active ? "active" : ""} @click=${() => this.onSort(key)}>${label}${marker}</button>
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
    const addDisabledByRange = this.addMin > this.addMax;
    const addValidationError = addDisabledByRange ? "" : this.addValueValidationError();
    const visibleLicks = this.licks.filter((row) => {
      if (this.progressFilter === "all") {
        return true;
      }
      if (this.progressFilter === "todo") {
        return row.pct_of_goal === null || row.pct_of_goal < 100;
      }
      return row.pct_of_goal === 100;
    });
    const progressLabel = this.progressFilter === "all" ? "All" : this.progressFilter === "todo" ? "TODO" : "Done";

    return html`
      <div class="container">
        <div class="header">
          <div class="title-row">
            <h1 class="title">RPM Tracker</h1>
            <a class="btn btn-small" href="/heatmap.html">Heatmap</a>
          </div>
          ${this.filterArtistId
            ? html`<button class="btn btn-primary" @click=${this.openAddLickDialog}>+ Add Lick</button>`
            : html`<button class="btn btn-primary" @click=${this.openAddArtistDialog}>+ Add Artist</button>`}
        </div>

        <div class="card">
          <div class="toolbar">
            <div class="toolbar-row">
              <label for="artistFilter">Artist</label>
              <select id="artistFilter" @change=${this.onArtistFilter}>
                <option value="">All artists</option>
                ${this.artists.map(
                  (artist) =>
                    html`<option value=${artist.id} ?selected=${String(artist.id) === this.filterArtistId}>
                      ${artist.name}
                    </option>`,
                )}
              </select>
              <button class="btn btn-small chip-active" @click=${this.cycleProgressFilter}>
                ${progressLabel}
              </button>
              ${this.loading ? html`<span class="muted">Loading...</span>` : ""}
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
                                      <button class="btn btn-small" ?disabled=${row.session_count === 0} @click=${() => this.openSessions(row)}>
                                        ...
                                      </button>
                                      <button class="btn btn-small btn-primary" ?disabled=${!row.can_add_today} @click=${() => this.openAddSession(row)}>
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
                        ${this.header("Goal", "goal")}
                        ${this.header("Best", "best")}
                        ${this.header("%", "pct")}
                        ${this.header("#", "sessions")}
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
                                <td>${row.goal_rpm}</td>
                                <td>
                                  <span class=${row.best_rpm !== null && row.best_rpm >= row.goal_rpm ? "goal-hit-text" : ""}>
                                    ${this.fmt(row.best_rpm)}
                                  </span>
                                </td>
                                <td>
                                  <span class=${row.pct_of_goal !== null && row.pct_of_goal >= 100 ? "goal-hit-text" : ""}>
                                    ${row.pct_of_goal === null ? "-" : `${row.pct_of_goal}%`}
                                  </span>
                                </td>
                                <td>${row.session_count}</td>
                                <td>${this.fmt(row.first_date)}</td>
                                <td>${this.fmt(row.last_date)}</td>
                                <td>
                                  <div class="actions">
                                    <button class="btn btn-small" ?disabled=${row.session_count === 0} @click=${() => this.openSessions(row)}>
                                      ...
                                    </button>
                                    <button class="btn btn-small btn-primary" ?disabled=${!row.can_add_today} @click=${() => this.openAddSession(row)}>
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

      <dialog id="sessionsDialog" class="modal" @cancel=${(e) => e.preventDefault()}>
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

      <dialog id="addSessionDialog" class="modal" @cancel=${(e) => e.preventDefault()}>
        <h3>Add Session</h3>
        <div class="range-grid">
          <div class="muted">Allowed range: ${this.addMin} - ${this.addMax}</div>
          ${addValidationError ? html`<div class="alert">${addValidationError}</div>` : ""}
          <div class="rpm-stepper">
            <button class="btn btn-step" ?disabled=${addDisabledByRange || this.addValue <= this.addMin} @click=${() => this.adjustAddValue(-5)}>
              -
            </button>
            <input
              id="addRpmInput"
              class="rpm-number-input"
              min=${this.addMin}
              max=${this.addMax}
              step="1"
              type="number"
              .value=${String(this.addValue)}
              ?disabled=${addDisabledByRange}
              @input=${this.updateAddValue}
            />
            <button class="btn btn-step" ?disabled=${addDisabledByRange || this.addValue >= this.addMax} @click=${() => this.adjustAddValue(5)}>
              +
            </button>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn" @click=${() => this.closeDialog("addSessionDialog")}>Cancel</button>
          <button class="btn btn-primary" ?disabled=${addDisabledByRange || Boolean(addValidationError)} @click=${this.submitAddSession}>Save</button>
        </div>
      </dialog>

      <dialog id="addLickDialog" class="modal" @cancel=${(e) => e.preventDefault()}>
        <h3>Add Lick</h3>
        <div class="range-grid">
          <div class="muted">
            Artist:
            ${this.artists.find((artist) => String(artist.id) === this.filterArtistId)?.name || "-"}
          </div>
          <label for="lickName">Lick</label>
          <input id="lickName" />
          <label for="lickUrl">URL (optional)</label>
          <input id="lickUrl" type="url" placeholder="https://..." />
          <label for="goalRpm">Goal RPM</label>
          <div class="rpm-stepper">
            <button class="btn btn-step" @click=${() => this.adjustGoalValue(-5)}>-</button>
            <input
              id="goalRpm"
              class="rpm-number-input"
              type="number"
              min="1"
              step="5"
              @input=${this.updateGoalValue}
            />
            <button class="btn btn-step" @click=${() => this.adjustGoalValue(5)}>+</button>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn" @click=${() => this.closeDialog("addLickDialog")}>Cancel</button>
          <button class="btn btn-primary" @click=${this.submitAddLick}>Save</button>
        </div>
      </dialog>

      <dialog id="addArtistDialog" class="modal" @cancel=${(e) => e.preventDefault()}>
        <h3>Add Artist</h3>
        <div class="range-grid">
          <label for="newArtistName">Artist</label>
          <input id="newArtistName" />
        </div>
        <div class="dialog-actions">
          <button class="btn" @click=${() => this.closeDialog("addArtistDialog")}>Cancel</button>
          <button class="btn btn-primary" @click=${this.submitAddArtist}>Save</button>
        </div>
      </dialog>
    `;
  }
}

customElements.define("rpm-app", RpmApp);
