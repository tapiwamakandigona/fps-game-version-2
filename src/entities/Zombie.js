import * as THREE from 'three';

// shared geometries (cheap)
const G = {
  torso: new THREE.BoxGeometry(0.6, 0.85, 0.34),
  head: new THREE.SphereGeometry(0.24, 12, 10),
  limb: new THREE.BoxGeometry(0.16, 0.62, 0.16),
};

export class Zombie {
  constructor(scene, player, colliders, opts = {}) {
    this.scene = scene;
    this.player = player;
    this.colliders = colliders;
    this.maxHealth = opts.health ?? 100;
    this.health = this.maxHealth;
    this.speed = opts.speed ?? 1.8;
    this.damage = opts.damage ?? 12;
    this.radius = 0.42;
    this.alive = true;
    this.dead = false;          // fully finished (ready to remove)
    this.attackCd = 0;
    this.flash = 0;
    this.deathT = 0;
    this.onDeath = null;        // (zombie) => void
    this._dir = new THREE.Vector3();
    this._build();
  }

  _build() {
    const skin = new THREE.MeshStandardMaterial({ color: 0x5a7a4a, roughness: 0.85, metalness: 0.0 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.95, metalness: 0.0 });
    this._mats = [skin, cloth];

    const g = new THREE.Group();
    const torso = new THREE.Mesh(G.torso, cloth); torso.position.y = 1.05; torso.castShadow = true;
    const head = new THREE.Mesh(G.head, skin); head.position.y = 1.62; head.castShadow = true;
    head.userData.part = 'head';
    this.armL = new THREE.Mesh(G.limb, cloth); this.armL.position.set(-0.4, 1.2, 0.18);
    this.armR = new THREE.Mesh(G.limb, cloth); this.armR.position.set(0.4, 1.2, 0.18);
    this.legL = new THREE.Mesh(G.limb, cloth); this.legL.position.set(-0.16, 0.4, 0);
    this.legR = new THREE.Mesh(G.limb, cloth); this.legR.position.set(0.16, 0.4, 0);
    this.armL.rotation.x = this.armR.rotation.x = -1.3; // arms outstretched
    for (const m of [torso, head, this.armL, this.armR, this.legL, this.legR]) { m.castShadow = true; g.add(m); }

    // tag the whole group + parts so raycasts can resolve to this instance
    g.userData.zombie = this;
    g.traverse((o) => { o.userData.zombie = this; });
    head.userData.part = 'head';

    this.group = g;
    this.scene.add(g);
  }

  spawn(pos) { this.group.position.set(pos.x, 0, pos.z); }

  takeDamage(n, headshot) {
    if (!this.alive) return;
    this.health -= n;
    this.flash = 1;
    if (this.health <= 0) this._die();
  }

  _die() {
    this.alive = false;
    this.deathT = 0;
    if (this.onDeath) this.onDeath(this, false);
  }

  update(dt, t) {
    if (this.dead) return;

    if (!this.alive) {
      // topple + sink, then flag for removal
      this.deathT += dt;
      this.group.rotation.x = Math.min(Math.PI / 2, this.deathT * 4);
      this.group.position.y = -Math.max(0, this.deathT - 0.3) * 1.2;
      if (this.deathT > 1.2) this.dead = true;
      return;
    }

    // seek the player on XZ
    const p = this.player.camera.position;
    const g = this.group.position;
    this._dir.set(p.x - g.x, 0, p.z - g.z);
    const dist = this._dir.length();
    this._dir.normalize();
    this.group.rotation.y = Math.atan2(this._dir.x, this._dir.z);

    const attackRange = 1.5;
    if (dist > attackRange) {
      g.x += this._dir.x * this.speed * dt;
      g.z += this._dir.z * this.speed * dt;
      this._resolve(g);
    } else if (this.player.alive) {
      this.attackCd -= dt;
      if (this.attackCd <= 0) { this.attackCd = 1.0; this.player.takeDamage(this.damage); this.lunge = 0.4; }
    }

    // walk animation
    const swing = Math.sin(t * 7 + g.x) * 0.5;
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -1.3 + Math.sin(t * 7) * 0.15;
    this.armR.rotation.x = -1.3 - Math.sin(t * 7) * 0.15;

    // hit flash (emissive red pulse on shared mats — brief, looks fine)
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
      for (const m of this._mats) { m.emissive.setRGB(this.flash, 0, 0); }
    }
  }

  _resolve(pos) {
    const r = this.radius;
    for (const b of this.colliders) {
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || d2 < 1e-7) continue;
      const d = Math.sqrt(d2), push = r - d;
      pos.x += (dx / d) * push; pos.z += (dz / d) * push;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this._mats) m.dispose();
  }
}
