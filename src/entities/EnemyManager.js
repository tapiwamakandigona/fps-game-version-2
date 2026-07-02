import * as THREE from 'three';
import { Zombie } from './Zombie.js';

export const TOTAL_WAVES = 5;
const WAVE_COUNTS = [6, 9, 12, 15, 14]; // wave 5 also spawns 1 boss
const BOSS_NAME = 'THE BUTCHER';
const CONCURRENT_CAP = 16;
const SPIT_GEO = new THREE.SphereGeometry(0.13, 10, 8);
const SPAWN_INTERVAL = 0.55;
const INTERMISSION = 4.0;

export class EnemyManager {
  constructor(scene, player, warehouse, audio) {
    this.scene = scene;
    this.player = player;
    this.warehouse = warehouse;
    this.colliders = warehouse.colliders;
    this.audio = audio;
    this.zombies = [];
    this.wave = 0;
    this.toSpawn = 0;
    this.spawnT = 0;
    this.state = 'idle';       // idle | spawning | intermission | done
    this.interT = 0;
    this.onWaveStart = null;   // (wave) => void
    this.onIntermission = null;// (nextWave, seconds) => void
    this.onWaveCleared = null; // (nextWave) => void  — fired once when a wave is cleared
    this.holdIntermission = false; // when true, the between-wave countdown is paused (shop open)
    this.onKill = null;        // (zombie, score) => void
    this.onVictory = null;
    this.onBossSpawn = null;   // (boss) => void
    this.onBossDeath = null;   // () => void
    this.onProjectileImpact = null; // (pos) => void  spitter glob hit FX
    this.onEnemyExplode = null;     // (pos) => void  exploder FX
    this.boss = null;
    this.spits = [];
    this.endless = false;      // when true, waves never end — survive as long as you can
    // Touch handicap: thumb aiming is slower than a mouse, so zombies move a
    // touch slower and intermissions run longer on touch devices (set by Game).
    this.touchTuning = false;
  }

  start() { this._beginWave(1); }

  _waveStats(w) {
    const speedScale = this.touchTuning ? 0.9 : 1;
    return {
      count: WAVE_COUNTS[w - 1] ?? (15 + w * 2),
      health: 70 + w * 18,
      speed: (1.5 + w * 0.22) * speedScale,
      damage: 9 + w * 2,
    };
  }

  _beginWave(w) {
    this.wave = w;
    const s = this._waveStats(w);
    this.toSpawn = s.count;
    this._stats = s;
    this.spawnT = 0;
    this.state = 'spawning';
    if (this.onWaveStart) this.onWaveStart(w);
    // Boss on the final campaign wave, and every 5th wave in endless mode.
    if (w === TOTAL_WAVES || (this.endless && w % TOTAL_WAVES === 0)) this._spawnBoss(w);
  }

