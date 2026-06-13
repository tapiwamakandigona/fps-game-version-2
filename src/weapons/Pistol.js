import * as THREE from 'three';

const FIRE_INTERVAL = 0.16;
const RELOAD_TIME = 1.1;
const MAG = 12;
const DAMAGE = 34;
const HEADSHOT_MULT = 2.0;

export class Pistol {
  constructor(camera, scene, audio) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;
    this.mag = MAG; this.magSize = MAG;
    this.cooldown = 0; this.reloadT = 0; this.reloading = false;
    this.recoil = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;
    this._dir = new THREE.Vector3();
    this.onAmmoChange = null;
    this.onHit = null;       // (zombie, headshot, point) => void
    this._buildModel();
  }

  _buildModel() {
    this.group = new THREE.Group();
    this.group.userData.noHit = true;
    const matBody = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.8 });
    const matGrip = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8, metalness: 0.2 });

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), matBody);
    slide.position.set(0, 0, -0.18);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.18), matBody);
    barrel.position.set(0, 0.005, -0.5);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.14), matGrip);
    grip.position.set(0, -0.18, 0.02); grip.rotation.x = 0.28;
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 12), matGrip);
    guard.position.set(0, -0.08, -0.05); guard.rotation.x = Math.PI / 2;
    this.group.add(slide, barrel, grip, guard);

    // muzzle flash (hidden until fired)
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffd27f, transparent: true, opacity: 0, depthWrite: false })
    );
    this.flash.position.set(0, 0.005, -0.62);
    this.flash.userData.noHit = true;
    this.group.add(this.flash);

    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 6, 2);
    this.muzzleLight.position.set(0, 0.02, -0.6);
    this.group.add(this.muzzleLight);

    // position the viewmodel in front of the camera
    this.group.position.set(0.22, -0.22, -0.5);
    this.camera.add(this.group);
    this._baseZ = this.group.position.z;
  }

  tryFire() {
    if (this.reloading || this.cooldown > 0) return;
    if (this.mag <= 0) { this.audio.empty(); return; }
    this.mag--;
    this.cooldown = FIRE_INTERVAL;
    this.recoil = 1;
    this.audio.shoot();
    this._muzzle();
    this._hitscan();
    if (this.onAmmoChange) this.onAmmoChange(this.mag, this.magSize);
    if (this.mag === 0) this.reload();
  }

  reload() {
    if (this.reloading || this.mag === this.magSize) return;
    this.reloading = true; this.reloadT = RELOAD_TIME;
    this.audio.reload();
  }

  _muzzle() {
    this.flash.material.opacity = 0.9;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.muzzleLight.intensity = 5;
  }

  _hitscan() {
    this.camera.getWorldDirection(this._dir);
    this.raycaster.set(this.camera.position, this._dir);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      if (this._ignored(h.object)) continue;
      const zomb = this._findZombie(h.object);
      if (zomb && zomb.alive) {
        const headshot = h.object.userData.part === 'head';
        zomb.takeDamage(headshot ? DAMAGE * HEADSHOT_MULT : DAMAGE, headshot);
        this.audio.hit(headshot);
        if (this.onHit) this.onHit(zomb, headshot, h.point);
      }
      return; // first solid surface stops the bullet (no shoot-through-walls)
    }
  }

  _ignored(obj) {
    let o = obj;
    while (o) { if (o.userData && o.userData.noHit) return true; o = o.parent; }
    return false;
  }

  _findZombie(obj) {
    let o = obj;
    while (o) { if (o.userData && o.userData.zombie) return o.userData.zombie; o = o.parent; }
    return null;
  }

  update(dt, holdingTrigger) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (holdingTrigger) this.tryFire();

    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloading = false; this.mag = this.magSize;
        if (this.onAmmoChange) this.onAmmoChange(this.mag, this.magSize);
      }
    }

    // recoil + flash decay
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.group.position.z = this._baseZ + this.recoil * 0.06;
    this.group.rotation.x = this.recoil * 0.18;
    if (this.flash.material.opacity > 0) this.flash.material.opacity = Math.max(0, this.flash.material.opacity - dt * 9);
    if (this.muzzleLight.intensity > 0) this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 40);
  }
}
