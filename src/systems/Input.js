// Keyboard + mouse + touch state.
// Desktop look is handled by PointerLockControls; touch look feeds lookDX/lookDY
// which Game applies to the camera each frame.
export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDown = false;
    this.ads = false;      // aim-down-sights (right mouse / touch ADS button)
    this.onShoot = null;   // callback on press
    this.onReload = null;
    this.onPause = null;
    this.onSwitch = null;     // callback(index)
    this.onSwitchNext = null; // callback()
    this.onGrenade = null;    // callback() — throw a grenade (G)
    this.onTactical = null;   // callback() — throw a flashbang (F)

    // touch / analog state
    this.axisX = 0;        // -1..1 strafe (from virtual stick)
    this.axisZ = 0;        // -1..1 forward
    this.touchSprint = false;
    this._touchJump = false;
    this.lookDX = 0;       // accumulated yaw delta (consumed each frame)
    this.lookDY = 0;       // accumulated pitch delta

    this._enabled = false;

    window.addEventListener('keydown', (e) => {
      if (!this._enabled) return;
      const code = e.code;
      this.keys.add(code);
      if (code === 'KeyR' && this.onReload) this.onReload();
      if (code === 'Escape' && this.onPause) this.onPause();
      if (code === 'Digit1' && this.onSwitch) this.onSwitch(0);
      if (code === 'Digit2' && this.onSwitch) this.onSwitch(1);
      if (code === 'Digit3' && this.onSwitch) this.onSwitch(2);
      if (code === 'Digit4' && this.onSwitch) this.onSwitch(3);
      if (code === 'KeyG' && this.onGrenade) this.onGrenade();
      if (code === 'KeyF' && this.onTactical) this.onTactical();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    window.addEventListener('mousedown', (e) => {
      if (!this._enabled) return;
      if (e.button === 0) { this.mouseDown = true; if (this.onShoot) this.onShoot(); }
      else if (e.button === 2) { this.ads = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      else if (e.button === 2) this.ads = false;
    });
    // Don't pop the browser context menu when aiming with right-click.
    window.addEventListener('contextmenu', (e) => { if (this._enabled) e.preventDefault(); });
    window.addEventListener('wheel', () => { if (this._enabled && this.onSwitchNext) this.onSwitchNext(); }, { passive: true });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; this.axisX = 0; this.axisZ = 0; });
  }

  setEnabled(v) {
    this._enabled = v;
    if (!v) { this.keys.clear(); this.mouseDown = false; this.ads = false; this.axisX = 0; this.axisZ = 0; this._touchJump = false; this._touchCrouch = false; }
  }

  // --- touch hooks (called by TouchControls) ---
  fireDown() { this.mouseDown = true; if (this._enabled && this.onShoot) this.onShoot(); }
  fireUp() { this.mouseDown = false; }
  adsDown() { this.ads = true; }
  adsUp() { this.ads = false; }
  setCrouch(v) { this._touchCrouch = v; }
  triggerReload() { if (this._enabled && this.onReload) this.onReload(); }
  triggerSwap() { if (this._enabled && this.onSwitchNext) this.onSwitchNext(); }
  setJump(v) { this._touchJump = v; }
  addLook(dx, dy) { this.lookDX += dx; this.lookDY += dy; }
  consumeLook() { const x = this.lookDX, y = this.lookDY; this.lookDX = 0; this.lookDY = 0; return { x, y }; }

  isDown(code) { return this.keys.has(code); }
  get forward() { return this.isDown('KeyW') || this.isDown('ArrowUp'); }
  get back() { return this.isDown('KeyS') || this.isDown('ArrowDown'); }
  get left() { return this.isDown('KeyA') || this.isDown('ArrowLeft'); }
  get right() { return this.isDown('KeyD') || this.isDown('ArrowRight'); }
  get sprint() { return this.isDown('ShiftLeft') || this.isDown('ShiftRight') || this.touchSprint; }
  get jump() { return this.isDown('Space') || this._touchJump; }
  get crouch() { return this.isDown('ControlLeft') || this.isDown('KeyC') || this._touchCrouch; }

  // Combined digital + analog movement, normalised to max length 1.
  moveAxis() {
    let x = 0, z = 0;
    if (this.forward) z += 1;
    if (this.back) z -= 1;
    if (this.right) x += 1;
    if (this.left) x -= 1;
    x += this.axisX; z += this.axisZ;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }
}
