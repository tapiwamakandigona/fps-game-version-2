import * as THREE from 'three';

// Brass shell-casing ejection — a small pooled juice effect. On each shot a casing
// flips out of the ejection port (camera-right + up), tumbles under gravity, bounces
// once off the floor, then fades out. Fully pre-allocated: sustained auto fire never
// allocates. Purely cosmetic — casings carry userData.noHit so they're never targets.
const GEO = new THREE.BoxGeometry(0.025, 0.025, 0.06);
const MAT = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.85, roughness: 0.35, emissive: 0x2a1c00 });
const FLOOR_Y = 0.06;
const GRAV = 9.2;

export class ShellEjector {
  constructor(scene, camera, size = 18) {
    this.camera = camera;
    this.pool = [];
    this.active = [];
    this._right = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < size; i++) {
      const m = new THREE.Mesh(GEO, MAT.clone());
      m.castShadow = false; m.userData.noHit = true; m.frustumCulled = false; m.visible = false;
      scene.add(m);
      this.pool.push({ m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, life: 1.3, bounced: false });
    }
  }

  eject() {
    let it;
    if (this.pool.length) { it = this.pool.pop(); this.active.push(it); }
    else { it = this.active.shift(); this.active.push(it); }
    if (!it) return;
    const cam = this.camera;
    cam.getWorldDirection(this._fwd);
    this._right.crossVectors(this._fwd, this._up).normalize();
    // Spawn just to the right of the muzzle line, roughly at the ejection port.
    it.m.position.copy(cam.position)
      .addScaledVector(this._right, 0.22)
      .addScaledVector(this._up, -0.12)
      .addScaledVector(this._fwd, -0.35);
    // Flick out-and-up with a little randomness.
    const r = () => (Math.random() - 0.5);
    it.vel.copy(this._right).multiplyScalar(1.7 + Math.random() * 0.6)
      .addScaledVector(this._up, 1.9 + Math.random() * 0.5)
      .addScaledVector(this._fwd, -0.3 + r() * 0.4);
    it.spin.set(r() * 22, r() * 22, r() * 22);
    it.m.material.opacity = 1; it.m.material.transparent = false;
    it.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    it.m.visible = true; it.t = 0; it.life = 1.3; it.bounced = false;
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const it = this.active[i];
      it.t += dt;
      it.vel.y -= GRAV * dt;
      it.m.position.addScaledVector(it.vel, dt);
      it.m.rotation.x += it.spin.x * dt;
      it.m.rotation.y += it.spin.y * dt;
      it.m.rotation.z += it.spin.z * dt;
      // One damped bounce off the floor.
      if (it.m.position.y <= FLOOR_Y && it.vel.y < 0) {
        it.m.position.y = FLOOR_Y;
        if (!it.bounced) { it.vel.y = -it.vel.y * 0.35; it.vel.x *= 0.55; it.vel.z *= 0.55; it.spin.multiplyScalar(0.5); it.bounced = true; }
        else { it.vel.set(0, 0, 0); it.spin.set(0, 0, 0); }
      }
      // Fade out over the last third of life.
      if (it.t > it.life * 0.66) {
        it.m.material.transparent = true;
        it.m.material.opacity = Math.max(0, 1 - (it.t - it.life * 0.66) / (it.life * 0.34));
      }
      if (it.t >= it.life) {
        it.m.visible = false;
        this.active.splice(i, 1);
        this.pool.push(it);
      }
    }
  }
}
