import { openMetronome } from "/metronome.js";

const icons = {
  today: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="m8 12 2.5 2.5L16 9"></path></svg>`,
  licks: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c4.8 0 8 4.1 8 8.4 0 4.8-3.7 8.6-8 9.6-4.3-1-8-4.8-8-9.6C4 7.1 7.2 3 12 3Z"></path></svg>`,
  trends: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M3 10h18"></path></svg>`,
  stats: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"></path></svg>`,
  metronome: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10l3 17H4L7 4Z"></path><path d="m12 17 3-9M9 17h6"></path></svg>`,
};

class PageNav extends HTMLElement {
  connectedCallback() {
    const active = this.getAttribute("active");
    const link = (key, href, label) => `
      <a class="btn btn-small nav-icon-button ${active === key ? "btn-primary" : ""}"
        href="${href}" aria-label="${label}" title="${label}">${icons[key]}</a>`;
    this.innerHTML = `
      <div class="header">
        <div class="nav-row">
          <div class="brand-title">Beats</div>
          <nav class="page-tabs" aria-label="Pages">
            ${link("today", "/", "Today")}
            ${link("licks", "/licks.html", "Licks")}
            ${link("trends", "/trends.html", "Trends")}
            ${link("stats", "/stats.html", "Stats")}
          </nav>
          <button type="button" class="btn btn-small nav-icon-button metronome-nav"
            aria-label="Metronome" title="Metronome">${icons.metronome}</button>
        </div>
      </div>`;
    this.querySelector(".metronome-nav")?.addEventListener("click", openMetronome);
  }
}

customElements.define("page-nav", PageNav);
