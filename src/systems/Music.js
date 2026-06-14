// Procedural adaptive combat soundtrack — zero audio files, 100% Web Audio API.
// Layers blend in/out via setIntensity(0..1):
//   0 = calm/menu  → drone + minor pad only
//   1 = full combat → drone + pad + kick/hat percussion + tension lead
//
// Scheduling uses a classic lookahead clock (25 ms poll, 0.1 s look-ahead window)
// so every note fires at a precise audioCtx.currentTime rather than a drifting
// setTimeout. All gain changes ramp to avoid clicks.

const LOOKAHEAD   = 0.10;   // seconds scheduled ahead of now
const SCHED_INTV  = 25;     // ms between scheduler ticks
const RAMP_FAST   = 0.05;   // s for fast gain ramps (filter, lead)
const RAMP_SLOW   = 1.2;    // s for slow intensity crossfades

// Minor-scale chord frequencies (D minor drone territory)
const PAD_CHORD = [73.42, 87.31, 110.00, 130.81]; // D2, F2, A2, C3

export class Music {
  /**
   * @param {object}        [opts]
   * @param {AudioContext}  [opts.audioCtx=null]  Reuse an existing AudioContext.
   * @param {number}        [opts.volume=0.22]    Initial master volume (0..1).
   */
  constructor({ audioCtx = null, volume = 0.22 } = {}) {
    this._extCtx   = audioCtx;   // injected context (may be null)
    this._ctx      = null;       // resolved context (created lazily if needed)
    this._vol      = Math.max(0, Math.min(1, volume));
    this._enabled  = true;
    this._running  = false;
    this._intensity = 0;         // 0..1 current target

    // Node references (created in _build)
    this._master   = null;

    // Drone oscillators (detuned sawtooth pair)
    this._droneA   = null;
    this._droneB   = null;
    this._droneGain = null;
    this._droneLPF  = null;

    // Pad oscillators (one per chord note, four sine waves)
    this._padOscs  = [];
    this._padGain  = null;

    // Percussion (rebuilt each beat via scheduler)
    this._percGain = null;   // master gate for all percussion

    // Tension lead (sawtooth with fast vibrato)
    this._lead     = null;
    this._leadGain = null;
    this._leadLFO  = null;
    this._leadLFOGain = null;

    // Scheduler state
    this._nextBeatTime = 0;
    this._schedTimer   = null;
    this._beatIndex    = 0;
    this._bpm          = 90;   // base tempo — rises slightly at high intensity
  }

  // ─── public API ────────────────────────────────────────────────────────────

  /** Begin playback. Idempotent. */
  start() {
    try {
      if (!this._enabled) return;
      if (this._running) return;
      this._ensureCtx();
      if (!this._ctx) return;
      // Resume if browser suspended the context (autoplay policy).
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      this._build();
      this._running = true;
      this._nextBeatTime = this._ctx.currentTime + 0.05;
      this._schedTimer = setInterval(() => this._tick(), SCHED_INTV);
    } catch (e) { /* no-op */ }
  }

  /** Stop playback and silence all layers. Idempotent. */
  stop() {
    try {
      if (!this._running) return;
      this._running = false;
      clearInterval(this._schedTimer);
      this._schedTimer = null;
      if (this._master) {
        const t = this._ctx.currentTime;
        this._master.gain.cancelScheduledValues(t);
        this._master.gain.setTargetAtTime(0, t, 0.1);
      }
    } catch (e) { /* no-op */ }
  }

  /**
   * Smoothly blend between calm (0) and full combat (1).
   * Safe to call every frame.
   * @param {number} level 0..1
   */
  setIntensity(level) {
    try {
      if (!this._ctx || !this._running) { this._intensity = level; return; }
      const v = Math.max(0, Math.min(1, level));
      if (Math.abs(v - this._intensity) < 0.001) return;
      this._intensity = v;
      this._applyIntensity();
    } catch (e) { /* no-op */ }
  }

  /**
   * Set master volume (0..1).
   * @param {number} v
   */
  setVolume(v) {
    try {
      this._vol = Math.max(0, Math.min(1, v));
      if (this._master) {
        const t = this._ctx.currentTime;
        this._master.gain.cancelScheduledValues(t);
        this._master.gain.setTargetAtTime(this._vol * 0.35, t, RAMP_FAST);
      }
    } catch (e) { /* no-op */ }
  }

