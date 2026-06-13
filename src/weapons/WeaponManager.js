import { Weapon } from './Weapon.js';

export const WEAPON_CONFIGS = [
  // Pistol: infinite reserve — always usable so you can never fully soft-lock.
  { name: 'PISTOL', type: 'pistol', pellets: 1, spreadDeg: 0, damage: 34, headshotMult: 2.0,
    mag: 12, fireInterval: 0.16, reloadTime: 1.1, auto: true },
  // Shotgun: finite reserve, topped up by ammo pickups.
  { name: 'SHOTGUN', type: 'shotgun', pellets: 8, spreadDeg: 7, damage: 16, headshotMult: 1.6,
    mag: 6, fireInterval: 0.7, reloadTime: 1.5, auto: false, reserve: 18, maxReserve: 36 },
  // SMG: fast full-auto, low per-shot damage, light spread. Big mag, finite reserve.
  { name: 'SMG', type: 'smg', pellets: 1, spreadDeg: 2.2, damage: 17, headshotMult: 1.8,
    mag: 30, fireInterval: 0.072, reloadTime: 1.3, auto: true, reserve: 120, maxReserve: 240 },
  // Rifle: slow semi-auto, hard-hitting and pinpoint. Rewards headshots.
  { name: 'RIFLE', type: 'rifle', pellets: 1, spreadDeg: 0, damage: 62, headshotMult: 2.4,
    mag: 8, fireInterval: 0.42, reloadTime: 1.7, auto: false, reserve: 40, maxReserve: 80 },
];

// Holds all weapons, handles switching, and routes fire/reload/update to the active one.
export class WeaponManager {
  constructor(camera, scene, audio, hud) {
    this.hud = hud;
    this.weapons = WEAPON_CONFIGS.map((cfg) => new Weapon(camera, scene, audio, cfg));
    this.active = 0;
    for (const w of this.weapons) {
      w.onAmmoChange = (mag, max, reserve) => { if (w === this.current) this.hud.setAmmo(mag, max, reserve); };
      w.setVisible(false);
    }
    this.onHit = null;
    this.onImpact = null;  // (point, isZombie, headshot)
    this.onShoot = null;   // (type)
    for (const w of this.weapons) {
      w.onHit = (z, hs, p, dmg) => { if (this.onHit) this.onHit(z, hs, p, dmg); };
      w.onImpact = (p, isZ, hs) => { if (this.onImpact) this.onImpact(p, isZ, hs); };
      w.onShoot = (type) => { if (this.onShoot) this.onShoot(type); };
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
  update(dt, holding) { this.current.update(dt, holding); }

  reset() {
    for (const w of this.weapons) w.reset();
    this.switchTo(0);
  }
}
