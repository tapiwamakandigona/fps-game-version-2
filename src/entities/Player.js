import * as THREE from 'three';
import { ARENA_HALF } from '../world/Warehouse.js';

const GRAVITY = 22;
const EYE = 1.7;

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
  }

  spawn(pos) {
    this.camera.position.set(pos.x, EYE, pos.z);
    this.health = this.maxHealth;
    this.velY = 0; this.alive = true; this._regenT = 0;
  }

  update(dt, input) {
    if (!this.alive) return;
    // horizontal movement relative to where the camera looks (yaw only)
    this.camera.getWorldDirection(this._fwd);
    this._fwd.y = 0; this._fwd.normalize();
    this._right.crossVectors(this._fwd, THREE.Object3D.DEFAULT_UP).normalize();

    let mx = 0, mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.right) mx += 1;
    if (input.left) mx -= 1;
    const len = Math.hypot(mx, mz);
    const pos = this.camera.position;
    if (len > 0) {
      mx /= len; mz /= len;
      const spd = this.speed * (input.sprint ? this.sprintMul : 1) * dt;
      pos.x += (this._fwd.x * mz + this._right.x * mx) * spd;
      pos.z += (this._fwd.z * mz + this._right.z * mx) * spd;
      this._resolve(pos);
    }

    // jump + gravity
    if (input.jump && this.onGround) { this.velY = 8.2; this.onGround = false; }
    this.velY -= GRAVITY * dt;
    pos.y += this.velY * dt;
    if (pos.y <= EYE) { pos.y = EYE; this.velY = 0; this.onGround = true; }

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

  takeDamage(n) {
    if (!this.alive) return;
    this.health -= n;
    this._regenT = 0;
    if (this.onHurt) this.onHurt(n);
    if (this.health <= 0) { this.health = 0; this.alive = false; }
  }
}
