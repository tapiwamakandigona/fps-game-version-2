import * as THREE from 'three';

// Cheap impact sparks: a single additive billboard quad per hit that pops in
// scale and fades fast. No extra lights (keeps the cost negligible even for a
// shotgun blast). Colour conveys the surface: blood vs. spark.
const GEO = new THREE.PlaneGeometry(1, 1);

export class Impacts {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.items = [];
  }

  spawn(point, color = 0xffd27f, scale = 1) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(GEO, mat);
    m.position.copy(point);
    m.userData.noHit = true;
    const base = 0.12 * scale;
    m.scale.setScalar(base);
    m.frustumCulled = false;
    this.scene.add(m);
    this.items.push({ m, t: 0, life: 0.16, base });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const p = it.t / it.life;
      it.m.quaternion.copy(this.camera.quaternion); // billboard
      it.m.scale.setScalar(it.base * (1 + p * 3.5));
      it.m.material.opacity = Math.max(0, 0.95 * (1 - p * p));
      if (it.t >= it.life) {
        this.scene.remove(it.m);
        it.m.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  reset() {
    for (const it of this.items) { this.scene.remove(it.m); it.m.material.dispose(); }
    this.items = [];
  }
}
