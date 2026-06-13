import { Weapon } from './Weapon.js';

export const WEAPON_CONFIGS = [
  // Pistol: infinite reserve — always usable so you can never fully soft-lock.
  { name: 'PISTOL', type: 'pistol', pellets: 1, spreadDeg: 0, damage: 34, headshotMult: 2.0,
    mag: 12, fireInterval: 0.16, reloadTime: 1.1, auto: true },
  // Shotgun: finite reserve, topped up by ammo pickups.
  { name: 'SHOTGUN', type: 'shotgun', pellets: 8, spreadDeg: 7, damage: 16, headshotMult: 1.6,
    mag: 6, fireInterval: 0.7, reloadTime: 1.5, auto: false, reserve: 18, maxReserve: 36 },
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
    for (const w of this.weapons) w.onHit = (z, hs, p) => { if (this.onHit) this.onHit(z, hs, p); };
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
