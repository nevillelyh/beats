import { LitElement, html, css } from "https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js";

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

  static styles = css`
    :host {
      display: block;
    }
  `;

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
    this.shadowRoot.getElementById("sessionsDialog").show();
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
    this.shadowRoot.getElementById("addSessionDialog").show();
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
      this.shadowRoot.getElementById("addSessionDialog").hide();
      await this.reloadLicks();
    } catch (err) {
      this.error = err.message;
    }
  }

  async submitAddLick() {
    const artistInput = this.shadowRoot.getElementById("artistName").value.trim();
    const artistSelected = this.shadowRoot.getElementById("artistSelect").value.trim();
    const artistName = artistInput || artistSelected;
    const lickName = this.shadowRoot.getElementById("lickName").value.trim();
    const goalRpm = Number(this.shadowRoot.getElementById("goalRpm").value);

    try {
      await this.api("/api/licks", {
        method: "POST",
        body: JSON.stringify({ artistName, lickName, goalRpm }),
      });
      this.shadowRoot.getElementById("artistName").value = "";
      this.shadowRoot.getElementById("artistSelect").value = "";
      this.shadowRoot.getElementById("lickName").value = "";
      this.shadowRoot.getElementById("goalRpm").value = "";
      this.shadowRoot.getElementById("addLickDialog").hide();
      await this.loadAll();
    } catch (err) {
      this.error = err.message;
    }
  }

  openAddLickDialog() {
    this.shadowRoot.getElementById("addLickDialog").show();
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
          <sl-button variant="primary" @click=${this.openAddLickDialog}>+ Add Lick</sl-button>
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

          ${this.error ? html`<sl-alert variant="danger" open>${this.error}</sl-alert>` : ""}

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
                              <sl-button size="small" ?disabled=${row.session_count === 0} @click=${() => this.openSessions(row)}>
                                ...
                              </sl-button>
                              <sl-button size="small" variant="primary" ?disabled=${!row.can_add_today} @click=${() => this.openAddSession(row)}>
                                +
                              </sl-button>
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

      <sl-dialog id="sessionsDialog" label="Sessions">
        <div>
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
        </div>
        <sl-button slot="footer" @click=${() => this.shadowRoot.getElementById("sessionsDialog").hide()}>Close</sl-button>
      </sl-dialog>

      <sl-dialog id="addSessionDialog" label="Add Session">
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
        <sl-button slot="footer" @click=${() => this.shadowRoot.getElementById("addSessionDialog").hide()}>Cancel</sl-button>
        <sl-button slot="footer" variant="primary" ?disabled=${addDisabledByRange} @click=${this.submitAddSession}>Save</sl-button>
      </sl-dialog>

      <sl-dialog id="addLickDialog" label="Add Lick">
        <div class="range-grid">
          <label for="artistSelect">Existing Artist</label>
          <select id="artistSelect">
            <option value="">-- Select existing --</option>
            ${this.artists.map((artist) => html`<option value=${artist.name}>${artist.name}</option>`)}
          </select>
          <sl-input id="artistName" label="New Artist (optional)"></sl-input>
          <sl-input id="lickName" label="Lick"></sl-input>
          <sl-input id="goalRpm" label="Goal RPM" type="number" min="1" step="1"></sl-input>
        </div>
        <sl-button slot="footer" @click=${() => this.shadowRoot.getElementById("addLickDialog").hide()}>Cancel</sl-button>
        <sl-button slot="footer" variant="primary" @click=${this.submitAddLick}>Save</sl-button>
      </sl-dialog>
    `;
  }
}

customElements.define("rpm-app", RpmApp);
