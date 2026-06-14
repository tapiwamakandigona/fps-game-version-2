// Procedural sound via WebAudio — no audio files. Created lazily on first use
// (must be after a user gesture, which the Start button provides).
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.enabled = true; this._vol = 0.5; }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._vol;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v) { this._vol = v; if (this.master) this.master.gain.value = v; this.enabled = v > 0.001; }

  resume() { this._ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _env(node, t0, dur, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g); g.connect(this.master);
    return g;
  }

  _noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf; return src;
  }

  // Per-weapon gunshot. Each type gets its own oscillator sweep + noise crack so
  // the four guns read distinctly by ear (a core COD feel).
  shoot(type = 'pistol') {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const P = {
      pistol:  { f0: 520, f1: 90,  oscDur: 0.12, oscPk: 0.5,  hp: 1400, nzDur: 0.10, nzPk: 0.35, wave: 'square' },
      shotgun: { f0: 280, f1: 50,  oscDur: 0.20, oscPk: 0.75, hp: 800,  nzDur: 0.16, nzPk: 0.5,  wave: 'square', tail: true },
      smg:     { f0: 600, f1: 120, oscDur: 0.08, oscPk: 0.4,  hp: 1800, nzDur: 0.06, nzPk: 0.3,  wave: 'square' },
      rifle:   { f0: 380, f1: 60,  oscDur: 0.15, oscPk: 0.6,  hp: 1000, nzDur: 0.12, nzPk: 0.4,  wave: 'sawtooth' },
    }[type] || null;
    const c = P || { f0: 420, f1: 70, oscDur: 0.14, oscPk: 0.5, hp: 1200, nzDur: 0.12, nzPk: 0.35, wave: 'square' };
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = c.wave;
    osc.frequency.setValueAtTime(c.f0, t); osc.frequency.exponentialRampToValueAtTime(c.f1, t + c.oscDur);
    this._env(osc, t, c.oscDur + 0.02, c.oscPk); osc.start(t); osc.stop(t + c.oscDur + 0.04);
    const nz = this._noise(c.nzDur); const bp = this.ctx.createBiquadFilter();
    bp.type = 'highpass'; bp.frequency.value = c.hp; nz.connect(bp);
    this._env(bp, t, c.nzDur, c.nzPk); nz.start(t); nz.stop(t + c.nzDur + 0.02);
    // Shotgun gets a low-passed bassy body tail for weight.
    if (c.tail) {
      const tn = this._noise(0.16); const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 600; tn.connect(lp);
      this._env(lp, t, 0.15, 0.4); tn.start(t); tn.stop(t + 0.16);
    }
  }

  explosion() {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // deep boom
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t); osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    this._env(osc, t, 0.55, 0.8); osc.start(t); osc.stop(t + 0.6);
    // body of noise
    const nz = this._noise(0.5); const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.45);
    nz.connect(lp); this._env(lp, t, 0.45, 0.7); nz.start(t); nz.stop(t + 0.5);
  }

  empty() {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 900;
    this._env(o, t, 0.04, 0.12); o.start(t); o.stop(t + 0.05);
  }

  reload() {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 0.16].forEach((off, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = i ? 320 : 180;
      this._env(o, t + off, 0.08, 0.2); o.start(t + off); o.stop(t + off + 0.1);
    });
  }

  hit(headshot = false) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(headshot ? 1100 : 600, t);
    o.frequency.exponentialRampToValueAtTime(headshot ? 1600 : 800, t + 0.05);
    this._env(o, t, 0.07, headshot ? 0.4 : 0.25); o.start(t); o.stop(t + 0.09);
  }

  // Crisp two-tone elimination confirm — a satisfying "ding" on a kill.
  killConfirm(headshot = false) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = headshot ? 1000 : 760;
    [[0, base], [0.05, base * 1.5]].forEach(([off, f]) => {
      const o = this.ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(f, t + off);
      o.frequency.exponentialRampToValueAtTime(f * 1.18, t + off + 0.04);
      this._env(o, t + off, 0.06, 0.16); o.start(t + off); o.stop(t + off + 0.08);
    });
  }

  hurt() {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const nz = this._noise(0.2); const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 500; nz.connect(lp);
    this._env(lp, t, 0.18, 0.5); nz.start(t); nz.stop(t + 0.2);
  }

  pickup() { this._tones([660, 880], 0.07); }
  wave() { this._tones([330, 440, 550], 0.12); }
  victory() { this._tones([523, 659, 784, 1047], 0.16); }
  gameover() { this._tones([440, 330, 247, 175], 0.2); }

  _tones(freqs, step) {
    if (!this.enabled) return; this._ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      this._env(o, t + i * step, step * 1.4, 0.3); o.start(t + i * step); o.stop(t + i * step + step * 1.5);
    });
  }
}
