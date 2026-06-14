import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────────
const UAV_DURATION      = 10;    // seconds
const SENTRY_DURATION   = 20;    // seconds
const SENTRY_RANGE      = 22;    // metres
const SENTRY_FIRE_RATE  = 0.4;   // seconds between shots
const SENTRY_DAMAGE     = 12;
const SENTRY_HP         = 200;
const MORTAR_STRIKES    = 5;
const MORTAR_INTERVAL   = 0.45;  // seconds between strikes
const MORTAR_TELEGRAPH  = 1.2;   // seconds of red marker before strike
const MORTAR_SPREAD     = 14;    // half-width of strike line (metres)

const THRESHOLDS = [
  { kills: 3,  name: 'UAV',         key: 'uav'       },
  { kills: 5,  name: 'SENTRY GUN',  key: 'sentry'    },
  { kills: 7,  name: 'MORTAR',      key: 'mortar'    },
  { kills: 10, name: 'SELF-REVIVE', key: 'selfrevive' },
];

// ─── Killstreaks ──────────────────────────────────────────────────────────────
/**
 * COD-style killstreak rewards for a wave-survival FPS.
 *
 * Construction:
 *   new Killstreaks({ scene, camera, getZombies, audio, announcer, hud, onMortarExplosion })
 *
 * Public API:
 *   addKill()            — call on every player kill
 *   reset()              — call when player takes damage (resets streak only)
 *   consumeRevive()      — returns true+clears if hasSelfRevive, else false
 *   update(dt)           — tick every frame (dt in seconds)
 *   dispose()            — remove all live scene objects immediately
 *   get streak           — current consecutive-kill count
 *   getProgress()        — { streak, next: { name, kills } | null }
 *   hasSelfRevive        — boolean flag for the lead to check
 */
export class Killstreaks {
  /**
   * @param {object} deps
   * @param {THREE.Scene}              deps.scene
   * @param {THREE.PerspectiveCamera}  deps.camera
   * @param {()=>object[]}             deps.getZombies
   * @param {object}                   [deps.audio]
   * @param {object}                   [deps.announcer]
   * @param {object}                   [deps.hud]
   * @param {(THREE.Vector3)=>void}    [deps.onMortarExplosion]
   */
  constructor({ scene, camera, getZombies, audio, announcer, hud, onMortarExplosion }) {
    this._scene            = scene;
    this._camera           = camera;
    this._getZombies       = getZombies;
    this._audio            = audio;
    this._announcer        = announcer;
    this._hud              = hud;
    this._onMortarExplosion = onMortarExplosion;

    // ── Public state ──────────────────────────────────────────────────────────
    this.streak        = 0;
    this.hasSelfRevive = false;

    // ── Reward tracking ───────────────────────────────────────────────────────
    // Which rewards have already fired this life (cleared in dispose only)
    this._awarded = new Set();

    // ── UAV ───────────────────────────────────────────────────────────────────
    this._uavTimer     = 0;
    this._uavActive    = false;
    this._uavTargets   = [];  // snapshot of zombies we flipped .revealed on

    // ── Sentry ────────────────────────────────────────────────────────────────
    this._sentry       = null;  // { group, barrel, timer, fireTimer, hp }
    this._sentryTracers = [];   // { line, mat, ttl }

    // ── Mortar ────────────────────────────────────────────────────────────────
    this._mortar       = null;  // { strikes:[{pos, telegraphTimer, fired}], interval, timer, done }
    this._telegraphs   = [];    // { mesh, ttl }

    // Reusable scratch vectors
    this._v3a = new THREE.Vector3();
    this._v3b = new THREE.Vector3();
  }

  // ── Public: increment kill counter ─────────────────────────────────────────
  addKill() {
    this.streak++;
    // Check every threshold in order; activate if just crossed it
    for (const t of THRESHOLDS) {
      if (this.streak === t.kills && !this._awarded.has(t.key)) {
        this._awarded.add(t.key);
        this._activate(t);
      }
    }
  }

  // ── Public: player took damage — reset streak, keep active rewards ──────────
  reset() {
    this.streak = 0;
    this._awarded.clear(); // allow re-earning on next life
  }

  // ── Public: consume the self-revive token ──────────────────────────────────
  consumeRevive() {
    if (!this.hasSelfRevive) return false;
    this.hasSelfRevive = false;
    return true;
  }

  // ── Public: HUD progress helper ────────────────────────────────────────────
  getProgress() {
    let next = null;
    for (const t of THRESHOLDS) {
      if (this.streak < t.kills) { next = { name: t.name, kills: t.kills }; break; }
    }
    return { streak: this.streak, next };
  }

  // ── Public: main tick ──────────────────────────────────────────────────────
  update(dt) {
    this._tickUAV(dt);
    this._tickSentry(dt);
    this._tickMortar(dt);
    this._tickTracers(dt);
    this._tickTelegraphs(dt);
  }

