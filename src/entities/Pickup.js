import * as THREE from 'three';

// Floating health / ammo drops. Bullets pass through (userData.noHit), they bob +
// spin, despawn after a while, and are collected when the player walks over them.
const HEALTH_AMOUNT = 25;
const AMMO_AMOUNT = 8;     // shells added to reserve
const LIFETIME = 14;       // seconds before it fades out
const PICK_RADIUS = 1.4;

const GEO = {
  health: new THREE.BoxGeometry(0.34, 0.34, 0.34),
  ammo: new THREE.CylinderGeometry(0.13, 0.13, 0.34, 10),
};

export class Pickup {
  constructor(scene, type, pos) {
    this.scene = scene;
    this.type = type;       // 'health' | 'ammo'
    this.amount = type === 'health' ? HEALTH_AMOUNT : AMMO_AMOUNT;
    this.alive = true;
    this.t = 0;
    this.life = LIFETIME;
    const color = type === 'health' ? 0x39d98a : 0xffc24d;
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.2,
    });
    this._mat = mat;
    this.mesh = new THREE.Mesh(GEO[type] || GEO.health, mat);
    this.mesh.position.set(pos.x, 0.6, pos.z);
    this.mesh.userData.noHit = true;       // don't block bullets
    this.mesh.castShadow = false;
    // small glow so it pops in the dark warehouse
    this.light = new THREE.PointLight(color, 0.9, 4, 2);
    this.light.position.copy(this.mesh.position);
    scene.add(this.mesh);
    scene.add(this.light);
  }

  // returns 'collected' | 'expired' | null
  update(dt, playerPos) {
    if (!this.alive) return null;
    this.t += dt; this.life -= dt;
    const y = 0.55 + Math.sin(this.t * 3) * 0.12;
    this.mesh.position.y = y;
    this.mesh.rotation.y += dt * 2.2;
    this.light.position.y = y;
    // fade in the last 3s
    if (this.life < 3) this._mat.opacity = Math.max(0, this.life / 3);

    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    if (dx * dx + dz * dz <= PICK_RADIUS * PICK_RADIUS) { this.alive = false; return 'collected'; }
    if (this.life <= 0) { this.alive = false; return 'expired'; }
    return null;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.light);
    this._mat.dispose();
  }
}

export class PickupManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.onCollect = null;   // (type, amount) => void
  }

  // Roll a drop when a zombie dies. Brutes are more generous.
  maybeDrop(pos, variant) {
    const r = Math.random();
    const healthP = variant === 'brute' ? 0.30 : 0.12;
    const ammoP = variant === 'brute' ? 0.28 : 0.15;
    if (r < healthP) this.spawn('health', pos);
    else if (r < healthP + ammoP) this.spawn('ammo', pos);
  }

  spawn(type, pos) { this.items.push(new Pickup(this.scene, type, pos)); }

  update(dt, playerPos) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const res = this.items[i].update(dt, playerPos);
      if (res === 'collected' && this.onCollect) this.onCollect(this.items[i].type, this.items[i].amount);
      if (res) { this.items[i].dispose(); this.items.splice(i, 1); }
    }
  }

  reset() {
    for (const it of this.items) it.dispose();
    this.items = [];
  }
}
