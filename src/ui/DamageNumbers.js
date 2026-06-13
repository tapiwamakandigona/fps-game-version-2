import * as THREE from 'three';

// Lightweight floating damage numbers. We project the hit point to screen space
// once at spawn, then animate purely in CSS (cheap) for the short lifetime.
const LIFE = 0.7;

export class DamageNumbers {
  constructor(camera, container) {
    this.camera = camera;
    this.layer = document.createElement('div');
    this.layer.id = 'dmg-layer';
    container.appendChild(this.layer);
    this.items = [];
    this._v = new THREE.Vector3();
  }

  spawn(point, amount, headshot = false) {
    this._v.copy(point).project(this.camera);
    if (this._v.z > 1) return; // behind the camera
    const x = (this._v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this._v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = 'dmg-num' + (headshot ? ' hs' : '');
    el.textContent = (headshot ? '\u2691 ' : '') + Math.round(amount);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    this.layer.appendChild(el);
    this.items.push({ el, t: 0, vx: (Math.random() - 0.5) * 42 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const p = it.t / LIFE;
      it.el.style.transform =
        `translate(-50%,-50%) translate(${it.vx * it.t}px, ${-46 * p - 8}px) scale(${1 + 0.15 * (1 - p)})`;
      it.el.style.opacity = String(Math.max(0, 1 - p * p));
      if (it.t >= LIFE) { it.el.remove(); this.items.splice(i, 1); }
    }
  }

  reset() { for (const it of this.items) it.el.remove(); this.items = []; }
}
