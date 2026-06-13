import * as THREE from 'three';
import { Zombie } from './Zombie.js';

export const TOTAL_WAVES = 5;
const WAVE_COUNTS = [6, 9, 12, 15, 20];
const CONCURRENT_CAP = 16;
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
    this.onKill = null;        // (zombie, score) => void
    this.onVictory = null;
  }

  start() { this._beginWave(1); }

  _waveStats(w) {
    return {
      count: WAVE_COUNTS[w - 1] ?? (15 + w * 2),
      health: 70 + w * 18,
      speed: 1.5 + w * 0.22,
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
    const z = new Zombie(this.scene, this.player, this.colliders, this._stats);
    z.spawn({ x: best.x + (Math.random() - 0.5) * 3, z: best.z + (Math.random() - 0.5) * 3 });
    z.onDeath = (zz) => this._onKill(zz);
    this.zombies.push(z);
  }

  _onKill(z) {
    const score = 100 + (this.wave - 1) * 20;
    if (this.onKill) this.onKill(z, score);
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

    // update + cull
    for (const z of this.zombies) z.update(dt, t);
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].dead) { this.zombies[i].dispose(); this.zombies.splice(i, 1); }
    }

    // wave cleared?
    if (this.state === 'spawning' && this.toSpawn === 0 && this.zombies.length === 0) {
      if (this.wave >= TOTAL_WAVES) {
        this.state = 'done';
        if (this.onVictory) this.onVictory();
      } else {
        this.state = 'intermission';
        this.interT = INTERMISSION;
        if (this.onIntermission) this.onIntermission(this.wave + 1, Math.ceil(this.interT));
      }
    }

    if (this.state === 'intermission') {
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
    this.wave = 0; this.toSpawn = 0; this.state = 'idle';
  }
}
