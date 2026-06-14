import * as THREE from 'three';

// Pre-allocated pool of tracer lines shared by all weapons. Avoids allocating a
// BufferGeometry + LineBasicMaterial on every shot (which caused GC micro-stutter
// during sustained SMG/shotgun fire). Lines are added to the scene once and shown
// by toggling .visible; positions are rewritten in place per shot.
export class TracerPool {
  constructor(scene, size = 28) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < size; i++) {
      const positions = new Float32Array(6); // 2 points * xyz
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      line.userData.noHit = true;
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.pool.push({ line, geo, positions, mat, ttl: 0 });
    }
  }

  spawn(start, end) {
    let t;
    if (this.pool.length) { t = this.pool.pop(); this.active.push(t); }
    else { t = this.active.shift(); this.active.push(t); } // recycle the oldest
    if (!t) return;
    const p = t.positions;
    p[0] = start.x; p[1] = start.y; p[2] = start.z;
    p[3] = end.x;   p[4] = end.y;   p[5] = end.z;
    t.geo.attributes.position.needsUpdate = true;
    t.geo.computeBoundingSphere();
    t.mat.opacity = 0.9;
    t.line.visible = true;
    t.ttl = 0.07;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      t.ttl -= dt;
      t.mat.opacity = Math.max(0, (t.ttl / 0.07) * 0.9);
      if (t.ttl <= 0) {
        t.line.visible = false;
        this.active.splice(i, 1);
        this.pool.push(t);
      }
    }
  }

  reset() {
    for (const t of this.active) { t.line.visible = false; t.mat.opacity = 0; this.pool.push(t); }
    this.active.length = 0;
  }
}
