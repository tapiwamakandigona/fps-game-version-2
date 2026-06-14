import * as THREE from 'three';

// Authoritative first-person look controller.
//
// Why not PointerLockControls? Composing recoil/touch on top of its camera while it
// also rewrites the camera every mousemove means orientation is repeatedly decomposed
// quaternion -> euler -> quaternion. Near vertical (looking straight down/up) that YXZ
// decomposition is numerically unstable and the yaw can snap — the "jerk when looking
// down" bug. Here yaw & pitch are the single source of truth (plain scalars); we only
// ever COMPOSE a quaternion from them, never read one back. Recoil is a transient
// additive offset, so aim recovers exactly with zero drift.
const PITCH_LIMIT = Math.PI / 2 - 0.04; // ~87.7° — comfortably clear of gimbal lock

export class LookControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.pointerSpeed = 1.0;     // sensitivity multiplier (set by Settings/ADS)
    this.isLocked = false;

    this.yaw = 0;                // authoritative heading (radians)
    this.pitch = 0;             // authoritative elevation (radians), clamped
    this._recoilPitch = 0;       // transient view kick (added at compose time)
    this._recoilYaw = 0;
    this._emaMag = 0;            // running estimate of typical per-event mouse delta

    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._listeners = { lock: [], unlock: [], change: [] };

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._onLockError = this._onLockError.bind(this);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
  }

  // --- minimal EventTarget-style API (matches the old PointerLockControls usage) ---
  addEventListener(type, fn) { if (this._listeners[type]) this._listeners[type].push(fn); }
  _emit(type) { for (const fn of this._listeners[type] || []) fn(); }

  lock() { this.dom.requestPointerLock?.(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  _onLockChange() {
    const locked = document.pointerLockElement === this.dom;
    if (locked === this.isLocked) return;
    this.isLocked = locked;
    this._emit(locked ? 'lock' : 'unlock');
  }
  _onLockError() { /* ignore — user can click to retry */ }

  _onMouseMove(e) {
    if (!this.isLocked) return;
    let mx = e.movementX || 0;
    let my = e.movementY || 0;
    // --- Pointer-lock spike rejection ---
    // Chromium (and occasionally other engines) sporadically reports a single huge
    // movementX/Y under pointer lock — an isolated delta orders of magnitude larger
    // than the surrounding motion. Raw, that shows up as the camera "jumping" while
    // you're looking slowly up/down standing still. We cap each event to an adaptive
    // ceiling that tracks recent motion (so genuine fast flicks pass untouched) with a
    // sane floor + hard cap so a stray spike can't teleport the view.
    const mag = Math.hypot(mx, my);
    const ceiling = Math.min(300, Math.max(45, this._emaMag * 6));
    if (mag > ceiling && mag > 0) {
      const s = ceiling / mag;
      mx *= s; my *= s;
    }
    // Track the (clamped) magnitude so sustained fast motion opens the ceiling within
    // a frame or two — a real flick passes; an isolated 1-event spike stays capped.
    this._emaMag += (Math.min(mag, ceiling) - this._emaMag) * 0.35;
    // raw 1:1 mapping (no smoothing) keeps mouse aim crisp & responsive
    this.yaw -= mx * 0.002 * this.pointerSpeed;
    this.pitch -= my * 0.002 * this.pointerSpeed;
    this._clampPitch();
  }

  // Touch / analog look: feed already-scaled yaw/pitch deltas.
  addYawPitch(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch += dPitch;
    this._clampPitch();
  }

  // Transient recoil offset (eased toward 0 by the caller). Never touches yaw/pitch,
  // so the shot kicks the VIEW and then settles back to the exact aim point.
  setRecoil(pitch, yaw) { this._recoilPitch = pitch; this._recoilYaw = yaw; }

  _clampPitch() {
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    else if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  }

  // Write the composed orientation to the camera. Call once per frame (after look +
  // recoil have been updated, before render).
  update() {
    this._euler.set(this.pitch + this._recoilPitch, this.yaw + this._recoilYaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
    this._emit('change');
  }

  // Sync yaw/pitch from the camera's current orientation (e.g. after a respawn that
  // sets camera.lookAt). Done ONCE, not per-frame, so no gimbal round-trip in the loop.
  syncFromCamera() {
    this._euler.setFromQuaternion(this.camera.quaternion);
    this.yaw = this._euler.y;
    this.pitch = this._euler.x;
    this._recoilPitch = this._recoilYaw = 0;
    this._clampPitch();
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
  }
}
