// Voice announcer using Web Speech API — zero assets, procedural only.
// Military-style deep/urgent tone. Gracefully no-ops if speechSynthesis is absent.

const SUPPORTED = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Priority constants — higher number wins when the queue is trimmed.
const PRI_LOW    = 0;
const PRI_NORMAL = 1;
const PRI_HIGH   = 2;

export class Announcer {
  constructor() {
    this._enabled  = true;
    this._volume   = 0.85;
    this._voice    = null;   // SpeechSynthesisVoice
    this._queue    = [];     // [{ text, rate, pitch, priority }]
    this._speaking = false;

    if (!SUPPORTED) return;

    // Voices may already be loaded (Chrome desktop) or arrive asynchronously (mobile/Firefox).
    this._pickVoice();
    if (!this._voice) {
      window.speechSynthesis.addEventListener('voiceschanged', () => this._pickVoice(), { once: true });
    }
  }

  // ── voice selection ────────────────────────────────────────────────────────

  _pickVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    // Prefer English voices; favour 'en-US' or 'en-GB'; take any 'en' as fallback.
    const en = voices.filter(v => v.lang.startsWith('en'));
    this._voice = en.find(v => v.lang === 'en-US')
               || en.find(v => v.lang === 'en-GB')
               || en[0]
               || voices[0];
  }

  // ── public control ─────────────────────────────────────────────────────────

  setEnabled(bool) { this._enabled = !!bool; if (!bool) this.cancelAll(); }
  setVolume(v)     { this._volume = Math.max(0, Math.min(1, v)); }

  // ── core queue logic ───────────────────────────────────────────────────────

  /**
   * Queue a phrase.
   * @param {string} text
   * @param {{ rate?: number, pitch?: number, priority?: number }} [opts]
   */
  say(text, opts = {}) {
    if (!SUPPORTED || !this._enabled || !text) return;
    const entry = {
      text,
      rate:     opts.rate     ?? 1.25,
      pitch:    opts.pitch    ?? 0.7,
      priority: opts.priority ?? PRI_NORMAL,
    };

    // Never let the queue exceed 3 items (current + 2 pending).
    // When full, drop the lowest-priority entry that is NOT currently speaking.
    if (this._queue.length >= 2) {
      const minPri = Math.min(...this._queue.map(e => e.priority));
      if (entry.priority < minPri) return;          // drop incoming low-pri
      const idx = this._queue.map(e => e.priority).lastIndexOf(minPri);
      if (idx !== -1) this._queue.splice(idx, 1);   // drop oldest lowest-pri
    }

    this._queue.push(entry);
    if (!this._speaking) this._next();
  }

  /** Stop everything and empty the queue. */
  cancelAll() {
    if (!SUPPORTED) return;
    this._queue    = [];
    this._speaking = false;
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }

  // ── internal playback ──────────────────────────────────────────────────────

  _next() {
    if (!this._queue.length) { this._speaking = false; return; }
    this._speaking = true;
    const entry = this._queue.shift();
    try {
      const utt    = new SpeechSynthesisUtterance(entry.text);
      utt.rate     = entry.rate;
      utt.pitch    = entry.pitch;
      utt.volume   = this._volume;
      if (this._voice) utt.voice = this._voice;
      utt.onend  = () => this._next();
      utt.onerror = () => this._next();  // don't stall on error
      window.speechSynthesis.speak(utt);
    } catch (e) {
      // If speak() throws (e.g. page not active), drain the queue gracefully.
      this._speaking = false;
      this._queue = [];
    }
  }

  // ── convenience helpers ────────────────────────────────────────────────────

  /** "Wave 1", "Wave 2", … */
  wave(n) {
    this.say(`Wave ${n}`, { priority: PRI_HIGH });
  }

  /**
   * Kill-streak flavour texts.
   * count 2 → "Double Kill", 3 → "Triple Kill", 4 → "Multi Kill", 5+ → "Monster Kill"
   */
  multiKill(count) {
    const labels = { 2: 'Double Kill', 3: 'Triple Kill', 4: 'Multi Kill' };
    const text   = labels[count] ?? 'Monster Kill';
    this.say(text, { rate: 1.3, pitch: 0.65, priority: PRI_HIGH });
  }

  /**
   * Online/available callout — spells out the name letter-by-letter for clarity.
   * e.g. killstreak("UAV") → "U A V online"
   */
  killstreak(name) {
    const spaced = String(name).split('').join(' ');
    this.say(`${spaced} online`, { rate: 1.1, pitch: 0.7, priority: PRI_NORMAL });
  }

  bossIncoming() {
    this.say('Incoming hostile. All units, be advised.', { rate: 1.2, pitch: 0.6, priority: PRI_HIGH });
  }

  lowHealth() {
    this.say('Warning. Critical health.', { rate: 1.4, pitch: 0.75, priority: PRI_HIGH });
  }

  victory() {
    this.say('Mission complete. Outstanding work, soldier.', { rate: 1.1, pitch: 0.65, priority: PRI_HIGH });
  }

  defeat() {
    this.say('Mission failed. All units, fall back.', { rate: 1.15, pitch: 0.6, priority: PRI_HIGH });
  }
}
