// Trauma-based screen shake. Callers add() trauma (0..1); sample() returns a
// small positional offset that the game layers onto the camera ONLY for the
// rendered frame (reverted right after) so it never affects physics/aim.
export class ScreenShake {
  constructor() { this.trauma = 0; this._t = 0; }
  add(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  reset() { this.trauma = 0; this._t = 0; }

  sample(dt) {
    this._t += dt;
    const s = this.trauma * this.trauma; // quadratic -> snappier falloff
    this.trauma = Math.max(0, this.trauma - dt * 2.2);
    if (s <= 0.0001) return { x: 0, y: 0, z: 0 };
    const mag = 0.16 * s;
    const f = this._t * 38;
    return {
      x: mag * Math.sin(f * 1.00 + 0.0),
      y: mag * Math.sin(f * 1.37 + 1.7),
      z: mag * 0.5 * Math.sin(f * 0.90 + 4.1),
    };
  }
}