  // ── Public: remove all live scene objects ──────────────────────────────────
  dispose() {
    this._clearUAV();
    this._clearSentry();
    this._clearMortar();
    this._clearTelegraphs();
    // Dispose remaining tracer lines
    for (const t of this._sentryTracers) {
      try { this._scene?.remove(t.line); } catch(_) {}
      try { t.line.geometry.dispose(); t.mat.dispose(); } catch(_) {}
    }
    this._sentryTracers.length = 0;
  }

  // ── Private: activate a reward by its threshold descriptor ─────────────────
  _activate({ key, name }) {
    this._announce(name);
    switch (key) {
      case 'uav':        this._startUAV();     break;
      case 'sentry':     this._startSentry();  break;
      case 'mortar':     this._startMortar();  break;
      case 'selfrevive': this.hasSelfRevive = true;
                         this._hud?.message?.('SELF-REVIVE READY');
                         break;
    }
  }

  // ── Announce helper ────────────────────────────────────────────────────────
  _announce(name) {
    try { this._announcer?.killstreak?.(name); } catch(_) {}
    try { this._hud?.message?.(name + ' ONLINE'); } catch(_) {}
  }

  // ── UAV ───────────────────────────────────────────────────────────────────
  _startUAV() {
    this._clearUAV();
    const zombies = this._getZombies?.() ?? [];
    this._uavTargets = zombies.filter(z => z.alive);
    for (const z of this._uavTargets) z.revealed = true;
    this._uavActive = true;
    this._uavTimer  = UAV_DURATION;
  }

  _tickUAV(dt) {
    if (!this._uavActive) return;
    this._uavTimer -= dt;
    if (this._uavTimer <= 0) this._clearUAV();
  }

  _clearUAV() {
    for (const z of this._uavTargets) { try { z.revealed = false; } catch(_) {} }
    this._uavTargets = [];
    this._uavActive  = false;
    this._uavTimer   = 0;
  }