  /**
   * Master enable/disable — delegates to stop()/start().
   * @param {boolean} bool
   */
  setEnabled(bool) {
    try {
      this._enabled = !!bool;
      if (this._enabled) this.start();
      else               this.stop();
    } catch (e) { /* no-op */ }
  }

  /** Tear down all nodes and timers. */
  dispose() {
    try {
      this.stop();
      this._teardown();
      // Only close the context if WE created it (not injected).
      if (this._ctx && !this._extCtx) {
        this._ctx.close().catch(() => {});
      }
      this._ctx = null;
    } catch (e) { /* no-op */ }
  }

  // ─── internal ──────────────────────────────────────────────────────────────

  /** Resolve or lazily create the AudioContext. */
  _ensureCtx() {
    if (this._ctx) return;
    if (this._extCtx) { this._ctx = this._extCtx; return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this._ctx = new AC();
    } catch (e) { /* no Web Audio */ }
  }

  /**
   * Build the persistent node graph (drone + pad + percGain bus + lead).
   * Called once on start(). Safe to call multiple times — tears down first.
   */
  _build() {
    this._teardown();
    const ctx = this._ctx;

    // ── master output ────────────────────────────────────────────────────────
    this._master = ctx.createGain();
    this._master.gain.value = 0;
    this._master.connect(ctx.destination);
    // Ramp up master to avoid initial click.
    const t0 = ctx.currentTime;
    this._master.gain.setTargetAtTime(this._vol * 0.35, t0, 0.4);

    // ── drone (two detuned sawtooths → lowpass) ──────────────────────────────
    this._droneLPF = ctx.createBiquadFilter();
    this._droneLPF.type = 'lowpass';
    this._droneLPF.frequency.value = 280;
    this._droneLPF.Q.value = 2.0;
    this._droneLPF.connect(this._master);

    this._droneGain = ctx.createGain();
    this._droneGain.gain.value = 0.55;
    this._droneGain.connect(this._droneLPF);

    this._droneA = ctx.createOscillator();
    this._droneA.type = 'sawtooth';
    this._droneA.frequency.value = 36.71; // D1
    this._droneA.detune.value = 0;
    this._droneA.connect(this._droneGain);
    this._droneA.start();

    this._droneB = ctx.createOscillator();
    this._droneB.type = 'sine';
    this._droneB.frequency.value = 36.71;
    this._droneB.detune.value = 7; // slightly detuned for movement
    this._droneB.connect(this._droneGain);
    this._droneB.start();

    // Slow LFO on drone LPF cutoff for pulsing breath.
    this._droneLFO = ctx.createOscillator();
    this._droneLFO.type = 'sine';
    this._droneLFO.frequency.value = 0.18; // ~5.5 s per cycle
    this._droneLFOGain = ctx.createGain();
    this._droneLFOGain.gain.value = 90; // modulation depth in Hz
    this._droneLFO.connect(this._droneLFOGain);
    this._droneLFOGain.connect(this._droneLPF.frequency);
    this._droneLFO.start();

    // ── ominous minor pad ────────────────────────────────────────────────────
    this._padGain = ctx.createGain();
    this._padGain.gain.value = 0.18;
    this._padGain.connect(this._master);

    // Soft lowpass to keep pad silky.
    this._padLPF = ctx.createBiquadFilter();
    this._padLPF.type = 'lowpass';
    this._padLPF.frequency.value = 900;
    this._padLPF.Q.value = 0.5;
    this._padLPF.connect(this._padGain);

    this._padOscs = PAD_CHORD.map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = (i % 2 === 0 ? 1 : -1) * (i + 1) * 3; // slight detuning per voice
      osc.connect(this._padLPF);
      osc.start();
      return osc;
    });

    // Very slow pad LFO (tremolo).
    this._padLFO = ctx.createOscillator();
    this._padLFO.type = 'sine';
    this._padLFO.frequency.value = 0.08;
    this._padLFOGain = ctx.createGain();
    this._padLFOGain.gain.value = 0.04;
    this._padLFO.connect(this._padLFOGain);
    this._padLFOGain.connect(this._padGain.gain);
    this._padLFO.start();

    // ── percussion bus (kick + hat fired by scheduler) ───────────────────────
    this._percGain = ctx.createGain();
    this._percGain.gain.value = 0; // muted in calm state
    this._percGain.connect(this._master);

    // ── tension lead ─────────────────────────────────────────────────────────
    this._lead = ctx.createOscillator();
    this._lead.type = 'sawtooth';
    this._lead.frequency.value = 110; // A2 — rises with intensity
    this._leadLPF = ctx.createBiquadFilter();
    this._leadLPF.type = 'lowpass';
    this._leadLPF.frequency.value = 400;
    this._leadLPF.Q.value = 6.0; // resonant for tension
    this._lead.connect(this._leadLPF);

    this._leadGain = ctx.createGain();
    this._leadGain.gain.value = 0;
    this._leadLPF.connect(this._leadGain);
    this._leadGain.connect(this._master);

    // Vibrato on lead.
    this._leadLFO = ctx.createOscillator();
    this._leadLFO.type = 'sine';
    this._leadLFO.frequency.value = 5.5;
    this._leadLFOGain = ctx.createGain();
    this._leadLFOGain.gain.value = 0; // depth grows with intensity
    this._leadLFO.connect(this._leadLFOGain);
    this._leadLFOGain.connect(this._lead.frequency);
    this._leadLFO.start();
    this._lead.start();

    // Apply any intensity already set before start() was called.
    this._applyIntensity();
  }

  /** Disconnect and null-out all audio nodes. */
  _teardown() {
    const stop = (node) => { try { node.stop(); } catch (e) {} };
    const disc = (node) => { try { node.disconnect(); } catch (e) {} };

    [this._droneA, this._droneB, this._droneLFO,
     this._padLFO, this._leadLFO, this._lead,
     ...this._padOscs].forEach(n => { if (n) { stop(n); disc(n); } });

    [this._master, this._droneGain, this._droneLFOGain, this._droneLPF,
     this._padGain, this._padLFOGain, this._padLPF,
     this._percGain,
     this._leadLPF, this._leadGain, this._leadLFOGain].forEach(n => { if (n) disc(n); });

    this._droneA = this._droneB = this._droneLFO = this._droneLFOGain = null;
    this._droneLPF = this._droneGain = null;
    this._padOscs = [];
    this._padGain = this._padLFO = this._padLFOGain = this._padLPF = null;
    this._percGain = null;
    this._lead = this._leadGain = this._leadLPF = null;
    this._leadLFO = this._leadLFOGain = null;
    this._master = null;
  }

  /**
   * Lookahead scheduler tick — called every SCHED_INTV ms.
   * Schedules all beats whose start time falls within the next LOOKAHEAD seconds.
   */
  _tick() {
    try {
      if (!this._ctx || !this._running) return;
      const now = this._ctx.currentTime;
      // Adjust BPM based on intensity (90–120 BPM range).
      const bpm  = 90 + this._intensity * 30;
      const beat = 60 / bpm;

      while (this._nextBeatTime < now + LOOKAHEAD) {
        this._scheduleBeat(this._nextBeatTime, beat);
        this._nextBeatTime += beat;
        this._beatIndex++;
      }
    } catch (e) { /* no-op */ }
  }

  /**
   * Synthesize one beat at time `t`.
   * - Kick on beats 0, 2 (every other beat).
   * - Noise hat on every beat.
   * Gain of each element is gated by _percGain (which tracks intensity).
   * @param {number} t    audioCtx.currentTime of this beat
   * @param {number} beat beat duration in seconds
   */
  _scheduleBeat(t, beat) {
    const ctx  = this._ctx;
    const bus  = this._percGain;
    if (!bus) return;

    const bi = this._beatIndex;

    // ── kick drum (pitch-dropping sine) ──────────────────────────────────────
    if (bi % 2 === 0) {
      const kick = ctx.createOscillator();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(160, t);
      kick.frequency.exponentialRampToValueAtTime(40, t + 0.12);

      const kGain = ctx.createGain();
      kGain.gain.setValueAtTime(0, t);
      kGain.gain.linearRampToValueAtTime(0.9, t + 0.004);
      kGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

      kick.connect(kGain);
      kGain.connect(bus);
      kick.start(t);
      kick.stop(t + 0.30);
    }

    // ── noise hat (brief highpassed white noise burst) ────────────────────────
    {
      const hatLen = 0.04 + (1 - this._intensity) * 0.02; // slightly shorter at high intensity
      const n      = Math.floor(ctx.sampleRate * (hatLen + 0.01));
      const buf    = ctx.createBuffer(1, n, ctx.sampleRate);
      const d      = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

      const hat  = ctx.createBufferSource();
      hat.buffer = buf;

      const hp   = ctx.createBiquadFilter();
      hp.type    = 'highpass';
      hp.frequency.value = 6000;

      const hGain = ctx.createGain();
      hGain.gain.setValueAtTime(0, t);
      hGain.gain.linearRampToValueAtTime(0.35, t + 0.003);
      hGain.gain.exponentialRampToValueAtTime(0.0001, t + hatLen);

      hat.connect(hp);
      hp.connect(hGain);
      hGain.connect(bus);
      hat.start(t);
      hat.stop(t + hatLen + 0.01);
    }

    // ── off-beat snare-flavour hit on odd beats ───────────────────────────────
    if (bi % 2 === 1) {
      const sn  = Math.floor(ctx.sampleRate * 0.10);
      const buf = ctx.createBuffer(1, sn, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < sn; i++) d[i] = Math.random() * 2 - 1;

      const snare  = ctx.createBufferSource();
      snare.buffer = buf;

      const bp   = ctx.createBiquadFilter();
      bp.type    = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 0.7;

      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0, t);
      sGain.gain.linearRampToValueAtTime(0.28, t + 0.005);
      sGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

      snare.connect(bp);
      bp.connect(sGain);
      sGain.connect(bus);
      snare.start(t);
      snare.stop(t + 0.11);
    }
  }

  /**
   * Ramp all layer gains to match the current _intensity value.
   * All ramps use setTargetAtTime to prevent audible clicks.
   */
  _applyIntensity() {
    if (!this._ctx) return;
    const v   = this._intensity;
    const t   = this._ctx.currentTime;
    const tau = RAMP_SLOW;

    // Drone: always audible, gets louder and brighter in combat.
    if (this._droneGain) {
      const droneVol = 0.4 + v * 0.25;
      this._droneGain.gain.setTargetAtTime(droneVol, t, tau);
    }
    if (this._droneLPF) {
      const cutoff = 180 + v * 600; // 180 Hz calm → 780 Hz combat
      this._droneLPF.frequency.setTargetAtTime(cutoff, t, tau);
    }

    // Pad: fades out as combat rises (leaves sonic space for drums).
    if (this._padGain) {
      const padVol = 0.22 * (1 - v * 0.65);
      this._padGain.gain.setTargetAtTime(padVol, t, tau);
    }

    // Percussion bus: fades in from silence.
    if (this._percGain) {
      this._percGain.gain.setTargetAtTime(v, t, tau * 0.5);
    }

    // Tension lead: rises with intensity, pitch creeps up.
    if (this._leadGain) {
      const leadVol = v * v * 0.18; // quadratic — subtle until intense
      this._leadGain.gain.setTargetAtTime(leadVol, t, tau * 0.5);
    }
    if (this._lead) {
      const freq = 73.42 + v * 73.42; // D2 → D3
      this._lead.frequency.setTargetAtTime(freq, t, tau);
    }
    if (this._leadLPF) {
      const cutoff = 300 + v * 2200; // opens up resonant filter
      this._leadLPF.frequency.setTargetAtTime(cutoff, t, tau * 0.4);
    }
    if (this._leadLFOGain) {
      this._leadLFOGain.gain.setTargetAtTime(v * 12, t, RAMP_FAST); // vibrato depth
    }

    // Drone LFO depth: calmer when exploring, wilder in combat.
    if (this._droneLFOGain) {
      this._droneLFOGain.gain.setTargetAtTime(60 + v * 180, t, tau);
    }
    if (this._droneLFO) {
      this._droneLFO.frequency.setTargetAtTime(0.12 + v * 0.35, t, tau);
    }
  }
}
