// COD-style scrolling kill feed displayed in the top-right corner.
// Self-contained: creates its own container + injects its own <style>.
// No external CSS, no build step — plain ES module.

const KIND_COLOR = {
  normal:    '#e8edf4',
  headshot:  '#ffd34d',
  explosive: '#ff9a3c',
  streak:    '#ff5b5b',
};

const MAX_ENTRIES = 5;
const FADE_DELAY  = 3600; // ms before the entry starts fading
const FADE_DUR    = 600;  // ms for the CSS opacity transition
const REMOVE_AT   = FADE_DELAY + FADE_DUR + 50; // ms until DOM removal

const STYLE_ID = 'kf-style';

const CSS = `
.kf-wrap {
  position: fixed;
  top: 64px;
  right: 14px;
  z-index: 50;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.kf-entry {
  display: inline-block;
  font-family: 'Rajdhani', 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-align: right;
  padding: 2px 8px 2px 10px;
  border-radius: 2px;
  background: rgba(0,0,0,0.48);
  white-space: nowrap;
  opacity: 1;
  transition: opacity ${FADE_DUR}ms ease-out;
  text-shadow: 0 1px 3px rgba(0,0,0,0.7);
  will-change: opacity;
}
.kf-entry.kf-fade {
  opacity: 0;
}
`;

export class KillFeed {
  /**
   * @param {HTMLElement} [parentEl] — defaults to document.body.
   */
  constructor(parentEl = document.body) {
    // Inject shared <style> once per page.
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // Outer container.
    this._wrap = document.createElement('div');
    this._wrap.className = 'kf-wrap';
    parentEl.appendChild(this._wrap);

    // Live entry handles: { el, timer }
    this._entries = [];
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Push a raw text entry into the feed.
   * @param {string} text
   * @param {'normal'|'headshot'|'explosive'|'streak'} [kind]
   */
  push(text, kind = 'normal') {
    try {
      // Enforce max visible cap — evict oldest first.
      if (this._entries.length >= MAX_ENTRIES) {
        this._evict(this._entries[0]);
      }

      const el = document.createElement('div');
      el.className = 'kf-entry';
      el.style.color = KIND_COLOR[kind] ?? KIND_COLOR.normal;
      // Prefix skull for headshots.
      el.textContent = (kind === 'headshot' ? '☠  ' : '') + text;

      this._wrap.appendChild(el);

      // Schedule fade + removal via setTimeout (no per-frame DOM thrash).
      const fadeTimer = setTimeout(() => {
        el.classList.add('kf-fade');
      }, FADE_DELAY);

      const removeTimer = setTimeout(() => {
        this._removeEntry(entry); // eslint-disable-line no-use-before-define
      }, REMOVE_AT);

      const entry = { el, fadeTimer, removeTimer };
      this._entries.push(entry);
    } catch (_) {
      // Never throw.
    }
  }

  /**
   * Format and push a kill event.
   * @param {{ weapon?:string, variant?:string, points?:number,
   *            headshot?:boolean, explosive?:boolean, streak?:boolean }} opts
   */
  kill({ weapon = '', variant = '', points = 0, headshot = false, explosive = false, streak = false } = {}) {
    try {
      let kind = 'normal';
      if (streak)    kind = 'streak';
      else if (headshot)  kind = 'headshot';
      else if (explosive) kind = 'explosive';

      // Build: "Rifle ▸ Brute  +180"
      let line = [weapon, variant].filter(Boolean).join(' ▸ ');
      if (points) line += `  +${points}`;

      this.push(line.trim(), kind);
    } catch (_) {
      // Never throw.
    }
  }

  /**
   * Optional per-frame upkeep hook (no-op — timers handle everything).
   * @param {number} _dt
   */
  update(_dt) {}

  /** Remove all entries immediately. */
  clear() {
    try {
      for (const entry of this._entries.slice()) {
        this._evict(entry);
      }
    } catch (_) {
      // Never throw.
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Immediately remove an entry, cancelling its pending timers. */
  _evict(entry) {
    clearTimeout(entry.fadeTimer);
    clearTimeout(entry.removeTimer);
    entry.el.remove();
    const i = this._entries.indexOf(entry);
    if (i !== -1) this._entries.splice(i, 1);
  }

  /** Called by the remove timer after the fade completes. */
  _removeEntry(entry) {
    entry.el.remove();
    const i = this._entries.indexOf(entry);
    if (i !== -1) this._entries.splice(i, 1);
  }
}
