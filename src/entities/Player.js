import * as THREE from 'three';
import { ARENA_HALF } from '../world/Warehouse.js';

const GRAVITY = 22;
const EYE = 1.7;
const STAMINA_DRAIN = 1 / 4.5;   // empties in ~4.5s of sprinting
const STAMINA_REGEN = 1 / 6.0;   // refills in ~6s of rest
const EXHAUST_RECOVER = 0.35;    // must recover to this before sprinting again
// Crouch / slide (COD movement)
const CROUCH_OFF = 0.70;         // view drop when crouched (eye 1.7 -> 1.0)
const SLIDE_OFF = 0.80;          // view drop during a slide (eye 1.7 -> 0.9)
const SLIDE_SPEED = 14.7;        // initial slide burst speed
const SLIDE_DUR = 0.6;           // seconds
const SLIDE_CD = 1.2;            // cooldown before the next slide
const CROUCH_MUL = 0.55;         // crouch-walk speed multiplier

export class Player {
  constructor(camera, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.radius = 0.45;
    this.maxHealth = 100;
    this.health = 100;
    this.velY = 0;
    this.onGround = true;
    this.speed = 6.2;
    this.sprintMul = 1.7;
    this.alive = true;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._regenT = 0;
    this.onHurt = null; // callback(amount)
    // game-feel state
    this.eyeY = EYE;          // physics eye height (jump/gravity act on this)
    this.stamina = 1;         // 0..1
    this.sprinting = false;
    this._exhausted = false;
    this._bobPhase = 0;
    this._bobAmp = 0;
    this._stepPhase = 0;       // last bob phase a footstep fired at
    this.onFootstep = null;    // (intensity) => void — set by Game to play audio
    this._landDip = 0;
    this.onLand = null;       // callback(strength 0..1)
    // crouch / slide state
    this.crouching = false;
    this.sliding = false;
    this._slideT = 0;
    this._slideCd = 0;
    this._crouchOffset = 0;
    this._slideDir = new THREE.Vector3();
    this.onSlide = null;      // callback() when a slide starts
  }

  spawn(pos) {
    this.camera.position.set(pos.x, EYE, pos.z);
    this.health = this.maxHealth;
    this.velY = 0; this.alive = true; this._regenT = 0;
    this.eyeY = EYE; this.stamina = 1; this.sprinting = false; this._exhausted = false;
    this._bobPhase = 0; this._bobAmp = 0; this._landDip = 0; this.onGround = true;
    this.crouching = false; this.sliding = false; this._slideT = 0; this._slideCd = 0; this._crouchOffset = 0;
  }

  update(dt, input) {
    if (!this.alive) return;
    // horizontal movement relative to where the camera looks (yaw only)
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0; this._fwd.normalize();
    this._right.crossVectors(this._fwd, THREE.Object3D.DEFAULT_UP).normalize();

    const mv = input.moveAxis ? input.moveAxis() : { x: 0, z: 0 };
    let mx = mv.x, mz = mv.z;
    const len = Math.hypot(mx, mz);
    const pos = this.camera.position;
    const moving = len > 0.001;

    this._slideCd = Math.max(0, this._slideCd - dt);
    const wantCrouch = !!input.crouch;
    const sprintHeld = input.sprint && !this._exhausted && this.stamina > 0;

    // Start a slide: crouch pressed while sprinting forward with momentum.
    if (!this.sliding && wantCrouch && sprintHeld && moving && this.onGround &&
        this._slideCd <= 0 && len > 0.4) {
      this.sliding = true; this._slideT = SLIDE_DUR; this._slideCd = SLIDE_CD;
      this._slideDir.set(this._fwd.x * mz + this._right.x * mx, 0, this._fwd.z * mz + this._right.z * mx).normalize();
      if (this.onSlide) this.onSlide();
    }

    // sprint gated by stamina (no sprint while crouching or sliding)
    const wantSprint = sprintHeld && moving && this.onGround && !wantCrouch && !this.sliding;
    this.sprinting = wantSprint;
    if (wantSprint) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      if (this.stamina <= 0.02) this._exhausted = true;
    } else {
      this.stamina = Math.min(1, this.stamina + STAMINA_REGEN * dt);
      if (this._exhausted && this.stamina >= EXHAUST_RECOVER) this._exhausted = false;
    }

