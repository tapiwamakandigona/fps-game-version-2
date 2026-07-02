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
    this.paP = false;      // Pack-a-Punch'd?
    this.cooldown = 0; this.reloadT = 0; this.reloading = false;
    this.recoil = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 140;
    this._dir = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tracerStart = new THREE.Vector3();
    this.tracerPool = null;   // shared TracerPool (set by WeaponManager)
    this._ads = false;        // aiming down sights (set each frame by manager/Game)
    this._sprint = false;     // lowered-gun sprint pose (set each frame by Game)
    this._sprintBlend = 0;    // eased 0..1 sprint blend
    this._equipT = 0;         // equip raise-up timer (counts down)
    this._equipDur = 0.34;    // equip animation length (s)
    this.onRecoil = null;     // (recoilCfg, ads) => void  — view kick, handled by Game
    this.onAmmoChange = null;
    this.onHit = null; // (zombie, headshot, point)
    // Curated raycast target provider: returns the small list of bullet-blocking
    // meshes + live enemy groups instead of the whole scene graph. Set by Game.
    this.getTargets = null;
    // Aim-assist (touch): live-zombie provider + per-frame enable flag, both
    // driven by WeaponManager/Game. When on, shots inside a small cone are
    // magnetised toward the nearest enemy's torso.
    this.getZombies = null;
    this.aimAssist = false;
    this._aaTo = new THREE.Vector3();
    this._aaBest = new THREE.Vector3();
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

  // Called when this weapon becomes the active one — plays a quick raise-up.
  onEquip() { this._equipT = this._equipDur; this._sprintBlend = 0; }

  tryFire() {
    if (this.reloading || this.cooldown > 0) return;
    if (this.mag <= 0) { this.audio.empty(); return; }
    this.mag--;
    this.cooldown = this.cfg.fireInterval;
    this.recoil = 1;
    this.audio.shoot(this.cfg.type);
    this._muzzle();
    if (this.onShoot) this.onShoot(this.cfg.type);
    const pellets = this.cfg.pellets || 1;
    const acc = new Map();  // aggregate per-zombie damage so a shotgun blast = one number/sound
    // Resolve the curated target list once per trigger pull (shared by all pellets).
    this._targets = this.getTargets ? this.getTargets() : null;
    // Effective spread: hip-fire bloom vs tight ADS. Falls back to legacy spreadDeg.
    const spread = this._ads
      ? (this.cfg.adsSpread ?? 0)
      : (this.cfg.hipSpread ?? this.cfg.spreadDeg ?? 0);
    for (let i = 0; i < pellets; i++) this._fireOne(spread, acc);
    if (this.onRecoil && this.cfg.recoil) this.onRecoil(this.cfg.recoil, this._ads);
    for (const [zomb, e] of acc) {
      this.audio.hit(e.headshot);
      if (this.onHit) this.onHit(zomb, e.headshot, e.point, e.dmg);
    }
    this._emitAmmo();
    if (this.mag === 0) this.reload();
  }

  // Pack-a-Punch: permanently upgrade this weapon once. +60% damage, +50% mag &
  // reserve, full top-up, and a gold viewmodel glow. Returns false if already done.
  packAPunch() {
    if (this.paP) return false;
    this.paP = true;
    this.damageMult *= 1.6;
    this.magSize = Math.round(this.magSize * 1.5);
    this.mag = this.magSize;
    if (isFinite(this.reserve)) {
      this.maxReserve = Math.round(this.maxReserve * 1.5);
      this.reserve = this.maxReserve;
    }
    this.name = this.name + ' \u2728';
    const gold = new THREE.Color(0xffd700);
    this.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.material = o.material.clone();
        o.material.emissive.setHex(0xffaa00);
        o.material.emissiveIntensity = 0.45;
        if (o.material.color) o.material.color.lerp(gold, 0.35);
      }
    });
    this._emitAmmo();
    return true;
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

  _fireOne(spreadDeg, acc) {
    this.camera.getWorldDirection(this._dir);
    if (this.aimAssist) this._applyAimAssist(this._dir);
    if (spreadDeg > 0) {
      const s = spreadDeg * Math.PI / 180;
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
        let dmg = (headshot ? this.cfg.damage * this.cfg.headshotMult : this.cfg.damage) * this.damageMult;
        dmg *= this._falloff(h.distance);
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

  // Touch aim assist: find the closest-to-crosshair live zombie inside a ~4°
  // cone (within 60 m) and pull the shot direction most of the way toward its
  // torso. Walls still block the ray, so no shooting through cover.
  _applyAimAssist(dir) {
    const zs = this.getZombies ? this.getZombies() : null;
    if (!zs || !zs.length) return;
    const CONE = Math.cos(4.0 * Math.PI / 180);
    const camPos = this.camera.position;
    let bestDot = CONE, found = false;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (!z.alive) continue;
      this._aaTo.copy(z.group.position);
      this._aaTo.y += 1.15;                    // torso height
      this._aaTo.sub(camPos);
      const d = this._aaTo.length();
      if (d < 1.5 || d > 60) continue;
      this._aaTo.multiplyScalar(1 / d);
      const dot = this._aaTo.dot(dir);
      if (dot > bestDot) { bestDot = dot; this._aaBest.copy(this._aaTo); found = true; }
    }
    if (found) dir.lerp(this._aaBest, 0.85).normalize();
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
    this._reloadTotal = this.reloadT;
    this.audio.reload();
  }

  _muzzle() {
    this.flash.material.opacity = 0.95;
    this.flash.rotation.z = Math.random() * Math.PI;
    const fs = { shotgun: 1.4, rifle: 1.25, smg: 0.8, pistol: 1 }[this.cfg.type] || 1;
    this.flash.scale.setScalar(fs);
    this.muzzleLight.intensity = { shotgun: 7, rifle: 6.5, smg: 4, pistol: 5 }[this.cfg.type] || 5;
  }

  // Distance-based damage falloff (COD-style): full damage up to `start`, lerps
  // down to `minMul` at `end`, then holds. No falloff config = flat damage.
  _falloff(dist) {
    const f = this.cfg.falloff;
    if (!f) return 1;
    if (dist <= f.start) return 1;
    if (dist >= f.end) return f.minMul;
    const k = (dist - f.start) / (f.end - f.start);
    return 1 + (f.minMul - 1) * k;
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

    // --- Reload animation: a two-beat mag-swap gesture (dip + roll out, then seat
    // the mag and rack back up). Driven off reload progress; uses rotation + Z only
    // so it never fights the ADS viewmodel centering (which owns position x/y). ---
    let reZ = 0, reRoll = 0, reYaw = 0, rePitch = 0;
    if (this.reloading && this._reloadTotal) {
      const p = Math.min(1, Math.max(0, 1 - this.reloadT / this._reloadTotal)); // 0..1
      const env = Math.sin(p * Math.PI);          // smooth rise then fall (peak mid-reload)
      const seat = Math.max(0, Math.sin((p - 0.55) * Math.PI * 2)) * (p > 0.55 ? 1 : 0); // little rack at the end
      reZ = 0.06 * env;                            // pull the gun back toward the player
      reRoll = 0.7 * env;                          // roll to expose the magazine well
      reYaw = 0.32 * env;                          // tilt inward
      rePitch = 0.45 * env - 0.12 * seat;          // dip the muzzle, then snap up to chamber
    } else {
      // Subtle idle/breathing sway — purely cosmetic (viewmodel only; aim is from the
      // camera centre). Damped while aiming so ADS stays steady.
      this._swayT = (this._swayT || 0) + dt;
      const a = this._ads ? 0.25 : 1;
      reYaw = Math.cos(this._swayT * 1.1) * 0.018 * a;
      reRoll = Math.sin(this._swayT * 1.3) * 0.014 * a;
      rePitch = Math.sin(this._swayT * 2.1) * 0.010 * a;
    }

    // --- Sprint pose: lower & cant the weapon while sprinting (suppressed when
    // reloading/ADS). Eased so it blends in/out smoothly instead of snapping. ---
    const sprintWanted = this._sprint && !this.reloading ? 1 : 0;
    this._sprintBlend += (sprintWanted - this._sprintBlend) * Math.min(1, dt * 10);
    if (this._sprintBlend > 0.001) {
      const sb = this._sprintBlend;
      const idle = 1 - sb;                 // fade idle sway out as the gun lowers
      reYaw = reYaw * idle + 0.26 * sb;    // tilt inward
      reRoll = reRoll * idle + 0.55 * sb;  // cant the weapon
      rePitch = rePitch * idle + 0.42 * sb; // drop the muzzle
      reZ += 0.05 * sb;                    // pull toward the player
    }

    // --- Equip raise-up: when freshly drawn, the gun rises from below to neutral. ---
    if (this._equipT > 0) {
      this._equipT = Math.max(0, this._equipT - dt);
      const e = 1 - this._equipT / this._equipDur;   // 0 -> 1
      const lift = (1 - e) * (1 - e);                // ease-out (strong at start)
      rePitch += 0.7 * lift;                          // start muzzle-down, settle level
      reZ += 0.12 * lift;                             // start pulled back, settle forward
      reRoll += 0.25 * lift;
    }

    const recPitch = this.recoil * (this.cfg.type === 'shotgun' ? 0.26 : 0.18);
    this.group.position.z = this._baseZ + this.recoil * (this.cfg.type === 'shotgun' ? 0.1 : 0.06) + reZ;
    this.group.rotation.x = recPitch + rePitch;
    this.group.rotation.y = reYaw;
    this.group.rotation.z = reRoll;
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
