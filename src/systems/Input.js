// Keyboard + mouse-button state. Mouse-look is handled by PointerLockControls.
export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDown = false;
    this.onShoot = null;   // callback on left-press
    this.onReload = null;
    this.onPause = null;

    this._enabled = false;

    window.addEventListener('keydown', (e) => {
      if (!this._enabled) return;
      const code = e.code;
      this.keys.add(code);
      if (code === 'KeyR' && this.onReload) this.onReload();
      if (code === 'Escape' && this.onPause) this.onPause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    window.addEventListener('mousedown', (e) => {
      if (!this._enabled || e.button !== 0) return;
      this.mouseDown = true;
      if (this.onShoot) this.onShoot();
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
  }

  setEnabled(v) { this._enabled = v; if (!v) { this.keys.clear(); this.mouseDown = false; } }
  isDown(code) { return this.keys.has(code); }
  get forward() { return this.isDown('KeyW') || this.isDown('ArrowUp'); }
  get back() { return this.isDown('KeyS') || this.isDown('ArrowDown'); }
  get left() { return this.isDown('KeyA') || this.isDown('ArrowLeft'); }
  get right() { return this.isDown('KeyD') || this.isDown('ArrowRight'); }
  get sprint() { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }
  get jump() { return this.isDown('Space'); }
}
