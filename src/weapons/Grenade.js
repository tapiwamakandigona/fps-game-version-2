import * as THREE from 'three';

// Throwable frag grenade: arcs under gravity, bounces off the floor/walls, and
// after a short fuse explodes with radial falloff damage to nearby zombies.
const GRAV = -22;
const RADIUS = 5.5;
const FUSE = 1.35;
const GEO = new THREE.SphereGeometry(0.12, 12, 10);

export class GrenadeManager {
  constructor(scene, camera, getZombies, arenaHalf = 24) {
    this.scene = scene;
    this.camera = camera;
    this.getZombies = getZombies;
    this.half = arenaHalf - 1;
    this.grenades = [];
    this.maxCount = 3;
    this.count = this.maxCount;
    this.onExplode = null; // (worldPos) => void  (FX: shake/flash/audio)
    this.onChange = null;  // (count) => void
  }

  throw() {
    if (this.count <= 0) return false;
    this.count--;
    if (this.onChange) this.onChange(this.count);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().addScaledVector(dir, 0.6);
    const vel = dir.clone().multiplyScalar(15);
    vel.y += 3.2;
    const mat = new THREE.MeshStandardMaterial({ color: 0x33401f, roughness: 0.6, metalness: 0.4 });
    const mesh = new THREE.Mesh(GEO, mat);
    mesh.position.copy(pos);
    mesh.userData.noHit = true;
    this.scene.add(mesh);
    this.grenades.push({ mesh, mat, pos, vel, fuse: FUSE });
    return true;
  }

  update(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      gr.fuse -= dt;
      gr.vel.y += GRAV * dt;
      gr.pos.addScaledVector(gr.vel, dt);
      if (gr.pos.y <= 0.12) { gr.pos.y = 0.12; gr.vel.y *= -0.42; gr.vel.x *= 0.6; gr.vel.z *= 0.6; }
      if (gr.pos.x > this.half) { gr.pos.x = this.half; gr.vel.x *= -0.5; }
      if (gr.pos.x < -this.half) { gr.pos.x = -this.half; gr.vel.x *= -0.5; }
      if (gr.pos.z > this.half) { gr.pos.z = this.half; gr.vel.z *= -0.5; }
      if (gr.pos.z < -this.half) { gr.pos.z = -this.half; gr.vel.z *= -0.5; }
      gr.mesh.position.copy(gr.pos);
      // blink red, faster as the fuse runs out
      const on = gr.fuse < 0.6 && Math.sin(gr.fuse * 40) > 0;
      gr.mat.emissive.setRGB(on ? 0.8 : 0, 0, 0);
      if (gr.fuse <= 0) { this._explode(gr); this._remove(i); }
    }
  }

  _explode(gr) {
    const p = gr.pos;
    for (const z of this.getZombies()) {
      if (!z.alive) continue;
      const d = z.group.position.distanceTo(p);
      if (d <= RADIUS) {
        const f = 1 - d / RADIUS;
        const dmg = Math.max(40, Math.round(170 * f * f + 30));
        z.takeDamage(dmg, false);
      }
    }
    if (this.onExplode) this.onExplode(p.clone());
  }

  _remove(i) {
    const gr = this.grenades[i];
    this.scene.remove(gr.mesh);
    gr.mat.dispose();
    this.grenades.splice(i, 1);
  }

  refill() { this.count = this.maxCount; if (this.onChange) this.onChange(this.count); }

  reset() {
    for (let i = this.grenades.length - 1; i >= 0; i--) this._remove(i);
    this.count = this.maxCount;
    if (this.onChange) this.onChange(this.count);
  }
}
