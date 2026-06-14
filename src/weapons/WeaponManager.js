import { Weapon } from './Weapon.js';
import { TracerPool } from './TracerPool.js';

// COD-feel fields per weapon:
//  hipSpread  — bloom (deg) when firing from the hip; ADS tightens to ~adsSpread.
//  adsSpread  — spread (deg) while aiming down sights (near-zero = pinpoint).
//  adsFov     — camera FOV while ADS (lower = more zoom); base FOV is 75.
//  adsZoomMul — look-sensitivity multiplier while ADS (<1 = slower, steadier aim).
//  recoil     — per-shot view kick {pitch (deg up), yaw (deg, randomised L/R)}.
//  falloff    — {start, end, minMul}: full damage <start m, lerps to minMul by end m.
export const WEAPON_CONFIGS = [
  // Pistol: infinite reserve — always usable so you can never fully soft-lock.
  { name: 'PISTOL', type: 'pistol', pellets: 1, spreadDeg: 0, damage: 34, headshotMult: 2.0,
    mag: 12, fireInterval: 0.16, reloadTime: 1.1, auto: true,
    hipSpread: 1.6, adsSpread: 0.2, adsFov: 62, adsZoomMul: 0.78,
    recoil: { pitch: 1.5, yaw: 0.5 }, falloff: { start: 22, end: 55, minMul: 0.55 } },
  // Shotgun: finite reserve, topped up by ammo pickups.
  { name: 'SHOTGUN', type: 'shotgun', pellets: 8, spreadDeg: 7, damage: 16, headshotMult: 1.6,
    mag: 6, fireInterval: 0.7, reloadTime: 1.5, auto: false, reserve: 18, maxReserve: 36,
    hipSpread: 7, adsSpread: 5, adsFov: 66, adsZoomMul: 0.85,
    recoil: { pitch: 3.2, yaw: 0.8 }, falloff: { start: 7, end: 20, minMul: 0.18 } },
  // SMG: fast full-auto, low per-shot damage, light spread. Big mag, finite reserve.
  { name: 'SMG', type: 'smg', pellets: 1, spreadDeg: 2.2, damage: 17, headshotMult: 1.8,
    mag: 30, fireInterval: 0.072, reloadTime: 1.3, auto: true, reserve: 120, maxReserve: 240,
    hipSpread: 3.4, adsSpread: 1.1, adsFov: 64, adsZoomMul: 0.8,
    recoil: { pitch: 0.85, yaw: 0.6 }, falloff: { start: 16, end: 42, minMul: 0.45 } },
  // Rifle: slow semi-auto, hard-hitting and pinpoint. Rewards headshots.
  { name: 'RIFLE', type: 'rifle', pellets: 1, spreadDeg: 0, damage: 62, headshotMult: 2.4,
    mag: 8, fireInterval: 0.42, reloadTime: 1.7, auto: false, reserve: 40, maxReserve: 80,
    hipSpread: 2.0, adsSpread: 0.05, adsFov: 50, adsZoomMul: 0.6,
    recoil: { pitch: 2.4, yaw: 0.4 }, falloff: { start: 40, end: 90, minMul: 0.7 } },
];

// Holds all weapons, handles switching, and routes fire/reload/update to the active one.
export class WeaponManager {
  constructor(camera, scene, audio, hud) {
    this.hud = hud;
    this.weapons = WEAPON_CONFIGS.map((cfg) => new Weapon(camera, scene, audio, cfg));
    this.tracers = new TracerPool(scene);
    for (const w of this.weapons) w.tracerPool = this.tracers;
    this.active = 0;
    for (const w of this.weapons) {
      w.onAmmoChange = (mag, max, reserve) => { if (w === this.current) this.hud.setAmmo(mag, max, reserve); };
      w.setVisible(false);
    }
    this.onHit = null;
    this.onImpact = null;  // (point, isZombie, headshot)
    this.onShoot = null;   // (type)
    this.onRecoil = null;  // (recoilCfg, ads) — view kick, handled by Game
    this.adsActive = false; // set each frame by Game from input.ads
    this.getTargets = null; // () => Object3D[]  curated raycast targets (set by Game)
    for (const w of this.weapons) {
      w.onHit = (z, hs, p, dmg) => { if (this.onHit) this.onHit(z, hs, p, dmg); };
      w.onImpact = (p, isZ, hs) => { if (this.onImpact) this.onImpact(p, isZ, hs); };
      w.onShoot = (type) => { if (this.onShoot) this.onShoot(type); };
      w.onRecoil = (cfg, ads) => { if (this.onRecoil) this.onRecoil(cfg, ads); };
      w.getTargets = () => (this.getTargets ? this.getTargets() : null);
    }
    this.switchTo(0);
  }

  get current() { return this.weapons[this.active]; }

  switchTo(i) {
    if (i < 0 || i >= this.weapons.length) return;
    this.active = i;
    this.weapons.forEach((w, idx) => w.setVisible(idx === i));
    const w = this.current;
    this.hud.setWeapon(w.name);
    this.hud.setAmmo(w.mag, w.magSize, w.reserve);
  }

  next() { this.switchTo((this.active + 1) % this.weapons.length); }

  fire() { this.current.tryFire(); }
  reload() { this.current.reload(); }

  // Ammo pickup: top up reserve on every finite-reserve weapon. Returns true if
  // any weapon actually needed/took ammo.
  addAmmo(amount) {
    let any = false;
    for (const w of this.weapons) { if (w.addReserve(amount)) any = true; }
    return any;
  }
  update(dt, holding) {
    this.current._ads = this.adsActive;
    this.current.update(dt, holding);
    this.tracers.update(dt);
  }

  // Current weapon's ADS tuning (used by Game for FOV/zoom/viewmodel lerp).
  get adsConfig() {
    const c = this.current.cfg;
    return { fov: c.adsFov ?? 60, zoomMul: c.adsZoomMul ?? 0.8 };
  }

  reset() {
    for (const w of this.weapons) w.reset();
    this.tracers.reset();
    this.switchTo(0);
  }
}
