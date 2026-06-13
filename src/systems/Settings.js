// Persistent player settings: brightness, quality, look sensitivity, volume.
const KEY = 'fps-v2-settings';
export const BASE_LOOK_SENS = 0.0040;
const DEFAULTS = { brightness: 1.35, quality: 'high', sensitivity: 1.0, volume: 0.5 };

export class Settings {
  constructor(game) {
    this.game = game;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    this.values = { ...DEFAULTS, ...(saved || {}) };
    // First run on a phone defaults to the lighter "med" preset for smooth FPS.
    if (!saved && game.touch) this.values.quality = 'med';
  }

  apply() {
    const v = this.values;
    this.game.engine.setExposure(v.brightness);
    this.game.engine.setQuality(v.quality);
    this.game.audio.setVolume(v.volume);
    if (this.game.controls) this.game.controls.pointerSpeed = v.sensitivity;
    if (this.game.touchControls) this.game.touchControls.lookSens = BASE_LOOK_SENS * v.sensitivity;
  }

  set(k, val) { this.values[k] = val; this.apply(); this.save(); }
  get(k) { return this.values[k]; }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) {} }
}
