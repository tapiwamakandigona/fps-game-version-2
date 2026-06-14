// DirectionalDamage — on-screen hit-direction feedback + low-health heartbeat vignette.
//
// Renders:
//   1. A red wedge/arc at the screen edge pointing toward the attacker (pooled, 6 elements).
//   2. A pulsing full-screen vignette when the player is low on health.
//
// Owns its own full-screen fixed overlay (pointer-events:none, z-index:40).
// Injects a single <style> block on first instantiation.
// Requires a THREE.PerspectiveCamera for yaw math.

import * as THREE from 'three';

// ─── Constants ───────────────────────────────────────────────────────────────
const POOL_SIZE   = 6;      // max simultaneous wedges
const WEDGE_LIFE  = 0.9;    // seconds to fully fade out
const PULSE_HZ    = 1.2;    // heartbeat frequency (cycles per second)
const WEDGE_HALF  = 32;     // half-angle of the wedge in degrees
const EDGE_INSET  = 12;     // px from screen edge to wedge centre
const WEDGE_W     = 54;     // wedge element width  (px)
const WEDGE_H     = 54;     // wedge element height (px)

// ─── Shared reusable vectors ──────────────────────────────────────────────────
const _fwd    = new THREE.Vector3();
const _toAtk  = new THREE.Vector3();

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
.dd-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 40;
  overflow: hidden;
}
/* Directional wedge */
.dd-wedge {
  position: absolute;
  width: ${WEDGE_W}px;
  height: ${WEDGE_H}px;
  /* Conic gradient: red sector ±WEDGE_HALF degrees around the top (0deg = 12 o'clock). */
  background: conic-gradient(
    from ${-WEDGE_HALF}deg at 50% 0%,
    transparent 0deg,
    rgba(255, 30, 30, 0.95) 1deg,
    rgba(255, 30, 30, 0.95) ${WEDGE_HALF * 2 - 1}deg,
    transparent ${WEDGE_HALF * 2}deg
  );
  /* Drop-shadow for visibility on bright backgrounds */
  filter: drop-shadow(0 0 6px rgba(255, 0, 0, 0.7));
  transform-origin: center center;
  opacity: 0;
  will-change: opacity, transform;
}
/* Low-health heartbeat vignette */
.dd-vignette {
  position: absolute;
  inset: 0;
  border-radius: 0;
  background: radial-gradient(
    ellipse at center,
    transparent 42%,
    rgba(200, 0, 0, 0.0) 60%,
    rgba(200, 0, 0, 0.72) 100%
  );
  opacity: 0;
  will-change: opacity;
}
`;

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ─── Class ────────────────────────────────────────────────────────────────────
export class DirectionalDamage {
  /**
   * @param {HTMLElement}               parentEl  — element to append the overlay to
   * @param {THREE.PerspectiveCamera}   camera    — used to derive player yaw
   */
  constructor(parentEl, camera) {
    this.camera = camera;

    injectCSS();

    // Full-screen overlay container
    this._overlay = document.createElement('div');
    this._overlay.className = 'dd-overlay';
    parentEl.appendChild(this._overlay);

    // Vignette element (single, always present)
    this._vignette = document.createElement('div');
    this._vignette.className = 'dd-vignette';
    this._overlay.appendChild(this._vignette);

    // Pre-allocate wedge pool
    this._pool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'dd-wedge';
      this._overlay.appendChild(el);
      this._pool.push({ el, t: -1 }); // t < 0 = idle
    }

    // Heartbeat state
    this._lowHealth = false;
    this._pulseT    = 0;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Show a directional wedge pointing toward the attacker.
   * @param {THREE.Vector3} attackerWorldPos
   * @param {THREE.Vector3} playerWorldPos
   */
  hit(attackerWorldPos, playerWorldPos) {
    const angle = this._computeAngle(attackerWorldPos, playerWorldPos);
    if (angle === null) return;

    // Grab an idle slot (or steal the oldest active one)
    const slot = this._acquireSlot();
    slot.t     = 0;
    slot.angle = angle;

    this._placeWedge(slot);
    slot.el.style.opacity = '1';
  }

  /**
   * Toggle the low-health pulsing vignette.
   * @param {boolean} active
   */
  setLowHealth(active) {
    this._lowHealth = !!active;
    if (!this._lowHealth) {
      this._vignette.style.opacity = '0';
    }
  }

  /**
   * Advance animations. Call every frame.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    // Advance wedge fades
    for (const slot of this._pool) {
      if (slot.t < 0) continue; // idle
      slot.t += dt;
      if (slot.t >= WEDGE_LIFE) {
        slot.el.style.opacity = '0';
        slot.t = -1; // mark idle
      } else {
        // Ease-out fade
        const frac = slot.t / WEDGE_LIFE;
        slot.el.style.opacity = String(Math.max(0, 1 - frac * frac));
      }
    }

    // Heartbeat vignette pulse
    if (this._lowHealth) {
      this._pulseT += dt;
      // sin-based pulse: oscillates between 0.2 and 0.85
      const sin  = Math.sin(this._pulseT * PULSE_HZ * Math.PI * 2);
      const alpha = 0.2 + 0.65 * (sin * 0.5 + 0.5);
      this._vignette.style.opacity = String(alpha);
    }
  }

  /** Hide all wedges and the vignette immediately. */
  clear() {
    for (const slot of this._pool) {
      slot.t = -1;
      slot.el.style.opacity = '0';
    }
    this._lowHealth = false;
    this._vignette.style.opacity = '0';
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Compute the bearing angle (degrees, 0 = forward/top, clockwise) from
   * player's camera yaw to the attacker.
   * Returns null if the camera isn't ready.
   * @returns {number|null}
   */
  _computeAngle(attackerWorldPos, playerWorldPos) {
    const cam = this.camera;
    if (!cam) return null;

    // Camera forward projected onto XZ plane
    cam.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) return null; // camera pointing straight up/down
    _fwd.normalize();

    // Vector from player to attacker projected onto XZ
    _toAtk.copy(attackerWorldPos).sub(playerWorldPos);
    _toAtk.y = 0;
    if (_toAtk.lengthSq() < 1e-6) return null; // attacker is at same XZ position

    _toAtk.normalize();

    // Signed angle: atan2(cross.y, dot)  — cross.y = fwd.x*toAtk.z - fwd.z*toAtk.x
    const dot   = _fwd.x * _toAtk.x + _fwd.z * _toAtk.z;
    const cross = _fwd.x * _toAtk.z - _fwd.z * _toAtk.x;
    // atan2 gives clockwise-positive when y-axis points up (cross on XZ)
    let deg = Math.atan2(-cross, dot) * (180 / Math.PI); // − cross → clockwise = positive
    if (deg < 0) deg += 360;
    return deg;
  }

  /**
   * Position and rotate a wedge element to sit at the screen edge at `angle` degrees.
   * angle 0 = top, 90 = right, 180 = bottom, 270 = left.
   */
  _placeWedge(slot) {
    const el    = slot.el;
    const angle = slot.angle;
    const rad   = angle * (Math.PI / 180);

    const W  = window.innerWidth;
    const H  = window.innerHeight;
    const cx = W / 2;
    const cy = H / 2;

    // Direction vector from centre toward the screen edge
    const dx = Math.sin(rad);   // right at 90°
    const dy = -Math.cos(rad);  // up at 0°

    // Find where this ray hits the screen boundary
    let tx, ty;
    if (Math.abs(dx) < 1e-9) {
      // Pure vertical
      tx = cx;
      ty = dy < 0 ? EDGE_INSET : H - EDGE_INSET;
    } else if (Math.abs(dy) < 1e-9) {
      // Pure horizontal
      tx = dx < 0 ? EDGE_INSET : W - EDGE_INSET;
      ty = cy;
    } else {
      // Parametric clip against each edge; pick the smallest positive t
      const tRight  = (W - EDGE_INSET - cx) / dx;
      const tLeft   = (EDGE_INSET - cx)     / dx;
      const tBottom = (H - EDGE_INSET - cy) / dy;
      const tTop    = (EDGE_INSET - cy)     / dy;

      const candidates = [tRight, tLeft, tBottom, tTop].filter(t => t > 0);
      const t = Math.min(...candidates);
      tx = cx + dx * t;
      ty = cy + dy * t;
    }

    // Centre the element on the computed edge point
    el.style.left      = `${tx - WEDGE_W / 2}px`;
    el.style.top       = `${ty - WEDGE_H / 2}px`;
    // Rotate so the wedge tip always points inward (toward attacker)
    el.style.transform = `rotate(${angle}deg)`;
  }

  /**
   * Return an idle pool slot, or evict the oldest active one.
   */
  _acquireSlot() {
    // Prefer a truly idle slot
    for (const slot of this._pool) {
      if (slot.t < 0) return slot;
    }
    // All busy — steal the one furthest through its life
    let oldest = this._pool[0];
    for (const slot of this._pool) {
      if (slot.t > oldest.t) oldest = slot;
    }
    return oldest;
  }
}
