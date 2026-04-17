const DEFAULT_BPM = 120;
const MIN_BPM = 20;
const MAX_BPM = 300;
const SIGNATURES = [3, 4];
const SUBDIVISIONS = [
  { value: 1, label: "1/4" },
  { value: 2, label: "1/8" },
  { value: 3, label: "1/8T" },
  { value: 4, label: "1/16" },
];

class RpmMetronome extends HTMLElement {
  constructor() {
    super();
    this.bpm = DEFAULT_BPM;
    this.beatsPerMeasure = 4;
    this.subdivision = 1;
    this.running = false;
    this.beatIndex = 0;
    this.subdivisionIndex = 0;
    this.timer = null;
    this.audioContext = null;
  }

  connectedCallback() {
    this.render();
  }

  disconnectedCallback() {
    this.stop();
  }

  open() {
    const dialog = this.querySelector("dialog");
    if (!dialog) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    requestAnimationFrame(() => {
      dialog.focus();
    });
  }

  close() {
    this.querySelector("dialog")?.close();
  }

  setBpm(value, shouldRender = true) {
    const next = Number(value);
    if (!Number.isFinite(next)) {
      this.bpm = DEFAULT_BPM;
    } else {
      this.bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.trunc(next)));
    }
    if (shouldRender) {
      this.render();
    }
    if (this.running) {
      this.restartTimer();
    }
  }

  adjustBpm(delta) {
    this.setBpm(this.bpm + delta);
  }

  handleKeydown(event) {
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      this.toggle();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      this.adjustBpm(direction * (event.shiftKey ? 5 : 1));
    }
  }

  setSignature(beats) {
    this.beatsPerMeasure = beats;
    this.beatIndex = Math.min(this.beatIndex, beats - 1);
    this.subdivisionIndex = 0;
    this.render();
  }

  setSubdivision(value) {
    this.subdivision = value;
    this.subdivisionIndex = 0;
    this.render();
    if (this.running) {
      this.restartTimer();
    }
  }

  toggle() {
    if (this.running) {
      this.stop();
    } else {
      this.start();
    }
  }

  start() {
    this.ensureAudio();
    if (this.audioContext?.state === "suspended") {
      this.audioContext.resume();
    }
    this.running = true;
    this.beatIndex = 0;
    this.subdivisionIndex = 0;
    this.render();
    this.tick();
    this.restartTimer();
  }

  stop() {
    this.running = false;
    window.clearInterval(this.timer);
    this.timer = null;
    this.beatIndex = 0;
    this.subdivisionIndex = 0;
    this.render();
  }

  restartTimer() {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), this.intervalMs());
  }

  intervalMs() {
    return (60_000 / this.bpm) / this.subdivision;
  }

  ensureAudio() {
    if (!this.audioContext) {
      const Context = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new Context();
    }
  }

  tick() {
    const isDownbeat = this.beatIndex === 0 && this.subdivisionIndex === 0;
    this.playBlip(isDownbeat);
    this.renderBeatDots();

    this.subdivisionIndex += 1;
    if (this.subdivisionIndex >= this.subdivision) {
      this.subdivisionIndex = 0;
      this.beatIndex = (this.beatIndex + 1) % this.beatsPerMeasure;
    }
  }

  playBlip(isDownbeat) {
    if (!this.audioContext) {
      return;
    }
    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(isDownbeat ? 1320 : 880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(isDownbeat ? 0.95 : 0.8, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.08);
  }

  renderBeatDots() {
    for (const dot of this.querySelectorAll(".metronome-dot")) {
      const active = this.running && Number(dot.dataset.beat) === this.beatIndex;
      dot.classList.toggle("metronome-dot-active", active);
    }
  }

  renderToggleGroup(label, options, activeValue) {
    return `
      <div class="metronome-toggle-row">
        <div class="metronome-toggle-label">${label}</div>
        <div class="metronome-toggle-group" role="group" aria-label="${label}">
          ${options.map((option) => `
            <button
              type="button"
              class="btn btn-small ${option.value === activeValue ? "btn-primary" : ""}"
              data-metronome-option="${label}"
              data-value="${option.value}"
              aria-pressed="${option.value === activeValue ? "true" : "false"}"
            >${option.label}</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  render() {
    const wasOpen = this.querySelector("dialog")?.open;
    this.innerHTML = `
      <dialog class="modal metronome-modal" tabindex="-1">
        <div class="metronome-header">
          <h3>Metronome</h3>
          <button type="button" class="btn btn-small metronome-icon-button" data-metronome-close aria-label="Close metronome">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="metronome-controls">
          <div class="metronome-toggle-strip">
            ${this.renderToggleGroup(
              "Time signature",
              SIGNATURES.map((value) => ({ value, label: `${value}/4` })),
              this.beatsPerMeasure,
            )}
            ${this.renderToggleGroup("Rhythm", SUBDIVISIONS, this.subdivision)}
          </div>
          <div class="metronome-number-row" aria-label="Tempo controls">
            <button type="button" class="btn btn-step metronome-step" data-metronome-adjust="-5">--</button>
            <button type="button" class="btn btn-step metronome-step" data-metronome-adjust="-1">-</button>
            <div
              id="metronomeBpm"
              class="metronome-bpm-display"
              role="status"
              aria-label="Beats per minute"
            >${this.bpm}</div>
            <button type="button" class="btn btn-step metronome-step" data-metronome-adjust="1">+</button>
            <button type="button" class="btn btn-step metronome-step" data-metronome-adjust="5">++</button>
          </div>
          <div class="metronome-bottom-row">
            <span aria-hidden="true"></span>
            <div class="metronome-dots" aria-label="Beat indicator">
              ${Array.from({ length: this.beatsPerMeasure }, (_, index) => `
                <span class="metronome-dot ${this.running && index === this.beatIndex ? "metronome-dot-active" : ""}" data-beat="${index}"></span>
              `).join("")}
            </div>
            <button type="button" class="btn btn-primary metronome-start" data-metronome-toggle>
              <span aria-hidden="true">${this.running ? "■" : "▶"}</span>
              <span class="sr-only">${this.running ? "Stop" : "Start"}</span>
            </button>
          </div>
        </div>
      </dialog>
    `;
    this.bindEvents();
    if (wasOpen) {
      this.querySelector("dialog")?.showModal();
      requestAnimationFrame(() => this.querySelector("dialog")?.focus());
    }
  }

  bindEvents() {
    this.querySelector("[data-metronome-close]")?.addEventListener("click", () => this.close());
    this.querySelector("[data-metronome-toggle]")?.addEventListener("click", () => this.toggle());
    this.querySelector("dialog")?.addEventListener("keydown", (event) => this.handleKeydown(event));
    for (const button of this.querySelectorAll("[data-metronome-adjust]")) {
      button.addEventListener("click", () => this.adjustBpm(Number(button.dataset.metronomeAdjust)));
    }
    for (const button of this.querySelectorAll('[data-metronome-option="Time signature"]')) {
      button.addEventListener("click", () => this.setSignature(Number(button.dataset.value)));
    }
    for (const button of this.querySelectorAll('[data-metronome-option="Rhythm"]')) {
      button.addEventListener("click", () => this.setSubdivision(Number(button.dataset.value)));
    }
    this.querySelector("dialog")?.addEventListener("close", () => {
      if (this.running) {
        this.stop();
      }
    });
  }
}

if (!customElements.get("rpm-metronome")) {
  customElements.define("rpm-metronome", RpmMetronome);
}

export function ensureMetronome() {
  let metronome = document.querySelector("rpm-metronome");
  if (!metronome) {
    metronome = document.createElement("rpm-metronome");
    document.body.appendChild(metronome);
  }
  return metronome;
}

export function openMetronome() {
  ensureMetronome().open();
}

export function initMetronomeButtons() {
  ensureMetronome();
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-metronome-open]");
    if (!button) {
      return;
    }
    openMetronome();
  });
}
