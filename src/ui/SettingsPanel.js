// Settings overlay UI: brightness, quality preset, look sensitivity, volume.
// Reads/writes the shared Settings object and applies live.
export class SettingsPanel {
  constructor(settings, container, onClose) {
    this.settings = settings;
    this.onClose = onClose;
    this._build(container);
  }

  _build(container) {
    const el = document.createElement('div');
    el.id = 'settings';
    el.className = 'overlay hidden';
    el.innerHTML = `
      <div class="panel settings-panel">
        <h2>SETTINGS</h2>
        <div class="set-row">
          <label>Brightness</label>
          <input type="range" id="set-brightness" min="0.8" max="1.9" step="0.05">
          <span class="set-val" id="set-brightness-v"></span>
        </div>
        <div class="set-row">
          <label>Quality</label>
          <div class="set-seg" id="set-quality">
            <button data-q="low">Low</button>
            <button data-q="med">Med</button>
            <button data-q="high">High</button>
          </div>
        </div>
        <div class="set-row">
          <label>Look sensitivity</label>
          <input type="range" id="set-sens" min="0.3" max="3.0" step="0.05">
          <span class="set-val" id="set-sens-v"></span>
        </div>
        <div class="set-row">
          <label>Field of view</label>
          <input type="range" id="set-fov" min="70" max="110" step="1">
          <span class="set-val" id="set-fov-v"></span>
        </div>
        <div class="set-row touch-setting">
          <label>Aim assist</label>
          <div class="set-seg" id="set-assist">
            <button data-v="on">On</button>
            <button data-v="off">Off</button>
          </div>
        </div>
        <div class="set-row touch-setting">
          <label>Auto-fire</label>
          <div class="set-seg" id="set-autofire">
            <button data-v="on">On</button>
            <button data-v="off">Off</button>
          </div>
        </div>
        <div class="set-row touch-setting">
          <label>Vibration</label>
          <div class="set-seg" id="set-haptics">
            <button data-v="on">On</button>
            <button data-v="off">Off</button>
          </div>
        </div>
        <div class="set-row">
          <label>FPS meter</label>
          <div class="set-seg" id="set-fps">
            <button data-v="on">On</button>
            <button data-v="off">Off</button>
          </div>
        </div>
        <div class="set-row">
          <label>Volume</label>
          <input type="range" id="set-volume" min="0" max="1" step="0.05">
          <span class="set-val" id="set-volume-v"></span>
        </div>
        <button id="set-back">BACK</button>
      </div>`;
    container.appendChild(el);
    this.el = el;
    this._wire();
  }

  _wire() {
    const s = this.settings;
    const bright = this.el.querySelector('#set-brightness');
    const sens = this.el.querySelector('#set-sens');
    const vol = this.el.querySelector('#set-volume');
    const fov = this.el.querySelector('#set-fov');

    bright.addEventListener('input', () => { s.set('brightness', +bright.value); this._refreshLabels(); });
    sens.addEventListener('input', () => { s.set('sensitivity', +sens.value); this._refreshLabels(); });
    vol.addEventListener('input', () => { s.set('volume', +vol.value); this._refreshLabels(); });
    fov.addEventListener('input', () => { s.set('fov', +fov.value); this._refreshLabels(); });

    this.el.querySelectorAll('#set-quality button').forEach((b) => {
      b.addEventListener('click', () => { s.set('quality', b.dataset.q); this._refreshQuality(); });
    });
    // Touch-only combat helpers (rows are hidden on desktop via CSS).
    this.el.querySelectorAll('#set-assist button').forEach((b) => {
      b.addEventListener('click', () => { s.set('aimAssist', b.dataset.v === 'on'); this._refreshToggles(); });
    });
    this.el.querySelectorAll('#set-autofire button').forEach((b) => {
      b.addEventListener('click', () => { s.set('autoFire', b.dataset.v === 'on'); this._refreshToggles(); });
    });
    this.el.querySelectorAll('#set-haptics button').forEach((b) => {
      b.addEventListener('click', () => { s.set('haptics', b.dataset.v === 'on'); this._refreshToggles(); });
    });
    this.el.querySelectorAll('#set-fps button').forEach((b) => {
      b.addEventListener('click', () => { s.set('fpsMeter', b.dataset.v === 'on'); this._refreshToggles(); });
    });
    this.el.querySelector('#set-back').addEventListener('click', () => this.close());
  }

  _refreshLabels() {
    const s = this.settings.values;
    this.el.querySelector('#set-brightness-v').textContent = s.brightness.toFixed(2);
    this.el.querySelector('#set-sens-v').textContent = s.sensitivity.toFixed(2) + '×';
    this.el.querySelector('#set-volume-v').textContent = Math.round(s.volume * 100) + '%';
    this.el.querySelector('#set-fov-v').textContent = Math.round(s.fov) + '\u00b0';
  }

  _refreshToggles() {
    const s = this.settings.values;
    this.el.querySelectorAll('#set-assist button').forEach((b) =>
      b.classList.toggle('active', (b.dataset.v === 'on') === !!s.aimAssist));
    this.el.querySelectorAll('#set-autofire button').forEach((b) =>
      b.classList.toggle('active', (b.dataset.v === 'on') === !!s.autoFire));
    this.el.querySelectorAll('#set-haptics button').forEach((b) =>
      b.classList.toggle('active', (b.dataset.v === 'on') === !!s.haptics));
    this.el.querySelectorAll('#set-fps button').forEach((b) =>
      b.classList.toggle('active', (b.dataset.v === 'on') === !!s.fpsMeter));
  }

  _refreshQuality() {
    const q = this.settings.values.quality;
    this.el.querySelectorAll('#set-quality button').forEach((b) =>
      b.classList.toggle('active', b.dataset.q === q));
  }

  _syncInputs() {
    const s = this.settings.values;
    this.el.querySelector('#set-brightness').value = s.brightness;
    this.el.querySelector('#set-sens').value = s.sensitivity;
    this.el.querySelector('#set-volume').value = s.volume;
    this.el.querySelector('#set-fov').value = s.fov;
    this._refreshLabels();
    this._refreshQuality();
    this._refreshToggles();
  }

  open() { this._syncInputs(); this.el.classList.remove('hidden'); }
  close() { this.el.classList.add('hidden'); if (this.onClose) this.onClose(); }
}
