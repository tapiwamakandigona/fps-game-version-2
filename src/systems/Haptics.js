// Haptics — tiny wrapper around navigator.vibrate for touch devices.
// All calls are no-ops when the API is missing (iOS Safari) or the user has
// turned "Vibration" off in Settings, so callers never need to guard.
export class Haptics {
  constructor() {
    this.enabled = true;
    this._ok = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  _buzz(pattern) {
    if (!this.enabled || !this._ok) return;
    try { navigator.vibrate(pattern); } catch (_) { /* ignore */ }
  }

  fire()   { this._buzz(8); }        // short tick per trigger pull
  hit()    { this._buzz(15); }       // landed a shot
  kill()   { this._buzz([20, 30, 20]); }
  hurt()   { this._buzz(45); }       // took damage — strongest cue
  reload() { this._buzz([10, 40, 10]); }
}