  // ── Sentry ────────────────────────────────────────────────────────────────
  _startSentry() {
    this._clearSentry();

    // Build a small turret Group: box base + rotating barrel cylinder
    const group = new THREE.Group();
    group.userData.noHit = true;

    // Base — squat metal box
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a6741, roughness: 0.8, metalness: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), baseMat);
    base.userData.noHit = true;
    base.position.y = 0.175;
    group.add(base);

    // Swivel head
    const head = new THREE.Group();
    head.userData.noHit = true;
    head.position.y = 0.42;

    const headBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x3a5032, roughness: 0.7, metalness: 0.6 }));
    headBody.userData.noHit = true;
    head.add(headBody);

    // Barrel — thin cylinder along +Z (world forward after rotation)
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.9 })
    );
    barrel.userData.noHit = true;
    barrel.rotation.x = Math.PI / 2; // lay it flat (cylinder axis → Z)
    barrel.position.z = 0.27;        // extend forward
    head.add(barrel);
    group.add(head);

    // Place near the player, slightly offset to avoid overlap
    const camPos = this._camera?.position ?? new THREE.Vector3();
    const angle  = Math.random() * Math.PI * 2;
    group.position.set(
      camPos.x + Math.cos(angle) * 3.5,
      camPos.y - 1.6,   // roughly floor level (player eye = 1.6m)
      camPos.z + Math.sin(angle) * 3.5
    );

    this._scene?.add(group);

    this._sentry = {
      group,
      head,    // we rotate this toward targets
      timer:     SENTRY_DURATION,
      fireTimer: 0,
      hp:        SENTRY_HP,
    };
  }

  _tickSentry(dt) {
    const s = this._sentry;
    if (!s) return;

    s.timer -= dt;
    if (s.timer <= 0 || s.hp <= 0) { this._clearSentry(); return; }

    // Find nearest live zombie within range
    const zombies = this._getZombies?.() ?? [];
    const origin  = s.group.position;
    let nearest = null, nearDist = SENTRY_RANGE;

    for (const z of zombies) {
      if (!z.alive) continue;
      const zp = z.group?.position;
      if (!zp) continue;
      const d = origin.distanceTo(zp);
      if (d < nearDist) { nearDist = d; nearest = z; }
    }

    if (nearest) {
      const tp = nearest.group.position;
      // Rotate the head toward the target (yaw only in world space)
      const dx = tp.x - origin.x;
      const dz = tp.z - origin.z;
      s.head.rotation.y = Math.atan2(dx, dz);

      // Fire
      s.fireTimer -= dt;
      if (s.fireTimer <= 0) {
        s.fireTimer = SENTRY_FIRE_RATE;
        try { nearest.takeDamage?.(SENTRY_DAMAGE, false); } catch(_) {}
        try { this._audio?.shoot?.(); } catch(_) {}
        this._spawnSentryTracer(origin, tp);
      }
    } else {
      // Idle sweep
      s.head.rotation.y += dt * 0.8;
    }
  }

  _clearSentry() {
    if (!this._sentry) return;
    try { this._scene?.remove(this._sentry.group); } catch(_) {}
    this._sentry = null;
  }

  // ── Sentry tracers (pooled short-lived lines) ──────────────────────────────
  _spawnSentryTracer(from, to) {
    const positions = new Float32Array(6);
    positions[0] = from.x; positions[1] = from.y + 0.42; positions[2] = from.z;
    positions[3] = to.x;   positions[4] = to.y + 0.9;    positions[5] = to.z;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat  = new THREE.LineBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    line.userData.noHit   = true;
    line.frustumCulled    = false;
    try { this._scene?.add(line); } catch(_) {}
    this._sentryTracers.push({ line, mat, ttl: 0.08 });
  }

  _tickTracers(dt) {
    for (let i = this._sentryTracers.length - 1; i >= 0; i--) {
      const t = this._sentryTracers[i];
      t.ttl -= dt;
      t.mat.opacity = Math.max(0, (t.ttl / 0.08) * 0.85);
      if (t.ttl <= 0) {
        try { this._scene?.remove(t.line); } catch(_) {}
        t.line.geometry.dispose();
        t.mat.dispose();
        this._sentryTracers.splice(i, 1);
      }
    }
  }

  // ── Mortar ────────────────────────────────────────────────────────────────
  _startMortar() {
    this._clearMortar();

    // Generate 5 strike positions in a line across the arena centred on the
    // player's current position (spread along a random horizontal angle)
    const camPos = this._camera?.position ?? new THREE.Vector3();
    const angle  = Math.random() * Math.PI * 2;
    const dx     = Math.cos(angle);
    const dz     = Math.sin(angle);

    const strikes = [];
    for (let i = 0; i < MORTAR_STRIKES; i++) {
      const t = (i / (MORTAR_STRIKES - 1)) * 2 - 1; // -1 … +1
      const pos = new THREE.Vector3(
        camPos.x + dx * t * MORTAR_SPREAD,
        0,
        camPos.z + dz * t * MORTAR_SPREAD
      );
      strikes.push({
        pos,
        telegraphTimer: MORTAR_TELEGRAPH + i * MORTAR_INTERVAL,  // total delay until strike
        telegraphSpawned: false,
        fired: false,
      });
    }

    this._mortar = { strikes, done: false };
    this._hud?.message?.('MORTAR STRIKE INCOMING');
  }

  _tickMortar(dt) {
    const m = this._mortar;
    if (!m || m.done) return;

    let allDone = true;
    for (const s of m.strikes) {
      if (s.fired) continue;
      allDone = false;
      s.telegraphTimer -= dt;

      // Spawn red sphere marker when close to strike time
      if (!s.telegraphSpawned && s.telegraphTimer <= MORTAR_TELEGRAPH) {
        s.telegraphSpawned = true;
        this._spawnTelegraph(s.pos);
      }

      // Fire when timer expires
      if (s.telegraphTimer <= 0) {
        s.fired = true;
        try { this._onMortarExplosion?.(s.pos.clone()); } catch(_) {}
        try { this._audio?.explosion?.(); } catch(_) {}
      }
    }
    if (allDone) m.done = true;
  }

  _clearMortar() {
    this._mortar = null;
    // telegraph meshes cleaned in _tickTelegraphs / dispose
  }

  // ── Telegraph markers (red spheres) ───────────────────────────────────────
  _spawnTelegraph(pos) {
    const geo  = new THREE.SphereGeometry(0.3, 8, 6);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xff1a00, transparent: true, opacity: 0.75 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.noHit = true;
    mesh.position.copy(pos);
    mesh.position.y = 0.3;
    try { this._scene?.add(mesh); } catch(_) {}
    this._telegraphs.push({ mesh, mat, ttl: MORTAR_TELEGRAPH });
  }

  _tickTelegraphs(dt) {
    for (let i = this._telegraphs.length - 1; i >= 0; i--) {
      const t = this._telegraphs[i];
      t.ttl -= dt;
      // Pulse opacity
      t.mat.opacity = Math.abs(Math.sin(t.ttl * 8)) * 0.75 + 0.1;
      if (t.ttl <= 0) {
        try { this._scene?.remove(t.mesh); } catch(_) {}
        t.mesh.geometry.dispose();
        t.mat.dispose();
        this._telegraphs.splice(i, 1);
      }
    }
  }

  _clearTelegraphs() {
    for (const t of this._telegraphs) {
      try { this._scene?.remove(t.mesh); } catch(_) {}
      try { t.mesh.geometry.dispose(); t.mat.dispose(); } catch(_) {}
    }
    this._telegraphs.length = 0;
  }
}