    if (this.sliding) {
      this._slideT -= dt;
      const p = 1 - Math.max(0, this._slideT) / SLIDE_DUR;     // 0 -> 1 over the slide
      const spd = (SLIDE_SPEED * (1 - p) + this.speed * CROUCH_MUL * p) * dt;
      pos.x += this._slideDir.x * spd; pos.z += this._slideDir.z * spd;
      this._resolve(pos);
      if (this._slideT <= 0 || !this.onGround) this.sliding = false;
    } else if (moving) {
      let mul = wantSprint ? this.sprintMul : 1;
      if (wantCrouch) mul *= CROUCH_MUL;
      const spd = this.speed * mul * dt;
      pos.x += (this._fwd.x * mz + this._right.x * mx) * spd;
      pos.z += (this._fwd.z * mz + this._right.z * mx) * spd;
      this._resolve(pos);
    }
    this.crouching = wantCrouch && !this.sliding;

    // jump + gravity (act on eyeY; camera.y gets visual bob/dip layered on after)
    if (input.jump && this.onGround) { this.velY = 8.2; this.onGround = false; }
    this.velY -= GRAVITY * dt;
    this.eyeY += this.velY * dt;
    if (this.eyeY <= EYE) {
      const impact = this.velY;        // negative = falling
      this.eyeY = EYE; this.velY = 0;
      if (!this.onGround && impact < -3) {
        const strength = Math.min(1, -impact / 12);
        this._landDip = Math.max(this._landDip, 0.05 + strength * 0.16);
        if (this.onLand) this.onLand(strength);
      }
      this.onGround = true;
    }

    // view bob while moving on the ground; springy landing dip (suppressed while crouched/sliding)
    const lowStance = this.crouching || this.sliding;
    const targetAmp = (moving && this.onGround && !lowStance) ? (this.sprinting ? 0.085 : 0.05) : 0;
    this._bobAmp += (targetAmp - this._bobAmp) * Math.min(1, dt * 8);
    if (moving && this.onGround && !lowStance) {
      this._bobPhase += dt * (this.sprinting ? 13 : 9);
      // One footstep per half-cycle (each foot plant). Fire as the phase crosses a
      // multiple of PI so cadence matches the view bob and quickens when sprinting.
      if (Math.floor(this._bobPhase / Math.PI) > Math.floor(this._stepPhase / Math.PI)) {
        if (this.onFootstep) this.onFootstep(this.sprinting ? 0.85 : 0.45);
      }
      this._stepPhase = this._bobPhase;
    } else {
      this._stepPhase = this._bobPhase; // keep in sync so no stale step fires on resume
    }
    const bobY = Math.sin(this._bobPhase) * this._bobAmp;
    this._landDip *= Math.max(0, 1 - dt * 7);
    // Smoothly drop the view for crouch/slide (separate from jump/gravity physics).
    const targetOff = this.sliding ? SLIDE_OFF : (this.crouching ? CROUCH_OFF : 0);
    this._crouchOffset += (targetOff - this._crouchOffset) * Math.min(1, dt * 12);
    pos.y = this.eyeY + bobY - this._landDip - this._crouchOffset;

    // hard arena clamp (safety net beyond the wall colliders)
    const lim = ARENA_HALF - 0.8;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));

    // slow health regen when not recently hit
    this._regenT += dt;
    if (this._regenT > 5 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + 6 * dt);
    }
  }

  _resolve(pos) {
    const r = this.radius;
    for (const b of this.colliders) {
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-7) {
        const d = Math.sqrt(d2), push = r - d;
        pos.x += (dx / d) * push; pos.z += (dz / d) * push;
      } else {
        const left = pos.x - b.min.x, right = b.max.x - pos.x;
        const front = pos.z - b.min.z, back = b.max.z - pos.z;
        const m = Math.min(left, right, front, back);
        if (m === left) pos.x = b.min.x - r;
        else if (m === right) pos.x = b.max.x + r;
        else if (m === front) pos.z = b.min.z - r;
        else pos.z = b.max.z + r;
      }
    }
  }

  heal(n) {
    if (!this.alive) return 0;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + n);
    return this.health - before;
  }

  takeDamage(n) {
    if (!this.alive) return;
    this.health -= n;
    this._regenT = 0;
    if (this.onHurt) this.onHurt(n);
    if (this.health <= 0) { this.health = 0; this.alive = false; }
  }
}
