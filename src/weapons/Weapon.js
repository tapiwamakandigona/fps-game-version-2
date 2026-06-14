import * as THREE from 'three';

// Generic hitscan weapon. Config drives pistol vs shotgun behaviour. Each pellet
// raycasts the scene and stops at the first solid surface (no shoot-through-cover),
// and spawns a fading tracer for visual feedback.
export class Weapon {
  constructor(camera, scene, audio, cfg) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;
    this.cfg = cfg; // {name, type, pellets, spreadDeg, damage, headshotMult, mag, fireInterval, reloadTime, auto}
    this.name = cfg.name;
    this.magSize = cfg.mag;
    this.mag = cfg.mag;
    this.reserve = cfg.reserve ?? Infinity;   // pistol = ∞ (always-usable fallback)
    this.maxReserve = cfg.maxReserve ?? this.reserve;
    this.damageMult = 1;   // raised by the FIREPOWER upgrade
    this.reloadMult = 1;   // lowered by the FAST HANDS upgrade
    this.cooldown = 0; this.reloadT = 0; this.reloading = false;
    this.recoil = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 140;
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tracerStart = new THREE.Vector3();
    this.tracerPool = null;   // shared TracerPool (set by WeaponManager)
    this.onAmmoChange = null;
    this.onHit = null; // (zombie, headshot, point)
    // Curated raycast target provider: returns the small list of bullet-blocking
    // meshes + live enemy groups instead of the whole scene graph. Set by Game.
    this.getTargets = null;
    this._buildModel();
  }

  _buildModel() {
    this.group = new THREE.Group();
    this.group.userData.noHit = true;
    if (this.cfg.type === 'shotgun') this._buildShotgun();
    else if (this.cfg.type === 'smg') this._buildSMG();
    else if (this.cfg.type === 'rifle') this._buildRifle();
    else this._buildPistol();

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0, depthWrite: false })
    );
    this.flash.position.copy(this._muzzlePos);
    this.flash.userData.noHit = true;
    this.group.add(this.flash);

    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 7, 2);
    this.muzzleLight.position.copy(this._muzzlePos);
    this.group.add(this.muzzleLight);

    this.group.position.set(0.22, -0.22, -0.5);
    this.camera.add(this.group);
    this._baseZ = this.group.position.z;
  }

  _buildPistol() {
    const body = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.8 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8, metalness: 0.2 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), body); slide.position.set(0, 0, -0.18);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.18), body); barrel.position.set(0, 0.005, -0.5);
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.14), grip); g.position.set(0, -0.18, 0.02); g.rotation.x = 0.28;
    this.group.add(slide, barrel, g);
    this._muzzlePos = new THREE.Vector3(0, 0.005, -0.62);
  }

  _buildShotgun() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.4, metalness: 0.85 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1c, roughness: 0.7, metalness: 0.05 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.9), metal); barrel.position.set(0, 0.02, -0.32);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.26), wood); pump.position.set(0, -0.08, -0.34);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.32), wood); stock.position.set(0, -0.06, 0.18); stock.rotation.x = 0.18;
    this.group.add(barrel, pump, stock);
    this._muzzlePos = new THREE.Vector3(0, 0.02, -0.78);
  }

  _buildSMG() {
    const body = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x2e3238, roughness: 0.4, metalness: 0.85 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.46), body); receiver.position.set(0, 0, -0.12);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), accent); barrel.position.set(0, 0.02, -0.46);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.1), body); mag.position.set(0, -0.2, -0.04); mag.rotation.x = -0.12;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.11), body); grip.position.set(0, -0.16, 0.12); grip.rotation.x = 0.3;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.22), accent); stock.position.set(0, -0.02, 0.26);
    this.group.add(receiver, barrel, mag, grip, stock);
    this._muzzlePos = new THREE.Vector3(0, 0.02, -0.6);
  }

  _buildRifle() {
    const body = new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.55, metalness: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x32352b, roughness: 0.35, metalness: 0.85 });
    const scopeMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0a, roughness: 0.3, metalness: 0.9 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.62), body); receiver.position.set(0, 0, -0.16);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), metal); barrel.position.set(0, 0.01, -0.62);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10), scopeMat); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.11, -0.18);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.12), body); mag.position.set(0, -0.16, 0.0);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.3), body); stock.position.set(0, -0.04, 0.26); stock.rotation.x = 0.12;
    this.group.add(receiver, barrel, scope, mag, stock);
    this._muzzlePos = new THREE.Vector3(0, 0.01, -0.86);
  }

  setVisible(v) { this.group.visible = v; }

  tryFire() {
    if (this.reloading || this.cooldown > 0) return;
    if (this.mag <= 0) { this.audio.empty(); return; }
    this.mag--;
    this.cooldown = this.cfg.fireInterval;
    this.recoil = 1;
    this.audio.shoot();
    this._muzzle();
    if (this.onShoot) this.onShoot(this.cfg.type);
    const pellets = this.cfg.pellets || 1;
    const acc = new Map();  // aggregate per-zombie damage so a shotgun blast = one number/sound
    // Resolve the curated target list once per trigger pull (shared by all pellets).
    this._targets = this.getTargets ? this.getTargets() : null;
    for (let i = 0; i < pellets; i++) this._fireOne(pellets > 1, acc);
    for (const [zomb, e] of acc) {
      this.audio.hit(e.headshot);
      if (this.onHit) this.onHit(zomb, e.headshot, e.point, e.dmg);
    }
    this._emitAmmo();
    if (this.mag === 0) this.reload();
  }

  _emitAmmo() { if (this.onAmmoChange) this.onAmmoChange(this.mag, this.magSize, this.reserve); }

  // Add reserve rounds (from an ammo pickup). No-op for infinite-reserve weapons.
  addReserve(n) {
    if (!isFinite(this.reserve)) return false;
    if (this.reserve >= this.maxReserve) return false;
    this.reserve = Math.min(this.maxReserve, this.reserve + n);
    this._emitAmmo();
    return true;
  }

  _fireOne(spread, acc) {
    this.camera.getWorldDirection(this._dir);
    if (spread) {
      const s = (this.cfg.spreadDeg || 0) * Math.PI / 180;
      this._dir.x += (Math.random() - 0.5) * s;
      this._dir.y += (Math.random() - 0.5) * s;
      this._dir.z += (Math.random() - 0.5) * s;
      this._dir.normalize();
    }
    this.raycaster.set(this.camera.position, this._dir);
    // Raycast only the curated target list (world solids + live enemies) when
    // available — far cheaper than recursing the entire scene every pellet.
    const hits = this._targets
      ? this.raycaster.intersectObjects(this._targets, true)
      : this.raycaster.intersectObjects(this.scene.children, true);
    let endPoint = this._tmp.copy(this.camera.position).addScaledVector(this._dir, this.raycaster.far);
    for (const h of hits) {
      if (this._ignored(h.object)) continue;
      endPoint = h.point.clone();
      const zomb = this._findZombie(h.object);
      let headshot = false;
      const hitZomb = zomb && zomb.alive;
      if (hitZomb) {
        headshot = h.object.userData.part === 'head';
        const dmg = (headshot ? this.cfg.damage * this.cfg.headshotMult : this.cfg.damage) * this.damageMult;
        zomb.takeDamage(dmg, headshot);
        if (acc) {
          let e = acc.get(zomb);
          if (!e) { e = { dmg: 0, headshot: false, point: h.point.clone() }; acc.set(zomb, e); }
          e.dmg += dmg; e.headshot = e.headshot || headshot; e.point.copy(h.point);
        }
      }
      if (this.onImpact) this.onImpact(h.point.clone(), !!hitZomb, headshot);
      break; // first solid surface stops the pellet
    }
    this._spawnTracer(endPoint);
  }

  _spawnTracer(endWorld) {
    // muzzle world position
    this.group.updateWorldMatrix(true, false);
    const start = this._tracerStart.copy(this._muzzlePos).applyMatrix4(this.group.matrixWorld);
    if (this.tracerPool) this.tracerPool.spawn(start, endWorld);
  }

  reload() {
    if (this.reloading || this.mag === this.magSize || this.reserve <= 0) return;
    this.reloading = true; this.reloadT = this.cfg.reloadTime * this.reloadMult;
    this.audio.reload();
  }

  _muzzle() {
    this.flash.material.opacity = 0.95;
    this.flash.rotation.z = Math.random() * Math.PI;
    const fs = { shotgun: 1.4, rifle: 1.25, smg: 0.8, pistol: 1 }[this.cfg.type] || 1;
    this.flash.scale.setScalar(fs);
    this.muzzleLight.intensity = { shotgun: 7, rifle: 6.5, smg: 4, pistol: 5 }[this.cfg.type] || 5;
  }

  _ignored(obj) { let o = obj; while (o) { if (o.userData && o.userData.noHit) return true; o = o.parent; } return false; }
  _findZombie(obj) { let o = obj; while (o) { if (o.userData && o.userData.zombie) return o.userData.zombie; o = o.parent; } return null; }

  update(dt, holdingTrigger) {
    if (this.cooldown > 0) this.cooldown -= dt;
    // Auto weapons keep firing while the trigger is held; semi-auto weapons fire
    // once per click (handled by the discrete tryFire() call on mouse-down).
    if (this.cfg.auto && holdingTrigger) this.tryFire();

    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false;
        const need = this.magSize - this.mag;
        const take = isFinite(this.reserve) ? Math.min(need, this.reserve) : need;
        this.mag += take;
        if (isFinite(this.reserve)) this.reserve -= take;
        this._emitAmmo();
      }
    }

    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.group.position.z = this._baseZ + this.recoil * (this.cfg.type === 'shotgun' ? 0.1 : 0.06);
    this.group.rotation.x = this.recoil * (this.cfg.type === 'shotgun' ? 0.26 : 0.18);
    if (this.flash.material.opacity > 0) this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 9);
    if (this.muzzleLight.intensity > 0) this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 40);
    // Tracers are now updated centrally by the shared TracerPool (WeaponManager).
  }

  reset() {
    this.mag = this.magSize; this.reserve = this.cfg.reserve ?? Infinity;
    this.maxReserve = this.cfg.maxReserve ?? this.reserve;
    this.damageMult = 1; this.reloadMult = 1;
    this.reloading = false; this.cooldown = 0; this.recoil = 0;
  }
}
