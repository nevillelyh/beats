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
    this.sessions = [];
    this.sessionSortBy = "date";
    this.sessionSortDir = "asc";
    this.addValue = 0;
    this.addMin = 0;
    this.addMax = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadAll();
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
      this.sortDir = "asc";
    }
    this.reloadLicks();
  }

  async onArtistFilter(event) {
    this.filterArtistId = event.target.value;
    await this.reloadLicks();
  }

  async openSessions(lick) {
    this.activeLick = lick;
    this.sessionSortBy = "date";
    this.sessionSortDir = "asc";
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
      this.sessionSortDir = "asc";
    }
    await this.loadSessions();
  }

  openAddSession(lick) {
    this.activeLick = lick;
    const best = lick.best_rpm || 0;
    const min = Math.floor(best / 5) * 5 + 5;
    const max = lick.goal_rpm;
    this.addMin = min;
    this.addMax = max;
    this.addValue = min <= max ? min : max;
    this.openDialog("addSessionDialog");
  }

  updateAddValue(event) {
    this.addValue = Number(event.target.value || 0);
  }

  async submitAddSession() {
    if (!this.activeLick) {
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
    const artistInput = this.el("artistName").value.trim();
    const artistSelected = this.el("artistSelect").value.trim();
    const artistName = artistInput || artistSelected;
    const lickName = this.el("lickName").value.trim();
    const goalRpm = Number(this.el("goalRpm").value);

    try {
      await this.api("/api/licks", {
        method: "POST",
        body: JSON.stringify({ artistName, lickName, goalRpm }),
      });
      this.el("artistName").value = "";
      this.el("artistSelect").value = "";
      this.el("lickName").value = "";
      this.el("goalRpm").value = "";
      this.closeDialog("addLickDialog");
      await this.loadAll();
    } catch (err) {
      this.error = err.message;
    }
  }

  openAddLickDialog() {
    this.openDialog("addLickDialog");
  }

  fmt(value) {
    return value === null || value === undefined ? "-" : String(value);
  }

  header(label, key) {
    const active = this.sortBy === key;
    const marker = active ? (this.sortDir === "asc" ? " ▲" : " ▼") : "";
    return html`<th>
      <button class=${active ? "active" : ""} @click=${() => this.onSort(key)}>${label}${marker}</button>
    </th>`;
  }

  render() {
    const hideArtistCol = Boolean(this.filterArtistId);
    const addDisabledByRange = this.addMin > this.addMax;
    const emptyColspan = hideArtistCol ? 7 : 8;

    return html`
      <div class="container">
        <div class="header">
          <h1 class="title">RPM Tracker</h1>
          <button class="btn btn-primary" @click=${this.openAddLickDialog}>+ Add Lick</button>
        </div>

        <div class="card">
          <div class="toolbar">
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
            ${this.loading ? html`<span class="muted">Loading...</span>` : ""}
          </div>

          ${this.error ? html`<div class="alert">${this.error}</div>` : ""}

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  ${hideArtistCol ? "" : this.header("Artist", "artist")}
                  ${this.header("Lick", "lick")}
                  ${this.header("Goal", "goal")}
                  ${this.header("Best", "best")}
                  ${this.header("%", "pct")}
                  ${this.header("First", "first")}
                  ${this.header("Last", "last")}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.licks.length === 0
                  ? html`<tr><td class="row-empty" colspan=${emptyColspan}>No licks yet.</td></tr>`
                  : this.licks.map(
                      (row) => html`
                        <tr>
                          ${hideArtistCol ? "" : html`<td>${row.artist_name}</td>`}
                          <td>${row.lick_name}</td>
                          <td>${row.goal_rpm}</td>
                          <td>${this.fmt(row.best_rpm)}</td>
                          <td>${row.pct_of_goal === null ? "-" : `${row.pct_of_goal}%`}</td>
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
          </div>
        </div>
      </div>

      <dialog id="sessionsDialog" class="modal" @cancel=${(e) => e.preventDefault()}>
        <h3>Sessions</h3>
        <table class="table">
          <thead>
            <tr>
              <th><button @click=${() => this.sortSessions("date")}>Date</button></th>
              <th><button @click=${() => this.sortSessions("rpm")}>RPM</button></th>
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
          <input
            type="range"
            min=${this.addMin}
            max=${this.addMax}
            step="5"
            .value=${String(this.addValue)}
            ?disabled=${addDisabledByRange}
            @input=${this.updateAddValue}
          />
          <input
            type="number"
            min=${this.addMin}
            max=${this.addMax}
            step="5"
            .value=${String(this.addValue)}
            ?disabled=${addDisabledByRange}
            @input=${this.updateAddValue}
          />
        </div>
        <div class="dialog-actions">
          <button class="btn" @click=${() => this.closeDialog("addSessionDialog")}>Cancel</button>
          <button class="btn btn-primary" ?disabled=${addDisabledByRange} @click=${this.submitAddSession}>Save</button>
        </div>
      </dialog>

      <dialog id="addLickDialog" class="modal" @cancel=${(e) => e.preventDefault()}>
        <h3>Add Lick</h3>
        <div class="range-grid">
          <label for="artistSelect">Existing Artist</label>
          <select id="artistSelect">
            <option value="">-- Select existing --</option>
            ${this.artists.map((artist) => html`<option value=${artist.name}>${artist.name}</option>`)}
          </select>
          <label for="artistName">New Artist (optional)</label>
          <input id="artistName" />
          <label for="lickName">Lick</label>
          <input id="lickName" />
          <label for="goalRpm">Goal RPM</label>
          <input id="goalRpm" type="number" min="1" step="1" />
        </div>
        <div class="dialog-actions">
          <button class="btn" @click=${() => this.closeDialog("addLickDialog")}>Cancel</button>
          <button class="btn btn-primary" @click=${this.submitAddLick}>Save</button>
        </div>
      </dialog>
    `;
  }
}

customElements.define("rpm-app", RpmApp);
