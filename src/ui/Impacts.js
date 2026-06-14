import * as THREE from 'three';

// Cheap impact sparks: a single additive billboard quad per hit that pops in
// scale and fades fast. No extra lights (keeps the cost negligible even for a
// shotgun blast). Colour conveys the surface: blood vs. spark.
// Pooled: meshes + materials are pre-allocated once and reused (visibility
// toggled) so sustained fire never allocates/disposes during gameplay.
const GEO = new THREE.PlaneGeometry(1, 1);

export class Impacts {
  constructor(scene, camera, size = 24) {
    this.scene = scene;
    this.camera = camera;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < size; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(GEO, mat);
      m.userData.noHit = true;
      m.frustumCulled = false;
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, mat, t: 0, life: 0.16, base: 0 });
    }
  }

  spawn(point, color = 0xffd27f, scale = 1) {
    let it;
    if (this.pool.length) { it = this.pool.pop(); this.active.push(it); }
    else { it = this.active.shift(); this.active.push(it); } // recycle oldest
    if (!it) return;
    it.mat.color.setHex(color);
    it.mat.opacity = 0.95;
    it.m.position.copy(point);
    it.base = 0.12 * scale;
    it.m.scale.setScalar(it.base);
    it.m.visible = true;
    it.t = 0;
    it.life = 0.16;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i];
      it.t += dt;
      const p = it.t / it.life;
      it.m.quaternion.copy(this.camera.quaternion); // billboard
      it.m.scale.setScalar(it.base * (1 + p * 3.5));
      it.mat.opacity = Math.max(0, 0.95 * (1 - p * p));
      if (it.t >= it.life) {
        it.m.visible = false;
        this.active.splice(i, 1);
        this.pool.push(it);
      }
    }
  }

  reset() {
    for (const it of this.active) { it.m.visible = false; it.mat.opacity = 0; this.pool.push(it); }
    this.active.length = 0;
  }
}
