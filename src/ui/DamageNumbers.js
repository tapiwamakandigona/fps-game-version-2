import * as THREE from 'three';

// Lightweight floating damage numbers. We project the hit point to screen space
// once at spawn, then animate purely in CSS (cheap) for the short lifetime.
// The DOM nodes are POOLED (pre-allocated + recycled) so heavy combat never
// thrashes createElement/remove — keeps the frame budget clean.
const LIFE = 0.7;
const POOL = 40;

export class DamageNumbers {
  constructor(camera, container) {
    this.camera = camera;
    this.layer = document.createElement('div');
    this.layer.id = 'dmg-layer';
    container.appendChild(this.layer);
    this._v = new THREE.Vector3();
    // Pre-allocate a fixed pool of hidden nodes.
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      el.style.display = 'none';
      this.layer.appendChild(el);
      this.pool.push({ el, active: false, t: 0, vx: 0 });
    }
    this._cursor = 0;
  }

  _acquire() {
    // Prefer a free slot; otherwise recycle the oldest (round-robin cursor).
    for (let i = 0; i < POOL; i++) {
      const idx = (this._cursor + i) % POOL;
      if (!this.pool[idx].active) { this._cursor = (idx + 1) % POOL; return this.pool[idx]; }
    }
    const slot = this.pool[this._cursor];
    this._cursor = (this._cursor + 1) % POOL;
    return slot;
  }

  spawn(point, amount, headshot = false) {
    this._v.copy(point).project(this.camera);
    if (this._v.z > 1) return; // behind the camera
    const x = (this._v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this._v.y * 0.5 + 0.5) * window.innerHeight;
    const it = this._acquire();
    const el = it.el;
    el.className = 'dmg-num' + (headshot ? ' hs' : '');
    el.textContent = (headshot ? '\u2691 ' : '') + Math.round(amount);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.display = 'block';
    it.active = true; it.t = 0; it.vx = (Math.random() - 0.5) * 42;
  }

  update(dt) {
    for (let i = 0; i < POOL; i++) {
      const it = this.pool[i];
      if (!it.active) continue;
      it.t += dt;
      const p = it.t / LIFE;
      it.el.style.transform =
        `translate(-50%,-50%) translate(${it.vx * it.t}px, ${-46 * p - 8}px) scale(${1 + 0.15 * (1 - p)})`;
      it.el.style.opacity = String(Math.max(0, 1 - p * p));
      if (it.t >= LIFE) { it.el.style.display = 'none'; it.active = false; }
    }
  }

  reset() {
    for (const it of this.pool) { it.active = false; it.el.style.display = 'none'; }
    this._cursor = 0;
  }
}
