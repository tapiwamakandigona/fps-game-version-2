import * as THREE from 'three';
import { ARENA_HALF } from '../world/Warehouse.js';

const GRAVITY = 22;
const EYE = 1.7;
const STAMINA_DRAIN = 1 / 4.5;   // empties in ~4.5s of sprinting
const STAMINA_REGEN = 1 / 6.0;   // refills in ~6s of rest
const EXHAUST_RECOVER = 0.35;    // must recover to this before sprinting again

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
    this._landDip = 0;
    this.onLand = null;       // callback(strength 0..1)
  }

  spawn(pos) {
    this.camera.position.set(pos.x, EYE, pos.z);
    this.health = this.maxHealth;
    this.velY = 0; this.alive = true; this._regenT = 0;
    this.eyeY = EYE; this.stamina = 1; this.sprinting = false; this._exhausted = false;
    this._bobPhase = 0; this._bobAmp = 0; this._landDip = 0; this.onGround = true;
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

    // sprint gated by stamina (with exhaustion hysteresis so it can't stutter)
    const wantSprint = input.sprint && moving && this.onGround &&
      !this._exhausted && this.stamina > 0.02;
    this.sprinting = wantSprint;
    if (wantSprint) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      if (this.stamina <= 0) this._exhausted = true;
    } else {
      this.stamina = Math.min(1, this.stamina + STAMINA_REGEN * dt);
      if (this._exhausted && this.stamina >= EXHAUST_RECOVER) this._exhausted = false;
    }

    if (moving) {
      const spd = this.speed * (wantSprint ? this.sprintMul : 1) * dt;
      pos.x += (this._fwd.x * mz + this._right.x * mx) * spd;
      pos.z += (this._fwd.z * mz + this._right.z * mx) * spd;
      this._resolve(pos);
    }

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

    // view bob while moving on the ground; springy landing dip
    const targetAmp = (moving && this.onGround) ? (this.sprinting ? 0.085 : 0.05) : 0;
    this._bobAmp += (targetAmp - this._bobAmp) * Math.min(1, dt * 8);
    if (moving && this.onGround) this._bobPhase += dt * (this.sprinting ? 13 : 9);
    const bobY = Math.sin(this._bobPhase) * this._bobAmp;
    this._landDip *= Math.max(0, 1 - dt * 7);
    pos.y = this.eyeY + bobY - this._landDip;

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
