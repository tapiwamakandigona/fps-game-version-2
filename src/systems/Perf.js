// Performance instrumentation + adaptive quality.
// - PerfMeter: a toggleable on-screen overlay (FPS, frame ms avg/max, draw calls,
//   triangles, geometries, textures). Toggle with the backtick (`) key or F3.
// - AdaptiveQuality: watches an EMA of frame time and auto-scales pixel ratio (and,
//   in the lower steps, bloom/shadows) to hold ~60fps with hysteresis. The current
//   quality preset (low/med/high) sets the CEILING of the ladder so the user's choice
//   is respected — adaptive only ever scales DOWN from there, then back up to it.

export class PerfMeter {
  constructor(renderer) {
    this.renderer = renderer;
    this.visible = false;
    this.el = document.createElement('div');
    this.el.id = 'perf-meter';
    this.el.style.cssText = [
      'position:fixed', 'top:6px', 'left:6px', 'z-index:9999',
      'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace',
      'color:#7CFC9B', 'background:rgba(8,12,18,0.72)', 'padding:5px 9px',
      'border:1px solid rgba(124,252,155,0.25)', 'border-radius:5px',
      'pointer-events:none', 'white-space:pre', 'letter-spacing:0.3px',
      'text-shadow:0 0 4px rgba(0,0,0,0.8)', 'display:none',
    ].join(';');
    document.body.appendChild(this.el);
    this.times = new Float32Array(120);
    this.idx = 0;
    this._acc = 0;
    this._start = 0;
    this._qinfo = '';
  }

  setQualityInfo(s) { this._qinfo = s; }
  toggle() { this.visible = !this.visible; this.el.style.display = this.visible ? 'block' : 'none'; }

  begin() { this._start = performance.now(); }

  end() {
    const ms = performance.now() - this._start;
    this.times[this.idx % 120] = ms;
    this.idx++;
    if (!this.visible) return ms;
    this._acc += ms;
    if (this._acc < 250) return ms; // refresh display ~4x/sec
    this._acc = 0;
    const n = Math.min(this.idx, 120);
    let sum = 0, max = 0;
    for (let i = 0; i < n; i++) { const v = this.times[i]; sum += v; if (v > max) max = v; }
    const avg = sum / n;
    const fps = 1000 / Math.max(0.001, avg);
    const info = this.renderer.info;
    this.el.textContent =
      `FPS ${fps.toFixed(0)}  (${avg.toFixed(1)}ms avg / ${max.toFixed(1)}ms max)\n` +
      `draws ${info.render.calls}  tris ${info.render.triangles}\n` +
      `geo ${info.memory.geometries}  tex ${info.memory.textures}  ${this._qinfo}`;
    return ms;
  }
}

export class AdaptiveQuality {
  constructor(engine) {
    this.engine = engine;
    this.enabled = true;
    this.ema = 16.67;
    this.alpha = 0.08;
    this.cooldown = 0;
    this.SCALE_DOWN_MS = 18.5;  // ~54fps -> drop a step
    this.SCALE_UP_MS = 14.0;    // ~71fps headroom -> raise a step
    this.COOLDOWN_DOWN = 0.5;
    this.COOLDOWN_UP = 3.0;
    // pixel-ratio + feature ladder, low -> high
    this.ladder = [
      { pr: 0.6,  bloom: false, shadows: false },
      { pr: 0.75, bloom: false, shadows: false },
      { pr: 0.85, bloom: false, shadows: true },
      { pr: 1.0,  bloom: false, shadows: true },
      { pr: 1.0,  bloom: true,  shadows: true },
      { pr: 1.25, bloom: true,  shadows: true },
      { pr: 1.5,  bloom: true,  shadows: true },
    ];
    this.maxLevel = this.ladder.length - 1;   // ceiling, set by quality preset
    this.level = this.maxLevel;
  }

  // Map a quality preset to the ceiling level (and starting level).
  setCeiling(quality) {
    this.maxLevel = quality === 'low' ? 3 : quality === 'med' ? 5 : 6;
    if (this.level > this.maxLevel) { this.level = this.maxLevel; this._apply(); }
  }

  setEnabled(v) {
    this.enabled = v;
    if (v) { this.level = this.maxLevel; this._apply(); }
  }

  update(dt, frameMs) {
    this.ema = this.ema * (1 - this.alpha) + frameMs * this.alpha;
    if (!this.enabled) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (this.ema > this.SCALE_DOWN_MS && this.level > 0) {
      this.level--; this._apply(); this.cooldown = this.COOLDOWN_DOWN;
    } else if (this.ema < this.SCALE_UP_MS && this.level < this.maxLevel) {
      this.level++; this._apply(); this.cooldown = this.COOLDOWN_UP;
    }
  }

  get info() {
    const q = this.ladder[this.level];
    return `q${this.level} pr${q.pr}${q.bloom ? '+b' : ''}${q.shadows ? '+s' : ''}`;
  }

  _apply() {
    const q = this.ladder[this.level];
    const e = this.engine;
    e.maxPixelRatio = q.pr;
    e.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pr));
    if (e.bloom) e.bloom.enabled = q.bloom;
    e.renderer.shadowMap.enabled = q.shadows;
    e.renderer.shadowMap.needsUpdate = true;
    const w = window.innerWidth, h = window.innerHeight;
    e.renderer.setSize(w, h);
    e.composer.setSize(w, h);
    if (e.bloom) e.bloom.setSize(w / 2, h / 2);
  }
}
