import * as THREE from 'three';

// Throwable frag grenade: arcs under gravity, bounces off the floor/walls, and
// after a short fuse explodes with radial falloff damage to nearby zombies.
const GRAV = -22;
const RADIUS = 5.5;
const FUSE = 1.35;
const GEO = new THREE.SphereGeometry(0.12, 12, 10);
// Flashbang: longer blind radius, no damage, applies a stun to caught enemies.
const FLASH_RADIUS = 9.5;
const FLASH_FUSE = 1.15;
const FLASH_STUN = 3.2;        // seconds enemies stay dazed
const FLASH_GEO = new THREE.CylinderGeometry(0.1, 0.1, 0.26, 10);

export class GrenadeManager {
  constructor(scene, camera, getZombies, arenaHalf = 24) {
    this.scene = scene;
    this.camera = camera;
    this.getZombies = getZombies;
    this.half = arenaHalf - 1;
    this.grenades = [];
    this.maxCount = 3;
    this.count = this.maxCount;
    this.maxTactical = 2;
    this.tactical = this.maxTactical;
    this.onExplode = null; // (worldPos) => void  (FX: shake/flash/audio)
    this.onChange = null;  // (count) => void
    this.onTacticalChange = null; // (count) => void
    this.onFlash = null;   // (worldPos, blindStrength 0..1) => void  — screen flash + audio
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
    this.grenades.push({ mesh, mat, pos, vel, fuse: FUSE, kind: 'frag' });
    return true;
  }

  // Tactical flashbang: arcs like a frag but detonates with a blinding flash that
  // stuns nearby enemies (no damage) and whites out the player's view if close/facing.
  throwTactical() {
    if (this.tactical <= 0) return false;
    this.tactical--;
    if (this.onTacticalChange) this.onTacticalChange(this.tactical);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const pos = this.camera.position.clone().addScaledVector(dir, 0.6);
    const vel = dir.clone().multiplyScalar(16);
    vel.y += 3.4;
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.85,
      emissive: 0x223044, emissiveIntensity: 0.4 });
    const mesh = new THREE.Mesh(FLASH_GEO, mat);
    mesh.position.copy(pos);
    mesh.userData.noHit = true;
    this.scene.add(mesh);
    this.grenades.push({ mesh, mat, pos, vel, fuse: FLASH_FUSE, kind: 'flash' });
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
      if (gr.kind === 'flash') gr.mesh.rotation.x += dt * 9;
      // blink as the fuse runs out — red for frag, blue-white for flashbang
      const on = gr.fuse < 0.6 && Math.sin(gr.fuse * 40) > 0;
      if (gr.kind === 'flash') gr.mat.emissive.setRGB(on ? 0.6 : 0.1, on ? 0.8 : 0.15, on ? 1.0 : 0.25);
      else gr.mat.emissive.setRGB(on ? 0.8 : 0, 0, 0);
      if (gr.fuse <= 0) {
        if (gr.kind === 'flash') this._detonateFlash(gr); else this._explode(gr);
        this._remove(i);
      }
    }
  }

  _detonateFlash(gr) {
    const p = gr.pos;
    for (const z of this.getZombies()) {
      if (!z.alive) continue;
      const d = z.group.position.distanceTo(p);
      if (d <= FLASH_RADIUS) z.stun = Math.max(z.stun || 0, FLASH_STUN * (1 - 0.5 * (d / FLASH_RADIUS)));
    }
    if (this.onFlash) {
      // Blind the player based on proximity and whether they're roughly facing the pop.
      const cam = this.camera;
      const toFlash = p.clone().sub(cam.position);
      const dist = toFlash.length();
      let blind = 0;
      if (dist <= FLASH_RADIUS * 1.4) {
        const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
        const facing = Math.max(0, toFlash.normalize().dot(dir)); // 0 behind, 1 dead-on
        blind = Math.min(1, (1 - dist / (FLASH_RADIUS * 1.4)) * (0.35 + 0.65 * facing));
      }
      this.onFlash(p.clone(), blind);
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

  refill() {
    this.count = this.maxCount;
    if (this.onChange) this.onChange(this.count);
    this.tactical = this.maxTactical;
    if (this.onTacticalChange) this.onTacticalChange(this.tactical);
  }

  reset() {
    for (let i = this.grenades.length - 1; i >= 0; i--) this._remove(i);
    this.maxCount = 3;   // clear DEMOLITION upgrades on a fresh run
    this.count = this.maxCount;
    this.maxTactical = 2;
    this.tactical = this.maxTactical;
    if (this.onChange) this.onChange(this.count);
    if (this.onTacticalChange) this.onTacticalChange(this.tactical);
  }
}