  _spawnBoss(w = TOTAL_WAVES) {
    const spawns = this.warehouse.enemySpawns;
    const p = this.player.camera.position;
    let best = spawns[0], bestD = -1;
    for (const c of spawns) {
      const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d > bestD) { bestD = d; best = c; }
    }
    // Endless bosses get tougher each cycle.
    const cycle = Math.max(1, Math.floor(w / TOTAL_WAVES));
    const boss = new Zombie(this.scene, this.player, this.colliders, {
      variant: 'boss', scale: 2.2, health: Math.round(2600 * (1 + (cycle - 1) * 0.6)),
      speed: 1.7 + (cycle - 1) * 0.15, damage: 22 + (cycle - 1) * 6, score: 1500 * cycle,
    });
    boss.name = BOSS_NAME;
    boss.spawn({ x: best.x, z: best.z });
    boss.onDeath = (zz) => {
      this.boss = null;
      if (this.onBossDeath) this.onBossDeath();
      this._onKill(zz);
    };
    this.zombies.push(boss);
    this.boss = boss;
    if (this.onBossSpawn) this.onBossSpawn(boss);
  }

  _spawnOne() {
    const spawns = this.warehouse.enemySpawns;
    // pick a spawn point far-ish from the player
    let best = spawns[0], bestD = -1;
    const p = this.player.camera.position;
    for (let i = 0; i < 3; i++) {
      const c = spawns[Math.floor(Math.random() * spawns.length)];
      const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d > bestD) { bestD = d; best = c; }
    }
    const z = new Zombie(this.scene, this.player, this.colliders, this._variantStats());
    z.spawn({ x: best.x + (Math.random() - 0.5) * 3, z: best.z + (Math.random() - 0.5) * 3 });
    z.onDeath = (zz) => this._onKill(zz);
    z.onSpit = () => this._spawnSpit(z.group.position);
    z.onExplode = (pos) => { if (this.onEnemyExplode) this.onEnemyExplode(pos); };
    this.zombies.push(z);
  }

  // Boid-style separation so the horde fans out and surrounds the player instead
  // of stacking into a single overlapping blob. O(n^2) but n is small (<= cap).
  _separate() {
    const zs = this.zombies;
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i];
      if (!a.alive) continue;
      const ap = a.group.position;
      for (let j = i + 1; j < zs.length; j++) {
        const b = zs[j];
        if (!b.alive) continue;
        const bp = b.group.position;
        const dx = ap.x - bp.x, dz = ap.z - bp.z;
        const minD = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > minD * minD || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        ap.x += nx * push; ap.z += nz * push;
        bp.x -= nx * push; bp.z -= nz * push;
      }
    }
  }

  _spawnSpit(fromPos) {
    const start = fromPos.clone(); start.y = 1.3;
    const mat = new THREE.MeshStandardMaterial({ color: 0x9fe04a, emissive: 0x4a8a1e, emissiveIntensity: 1.2, roughness: 0.5 });
    const mesh = new THREE.Mesh(SPIT_GEO, mat);
    mesh.position.copy(start); mesh.userData.noHit = true;
    this.scene.add(mesh);
    const dir = this.player.camera.position.clone().sub(start).normalize();
    this.spits.push({ mesh, mat, pos: start.clone(), vel: dir.multiplyScalar(16), life: 2.5 });
  }

  _updateSpits(dt) {
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.life -= dt;
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos);
      const d = s.pos.distanceTo(this.player.camera.position);
      if (d < 0.7) {
        if (this.player.alive) this.player.takeDamage(8);
        if (this.onProjectileImpact) this.onProjectileImpact(s.pos.clone());
        this._removeSpit(i); continue;
      }
      if (s.pos.y <= 0.1 || s.life <= 0) {
        if (this.onProjectileImpact) this.onProjectileImpact(s.pos.clone());
        this._removeSpit(i);
      }
    }
  }

  _removeSpit(i) {
    const s = this.spits[i];
    this.scene.remove(s.mesh); s.mat.dispose();
    this.spits.splice(i, 1);
  }

  // Mix in runner/brute variants as waves progress.
  _pickVariant(w) {
    const r = Math.random();
    if (w >= 4 && r < 0.12) return 'exploder';                  // suicide bomber, from wave 4
    if (w >= 3 && r < 0.24) return 'spitter';                   // ranged, from wave 3
    if (w >= 3 && r < 0.40) return 'brute';                     // tanky, from wave 3
    if (w >= 2 && r < 0.62) return 'runner';                    // fast, from wave 2
    return 'normal';
  }

  _variantStats() {
    const s = this._stats;
    const w = this.wave;
    const v = this._pickVariant(w);
    const base = 100 + (w - 1) * 20;
    if (v === 'runner') {
      return { variant: 'runner', scale: 0.85, health: s.health * 0.55, speed: s.speed * 1.7,
        damage: s.damage * 0.8, score: base + 30 };
    }
    if (v === 'brute') {
      return { variant: 'brute', scale: 1.4, health: s.health * 2.6, speed: s.speed * 0.62,
        damage: s.damage * 1.8, score: base + 80 };
    }
    if (v === 'spitter') {
      return { variant: 'spitter', scale: 0.95, health: s.health * 0.7, speed: s.speed * 0.9,
        damage: 8, score: base + 50 };
    }
    if (v === 'exploder') {
      return { variant: 'exploder', scale: 1.0, health: s.health * 0.5, speed: s.speed * 1.25,
        damage: s.damage * 2.2, score: base + 60 };
    }
    return { variant: 'normal', scale: 1, health: s.health, speed: s.speed, damage: s.damage, score: base };
  }

  _onKill(z) {
    if (this.onKill) this.onKill(z, z.scoreValue ?? 100);
  }

  get aliveCount() { let n = 0; for (const z of this.zombies) if (z.alive) n++; return n; }

  update(dt, t) {
    // spawn pacing
    if (this.state === 'spawning' && this.toSpawn > 0) {
      this.spawnT -= dt;
      const active = this.zombies.filter((z) => !z.dead).length;
      if (this.spawnT <= 0 && active < CONCURRENT_CAP) {
        this._spawnOne();
        this.toSpawn--;
        this.spawnT = SPAWN_INTERVAL;
      }
    }

    // spitter projectiles
    this._updateSpits(dt);

    // update + cull
    for (const z of this.zombies) z.update(dt, t);
    this._separate();
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].dead) { this.zombies[i].dispose(); this.zombies.splice(i, 1); }
    }

    // wave cleared?
    if (this.state === 'spawning' && this.toSpawn === 0 && this.zombies.length === 0) {
      if (this.wave >= TOTAL_WAVES && !this.endless) {
        this.state = 'done';
        if (this.onVictory) this.onVictory();
      } else {
        this.state = 'intermission';
        this.interT = INTERMISSION + (this.touchTuning ? 2 : 0);
        if (this.onWaveCleared) this.onWaveCleared(this.wave + 1);
        if (this.onIntermission) this.onIntermission(this.wave + 1, Math.ceil(this.interT));
      }
    }

    if (this.state === 'intermission' && !this.holdIntermission) {
      const prev = Math.ceil(this.interT);
      this.interT -= dt;
      const now = Math.ceil(this.interT);
      if (now !== prev && now > 0 && this.onIntermission) this.onIntermission(this.wave + 1, now);
      if (this.interT <= 0) this._beginWave(this.wave + 1);
    }
  }

  reset() {
    for (const z of this.zombies) z.dispose();
    this.zombies = [];
    for (let i = this.spits.length - 1; i >= 0; i--) this._removeSpit(i);
    this.wave = 0; this.toSpawn = 0; this.state = 'idle'; this.boss = null;
    this.holdIntermission = false;
  }
}
