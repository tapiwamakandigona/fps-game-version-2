import * as THREE from 'three';
import { LookControls } from '../systems/LookControls.js';

// Build stamp — bump on each deploy so testers can confirm they're on the latest
// (GitHub Pages caches files ~10 min; a stale tag here means the browser cached old code).
export const BUILD = 'v10 · 2026-06-14';
import { Engine } from './Engine.js';
import { Warehouse } from '../world/Warehouse.js';
import { Foundry } from '../world/Foundry.js';

const ARENAS = [
  { name: 'WAREHOUSE', cls: Warehouse, sub: 'WAREHOUSE: CONTAINMENT' },
  { name: 'FOUNDRY', cls: Foundry, sub: 'FOUNDRY: MELTDOWN' },
];
const ARENA_KEY = 'fps-v2-arena';
import { Player } from '../entities/Player.js';
import { WeaponManager } from '../weapons/WeaponManager.js';
import { GrenadeManager } from '../weapons/Grenade.js';
import { EnemyManager, TOTAL_WAVES } from '../entities/EnemyManager.js';
import { PickupManager } from '../entities/Pickup.js';
import { Input } from '../systems/Input.js';
import { TouchControls, isTouchDevice } from '../systems/TouchControls.js';
import { Settings } from '../systems/Settings.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { Audio } from '../systems/Audio.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { DamageNumbers } from '../ui/DamageNumbers.js';
import { Impacts } from '../ui/Impacts.js';
import { ScreenShake } from '../systems/ScreenShake.js';
import { ShellEjector } from '../systems/ShellEjector.js';
import { UpgradeShop } from '../ui/UpgradeShop.js';
import { PerfMeter, AdaptiveQuality } from '../systems/Perf.js';
import { Announcer } from '../systems/Announcer.js';
import { KillFeed } from '../ui/KillFeed.js';
import { DirectionalDamage } from '../ui/DirectionalDamage.js';
import { Killstreaks } from '../systems/Killstreaks.js';
import { Music } from '../systems/Music.js';

const COMBO_WINDOW = 3.0; // seconds between kills to keep a combo alive

const HS_KEY = 'fps-v2-highscore';

export class Game {
  constructor() {
    this.engine = new Engine(document.getElementById('game-canvas'));
    // Perf instrumentation + adaptive resolution (holds ~60fps on weaker devices).
    this.perf = new PerfMeter(this.engine.renderer);
    this.adaptive = new AdaptiveQuality(this.engine);
    this.hud = new HUD();
    this.minimap = new Minimap(document.getElementById('hud'));
    this.input = new Input();
    this.audio = new Audio();
    this.touch = isTouchDevice();
    this.touchControls = new TouchControls(this.input, document.getElementById('game-container'));
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.controls = new LookControls(this.engine.camera, this.engine.renderer.domElement);
    // Camera must live in the scene graph so the weapon viewmodel (a child of the
    // camera) gets rendered.
    this.engine.scene.add(this.engine.camera);

    this.state = 'menu';
    this.score = 0;
    this.best = Number(localStorage.getItem(HS_KEY) || 0);
    this.clock = new THREE.Clock();

    // COD feedback systems (created before _buildWorld so Killstreaks can use them).
    const hudEl = document.getElementById('hud');
    this.announcer = new Announcer();
    this.killFeed = new KillFeed(hudEl);
    this.dirDmg = new DirectionalDamage(hudEl, this.engine.camera);

    this._buildWorld();
    this._wireControls();

    // Settings (brightness/quality/sensitivity/volume) — apply before first frame.
    const container = document.getElementById('game-container');
    this.settings = new Settings(this);
    this.settingsPanel = new SettingsPanel(this.settings, container, () => this._closeSettings());
    this.settings.apply();
    // Adaptive quality uses the chosen preset as its ceiling (only scales down from there).
    this.adaptive.setCeiling(this.settings.get('quality'));

    this._wireButtons();

    this.hud.hideLoading();
    if (this.touch) this._applyTouchMenu();
    this.hud.showMenu(this.best);
    this.engine.camera.position.copy(this.world.playerSpawn);

    // Perf overlay toggle: backtick (`) or F3, available any time.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F3') { e.preventDefault(); this.perf.toggle(); }
    });

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildWorld() {
    this.arenaIdx = Math.min(ARENAS.length - 1, Math.max(0, Number(localStorage.getItem(ARENA_KEY) || 0)));
    this.world = new ARENAS[this.arenaIdx].cls(this.engine.scene);
    this._freezeStaticWorld();
    this.player = new Player(this.engine.camera, this.world.colliders);
    this.weapons = new WeaponManager(this.engine.camera, this.engine.scene, this.audio, this.hud);
    this.enemies = new EnemyManager(this.engine.scene, this.player, this.world, this.audio);
    this.pickups = new PickupManager(this.engine.scene);
    this.pickups.onCollect = (type, amount) => this._onPickup(type, amount);
    this.damageNumbers = new DamageNumbers(this.engine.camera, document.getElementById('hud'));
    this.impacts = new Impacts(this.engine.scene, this.engine.camera);
    this.shake = new ScreenShake();
    this.shells = new ShellEjector(this.engine.scene, this.engine.camera);
    this._hitStop = 0;
    this.grenadeMgr = new GrenadeManager(this.engine.scene, this.engine.camera, () => this.enemies.zombies, 24);
    this.grenadeMgr.onChange = (n) => this.hud.setGrenades(n);
    this.grenadeMgr.onTacticalChange = (n) => this.hud.setTacticals(n);
    this.grenadeMgr.onExplode = (pos) => {
      this.impacts.spawn(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xffa030, 5);
      this.shake.add(0.7);
      this._hitStop = Math.max(this._hitStop, 0.05);
      this.audio.explosion();
    };
    this.grenadeMgr.onFlash = (pos, blind) => {
      // bright bluish pop at the detonation point
      this.impacts.spawn(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xcfe6ff, 4);
      if (blind > 0.02) { this.hud.flashbang(blind); this.shake.add(0.25 * blind); }
      this.audio.explosion();
    };
    this.combo = 0; this.comboTimer = 0;
    this._mkCount = 0; this._mkTimer = 0;   // rapid multi-kill window (announcer)
    this._lastHeadshot = false;             // most recent hit was a headshot
    this._lowAnnounced = false;             // low-health voice line fired once

    // Killstreak system (UAV / Sentry / Mortar / Self-Revive).
    this.killstreaks = new Killstreaks({
      scene: this.engine.scene,
      camera: this.engine.camera,
      getZombies: () => this.enemies.zombies,
      audio: this.audio,
      announcer: this.announcer,
      hud: this.hud,
      onMortarExplosion: (pos) => this._explodeAt(pos, 6, 170),
    });

    this.shop = new UpgradeShop();
    this.shop.getScore = () => this.score;
    this.shop.spendScore = (c) => { this.score = Math.max(0, this.score - c); this.hud.setScore(this.score); };
    this.shop.onApply = (id) => this._applyUpgrade(id);
    this.shop.onDeploy = () => this._closeShop();
    this.shop.weaponName = () => this.weapons.current.name;
    this.shop.weaponPaP = () => this.weapons.current.paP === true;

    // Curated bullet raycast targets: world solids + live enemy groups only.
    // Rebuilt per trigger pull — a few dozen entries vs. the whole scene graph.
    this.weapons.getTargets = () => {
      const t = this.world.solids ? this.world.solids.slice() : [];
      const zs = this.enemies.zombies;
      for (let i = 0; i < zs.length; i++) if (zs[i].alive) t.push(zs[i].group);
      return t;
    };

    this.player.onHurt = () => {
      this.hud.flashDamage(); this.audio.hurt(); this.shake.add(0.4);
      // Directional damage indicator: point toward the nearest live threat.
      const atk = this._nearestZombiePos();
      if (atk) this.dirDmg.hit(atk, this.engine.camera.position);
      // Taking damage breaks the killstreak.
      if (this.killstreaks) this.killstreaks.reset();
    };
    this.player.onSlide = () => { this.shake.add(0.18); };
    // Juice: shake on fire, sparks at impact points.
    this.weapons.onShoot = (type) => {
      this.shake.add({ shotgun: 0.32, rifle: 0.30, smg: 0.10, pistol: 0.16 }[type] ?? 0.16);
      this.shells.eject();   // brass casing flips out of the ejection port
    };
    this.weapons.onRecoil = (cfg, ads) => this._applyRecoil(cfg, ads);
    // ADS / recoil state.
    this._baseFov = this.engine.camera.fov;
    this._adsT = 0;
    this._lookZoom = 1;
    this._recoil = { x: 0, y: 0 };
    this._recoilTarget = { x: 0, y: 0 };
    this.weapons.onImpact = (point, isZomb, headshot) => {
      const color = isZomb ? (headshot ? 0xffe24d : 0xff5a5a) : 0xffd27f;
      this.impacts.spawn(point, color, headshot ? 1.5 : (isZomb ? 1.1 : 0.9));
    };
    this.weapons.onHit = (z, headshot, point, dmg) => {
      this._lastHeadshot = headshot;
      this.hud.hitmark(headshot);
      if (point && dmg) this.damageNumbers.spawn(point, dmg, headshot);
      if (headshot) { this.score += 50; this.hud.message('HEADSHOT  +50', 700); this.hud.setScore(this.score); }
    };
    this.enemies.onWaveStart = (w) => { this.hud.setWave(w); this.hud.message(`WAVE ${w}`, 1500); this.audio.wave(); this.grenadeMgr.refill(); this.announcer.wave(w); };
    this.enemies.onIntermission = (next, secs) => this.hud.message(`WAVE CLEARED — next in ${secs}`, 1100);
    this.enemies.onKill = (z, sc) => {
      // combo: each kill within the window raises the points multiplier (caps at 3x)
      this.combo++; this.comboTimer = COMBO_WINDOW;
      const mult = Math.min(3, 1 + (this.combo - 1) * 0.25);
      const award = Math.round(sc * mult);
      this.score += award; this.hud.setScore(this.score);
      if (this.combo >= 2) this.hud.setCombo(this.combo, mult);
      this.pickups.maybeDrop(z.group.position, z.variant);
      // Kill-confirm: distinct elimination hitmarker + crisp ding (COD feel).
      this.hud.hitmark(this._lastHeadshot, true);
      this.audio.killConfirm(this._lastHeadshot);
      // hit-stop punch on kills (a touch longer on brutes)
      this._hitStop = Math.max(this._hitStop, z.variant === 'brute' ? 0.06 : 0.04);
      this.shake.add(0.12);

      // Kill feed + killstreak + rapid multi-kill announcer.
      const explosive = z.variant === 'exploder';
      this.killFeed.kill({
        weapon: this.weapons.current.name,
        variant: z.variant || 'normal',
        points: award,
        headshot: this._lastHeadshot,
        explosive,
        streak: false,
      });
      this._lastHeadshot = false;
      this.killstreaks.addKill();
      this._mkCount = this._mkTimer > 0 ? this._mkCount + 1 : 1;
      this._mkTimer = 1.2;
      if (this._mkCount >= 2) this.announcer.multiKill(this._mkCount);
    };
    this.enemies.onVictory = () => this._end(true);
    this.enemies.onWaveCleared = (next) => this._openShop(next);
    this.enemies.onProjectileImpact = (pos) => {
      this.impacts.spawn(pos, 0x9fe04a, 1.4);
      this.shake.add(0.18);
      this.audio.hurt();
    };
    this.enemies.onEnemyExplode = (pos) => {
      this.impacts.spawn(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xffa030, 4);
      this.shake.add(0.6);
      this._hitStop = Math.max(this._hitStop, 0.04);
      this.audio.explosion();
    };
    this.enemies.onBossSpawn = (b) => {
      this.hud.showBoss(b.name || 'BOSS');
      this.hud.message('\u26a0  ' + (b.name || 'BOSS') + ' INCOMING', 2000);
      this.audio.wave();
      this.shake.add(0.6);
      this.announcer.bossIncoming();
    };
    this.enemies.onBossDeath = () => {
      this.hud.hideBoss();
      this.hud.message('BOSS DOWN!', 1600);
      this._hitStop = Math.max(this._hitStop, 0.14);
      this.shake.add(0.7);
    };

    this.input.onReload = () => { if (this.state === 'playing') this.weapons.reload(); };
    this.input.onShoot = () => { if (this.state === 'playing') this.weapons.fire(); };
    this.input.onSwitch = (i) => { if (this.state === 'playing') this.weapons.switchTo(i); };
    this.input.onSwitchNext = () => { if (this.state === 'playing') this.weapons.next(); };
    this.input.onGrenade = () => { if (this.state === 'playing') this.grenadeMgr.throw(); };
    this.input.onTactical = () => { if (this.state === 'playing') this.grenadeMgr.throwTactical(); };
  }

  // Swap the arena from the menu. Disposes the old world and rewires the entities
  // to the new colliders/spawns.
  setArena(idx) {
    if (this.state !== 'menu') return;
    idx = ((idx % ARENAS.length) + ARENAS.length) % ARENAS.length;
    if (idx === this.arenaIdx) return;
    this.world.dispose();
    this.arenaIdx = idx;
    localStorage.setItem(ARENA_KEY, String(idx));
    this.world = new ARENAS[idx].cls(this.engine.scene);
    this._freezeStaticWorld();
    this.player.colliders = this.world.colliders;
    this.enemies.warehouse = this.world;
    this.enemies.colliders = this.world.colliders;
    this.engine.camera.position.copy(this.world.playerSpawn);
    this._updateArenaLabel();
  }

  // Perf: the arena geometry never moves, so stop Three.js from recomputing its
  // world matrices every frame. Only light intensities animate (no transforms),
  // so freezing static mesh matrices is safe and saves CPU on hundreds of meshes.
  _freezeStaticWorld() {
    if (!this.world || !this.world.root) return;
    this.world.root.updateMatrixWorld(true);
    this.world.root.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); }
    });
  }

  _updateArenaLabel() {
    const el = document.getElementById('arena-name');
    if (el) el.textContent = ARENAS[this.arenaIdx].name;
    const h2 = document.querySelector('#menu .panel h2');
    if (h2) h2.textContent = ARENAS[this.arenaIdx].sub;
  }

  // --- Between-wave upgrade shop ---------------------------------------
  _openShop(nextWave) {
    if (this.state !== 'playing') return;
    this.state = 'shop';
    this.enemies.holdIntermission = true;   // freeze the countdown while shopping
    this.input.setEnabled(false);
    this.touchControls.setEnabled(false);
    this.hud.hideCombo();
    this.shop.open(nextWave);
    if (!this.touch) { try { this.controls.unlock(); } catch (e) {} }
  }

  _closeShop() {
    if (this.state !== 'shop') return;
    this.shop.close();
    this.enemies.holdIntermission = false;
    this.enemies.interT = 0;                 // begin the next wave immediately
    this.state = 'playing';
    this.input.setEnabled(true);
    if (this.touch) this.touchControls.setEnabled(true);
    this._requestLock();                     // regain mouse-look on desktop
  }

  _applyUpgrade(id) {
    if (id === 'vitality') {
      this.player.maxHealth += 25;
      this.player.health = this.player.maxHealth;
      this.hud.setHealth(this.player.health, this.player.maxHealth);
    } else if (id === 'firepower') {
      for (const w of this.weapons.weapons) w.damageMult *= 1.15;
    } else if (id === 'fasthands') {
      for (const w of this.weapons.weapons) w.reloadMult *= 0.82;
    } else if (id === 'munitions') {
      for (const w of this.weapons.weapons) {
        if (isFinite(w.reserve)) {
          w.maxReserve = Math.round(w.maxReserve * 1.3);
          w.reserve = w.maxReserve;
        }
      }
      this.weapons.switchTo(this.weapons.active); // refresh HUD ammo
    } else if (id === 'demolition') {
      this.grenadeMgr.maxCount += 1;
      this.grenadeMgr.refill();
    } else if (id === 'packapunch') {
      const w = this.weapons.current;
      if (w.packAPunch()) {
        this.hud.setWeapon(w.name);
        this.hud.setAmmo(w.mag, w.magSize, w.reserve);
        this.hud.message('PACK-A-PUNCH!  ' + w.name, 1400);
        this.announcer.say('Pack a punch', { priority: 2 });
      }
    }
  }

  _wireControls() {
    this.controls.addEventListener('lock', () => {
      if (this.state === 'menu' || this.state === 'over') this._startRun();
      else if (this.state === 'paused') { this.state = 'playing'; this.hud.showPause(false); this.input.setEnabled(true); }
    });
    this.controls.addEventListener('unlock', () => {
      if (this.state === 'playing') { this.state = 'paused'; this.hud.showPause(true); this.input.setEnabled(false); }
    });
  }

  _wireButtons() {
    // Build-version stamp so testers can confirm they're running the latest deploy.
    const bt = document.getElementById('build-tag');
    if (bt) bt.textContent = 'build ' + BUILD;

    // Fullscreen toggle (menu button + in-game corner button). Must be invoked from
    // a user gesture, which a click/tap satisfies. Prefixed fallbacks for older WebKit.
    const toggleFullscreen = () => {
      try {
        const el = document.documentElement;
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fsEl) {
          const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
          if (req) { const r = req.call(el); if (r && r.catch) r.catch(() => {}); }
        } else {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          if (exit) exit.call(document);
        }
      } catch (e) { /* fullscreen unsupported (e.g. iOS Safari) — ignore */ }
    };
    const fsBtn = document.getElementById('fullscreen-btn');
    const fsTog = document.getElementById('fs-toggle');
    if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
    if (fsTog) fsTog.addEventListener('click', toggleFullscreen);
    // On touch, starting a run also enters fullscreen (the tap is a valid gesture).
    // Enter-only — never exits if the player is already fullscreen.
    this._maybeFsOnStart = () => {
      if (!this.touch) return;
      try {
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl) return;
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
        if (req) { const r = req.call(el); if (r && r.catch) r.catch(() => {}); }
      } catch (e) { /* ignore */ }
    };

    document.getElementById('start-btn').addEventListener('click', () => { this._maybeFsOnStart(); this._requestLock(); });
    document.getElementById('resume-btn').addEventListener('click', () => this._requestLock());
    document.getElementById('restart-btn').addEventListener('click', () => { this.hud.hideEnd(); this._requestLock(); });
    const sm = document.getElementById('settings-btn');
    const sp = document.getElementById('settings-btn-pause');
    if (sm) sm.addEventListener('click', () => this._openSettings('menu'));
    if (sp) sp.addEventListener('click', () => this._openSettings('pause'));
    const ap = document.getElementById('arena-prev');
    const an = document.getElementById('arena-next');
    if (ap) ap.addEventListener('click', () => this.setArena(this.arenaIdx - 1));
    if (an) an.addEventListener('click', () => this.setArena(this.arenaIdx + 1));
    const eb = document.getElementById('endless-btn');
    if (eb) {
      this.endlessMode = localStorage.getItem('fps-v2-endless') === '1';
      eb.textContent = this.endlessMode ? 'ENDLESS: ON' : 'ENDLESS: OFF';
      eb.classList.toggle('active', this.endlessMode);
      eb.addEventListener('click', () => {
        this.endlessMode = !this.endlessMode;
        localStorage.setItem('fps-v2-endless', this.endlessMode ? '1' : '0');
        eb.textContent = this.endlessMode ? 'ENDLESS: ON' : 'ENDLESS: OFF';
        eb.classList.toggle('active', this.endlessMode);
      });
    }
    this._updateArenaLabel();
  }

  _openSettings(from) {
    this._settingsFrom = from;
    document.getElementById(from === 'pause' ? 'pause' : 'menu').classList.add('hidden');
    this.settingsPanel.open();
  }

  _closeSettings() {
    if (this._settingsFrom === 'pause') document.getElementById('pause').classList.remove('hidden');
    else document.getElementById('menu').classList.remove('hidden');
  }

  _applyTouchMenu() {
    const sb = document.getElementById('start-btn');
    if (sb) sb.textContent = 'TAP TO PLAY';
    document.body.classList.add('is-touch');
    const help = document.querySelector('.controls-help');
    if (help) help.innerHTML =
      '<span><b>Left stick</b> move</span><span><b>Drag right</b> look</span>' +
      '<span><b>FIRE</b> shoot</span><span><b>JUMP</b> / <b>RELOAD</b></span>' +
      '<span><b>SWAP</b> weapon</span>';
  }

  _ensureMusic() {
    if (this.music) return;
    this.audio.resume(); // creates the shared AudioContext
    try {
      this.music = new Music({ audioCtx: this.audio.ctx, volume: (this.settings.get('volume') || 0) * 0.45 });
      this.music.setEnabled((this.settings.get('volume') || 0) > 0.001);
    } catch (e) { this.music = null; }
  }

  _requestLock() {
    this.audio.resume();
    this._ensureMusic();
    // Touch devices have no pointer lock — start/resume directly.
    if (this.touch) {
      if (this.state === 'menu' || this.state === 'over') this._startRun();
      else if (this.state === 'paused') { this.state = 'playing'; this.hud.showPause(false); this.input.setEnabled(true); this.touchControls.setEnabled(true); }
      return;
    }
    try { this.controls.lock(); } catch (e) {}
  }

  _startRun() {
    this.hud.hideMenu(); this.hud.hideEnd();
    this.score = 0; this.hud.setScore(0);
    this.enemies.reset();
    this.pickups.reset();
    this.damageNumbers.reset();
    this.impacts.reset(); this.shake.reset(); this._hitStop = 0;
    this.grenadeMgr.reset();
    this.shop.reset();
    this.player.maxHealth = 100;
    this.combo = 0; this.comboTimer = 0; this.hud.hideCombo();
    this._mkCount = 0; this._mkTimer = 0; this._lowAnnounced = false;
    this.killstreaks.dispose(); this.killstreaks.reset();
    this.killFeed.clear(); this.dirDmg.clear();
    this.announcer.cancelAll();
    this.hud.hideBoss();
    this.player.spawn(this.world.playerSpawn);
    // Level the view for a fresh run (clear any leftover pitch/recoil).
    this.controls.pitch = 0; this.controls.setRecoil(0, 0);
    this.controls.update();
    this.weapons.reset();
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.showHud(true);
    this.minimap.setVisible(true);
    this.input.setEnabled(true);
    if (this.touch) this.touchControls.setEnabled(true);
    this.state = 'playing';
    this.enemies.endless = this.endlessMode === true;
    this.hud.setEndless(this.enemies.endless);
    if (this.music) { try { this.music.start(); } catch (e) {} }
    this.enemies.start();
  }

  _onPickup(type, amount) {
    if (type === 'health') {
      const healed = this.player.heal(amount);
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.message(healed > 0 ? `+${Math.round(healed)} HP` : 'HEALTH FULL', 900);
    } else {
      const took = this.weapons.addAmmo(amount);
      this.hud.message(took ? `+${amount} SHELLS` : 'AMMO FULL', 900);
    }
    this.audio.pickup();
  }

  _end(victory) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.input.setEnabled(false);
    this.touchControls.setEnabled(false);
    try { this.controls.unlock(); } catch (e) {}
    const newBest = this.score > this.best;
    if (newBest) { this.best = this.score; localStorage.setItem(HS_KEY, String(this.best)); }
    if (victory) this.audio.victory(); else this.audio.gameover();
    if (victory) this.announcer.victory(); else this.announcer.defeat();
    this.killFeed.clear();
    this.dirDmg.clear();
    this.killstreaks.dispose();
    this.hud.showHud(false);
    this.minimap.setVisible(false);
    this.hud.showEnd({ victory, score: this.score, best: this.best, newBest });
  }

  _applyTouchLook() {
    const { x, y } = this.input.consumeLook();
    const z = this._lookZoom;             // ADS steadies touch aim too
    const sens = this.settings.get('sensitivity'); // the slider now drives touch as well
    // Gentle one-frame smoothing damps Android touch jitter without adding much lag.
    this._tlx = (this._tlx || 0) * 0.35 + x * 0.65;
    this._tly = (this._tly || 0) * 0.35 + y * 0.65;
    if (Math.abs(this._tlx) < 1e-5 && Math.abs(this._tly) < 1e-5) return;
    // Feed deltas into the authoritative look model (clamped internally) — no
    // per-frame quaternion decomposition, so no gimbal jerk near vertical.
    this.controls.addYawPitch(-this._tlx * z * sens, -this._tly * z * sens);
  }

  // Accumulate a view kick from a shot. ADS reduces recoil (steadier aim).
  _applyRecoil(cfg, ads) {
    const mul = ads ? 0.6 : 1;
    const D = Math.PI / 180;
    this._recoilTarget.x += (cfg.pitch || 0) * D * mul;
    this._recoilTarget.y += (cfg.yaw || 0) * D * mul * (Math.random() < 0.5 ? -1 : 1);
  }

  // ADS blend (FOV zoom + centred viewmodel + steadier aim) and recoil apply/recovery.
  _updateAdsRecoil(dt) {
    const playing = this.state === 'playing';
    const wantAds = playing && this.input.ads && this.player && this.player.alive && !this.player.sprinting;
    if (wantAds !== this._adsPrev) { this.hud.setAds(wantAds); this._adsPrev = wantAds; }
    this.weapons.adsActive = wantAds;
    this._adsT += ((wantAds ? 1 : 0) - this._adsT) * Math.min(1, dt * 14);
    if (this._adsT < 0.0005) this._adsT = 0;

    // FOV zoom
    const ac = this.weapons.adsConfig;
    const fov = this._baseFov + (ac.fov - this._baseFov) * this._adsT;
    const cam = this.engine.camera;
    if (Math.abs(cam.fov - fov) > 0.02) { cam.fov = fov; cam.updateProjectionMatrix(); }

    // Centre the viewmodel toward the sightline while aiming.
    const g = this.weapons.current.group;
    g.position.x = 0.22 + (0.0 - 0.22) * this._adsT;
    g.position.y = -0.22 + (-0.135 - -0.22) * this._adsT;

    // Steady the aim: scale look sensitivity by the ADS zoom factor.
    const zoom = 1 + (ac.zoomMul - 1) * this._adsT;
    this._lookZoom = zoom;
    if (this.controls) this.controls.pointerSpeed = this.settings.get('sensitivity') * zoom;

    // Recoil: snap toward the accumulated target, then ease the target back to 0.
    const rl = Math.min(1, dt * 22);
    const nx = this._recoil.x + (this._recoilTarget.x - this._recoil.x) * rl;
    const ny = this._recoil.y + (this._recoilTarget.y - this._recoil.y) * rl;
    // Recoil is a transient additive view offset — the look model recovers exactly.
    this.controls.setRecoil(nx, ny);
    this._recoil.x = nx; this._recoil.y = ny;
    const rec = Math.min(1, dt * 8);
    this._recoilTarget.x += (0 - this._recoilTarget.x) * rec;
    this._recoilTarget.y += (0 - this._recoilTarget.y) * rec;
  }

  // World position of the nearest live zombie (for the directional damage arc).
  _nearestZombiePos() {
    let best = null, bd = Infinity;
    const p = this.engine.camera.position;
    for (const z of this.enemies.zombies) {
      if (!z.alive) continue;
      const d = z.group.position.distanceToSquared(p);
      if (d < bd) { bd = d; best = z; }
    }
    return best ? best.group.position : null;
  }

  // Radial AoE explosion (used by the Mortar killstreak): damage + FX, like a grenade.
  _explodeAt(pos, radius = 6, baseDmg = 170) {
    for (const z of this.enemies.zombies) {
      if (!z.alive) continue;
      const d = z.group.position.distanceTo(pos);
      if (d <= radius) {
        const f = 1 - d / radius;
        z.takeDamage(Math.max(40, Math.round(baseDmg * f * f + 30)), false);
      }
    }
    this.impacts.spawn(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xffa030, 5);
    this.shake.add(0.6);
    this._hitStop = Math.max(this._hitStop, 0.04);
    this.audio.explosion();
  }

  _loop() {
    requestAnimationFrame(this._loop);
    this.perf.begin();
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    let dt = rawDt;
    // hit-stop: briefly slow the world for a punchy impact (real time still elapses)
    if (this._hitStop > 0) { this._hitStop = Math.max(0, this._hitStop - rawDt); dt = rawDt * 0.08; }
    const t = this.clock.elapsedTime;

    this.world.update(t);

    if (this.state === 'playing') {
      if (this.touch) this._applyTouchLook();
      this.controls.update();   // compose fresh aim before movement reads it
      this.player.update(dt, this.input);
      this.weapons.update(dt, this.input.mouseDown);
      this.enemies.update(dt, t);
      this.pickups.update(dt, this.engine.camera.position);
      this.damageNumbers.update(dt);
      this.impacts.update(dt);
      this.shells.update(dt);
      this.grenadeMgr.update(dt);
      this.killstreaks.update(dt);
      this.dirDmg.update(dt);
      // Adaptive soundtrack: blend toward full combat with on-screen threat.
      if (this.music) {
        let threat = Math.min(1, this.enemies.zombies.length / 9);
        if (this.enemies.boss && this.enemies.boss.alive) threat = Math.max(threat, 0.9);
        const waveBoost = Math.min(0.2, this.enemies.wave * 0.025);
        const lowHp = (this.player.health / this.player.maxHealth) < 0.25 ? 0.15 : 0;
        this.music.setIntensity(Math.min(1, 0.18 + threat * 0.72 + waveBoost + lowHp));
      }
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) { this.combo = 0; this.hud.hideCombo(); }
      }
      if (this._mkTimer > 0) { this._mkTimer -= dt; if (this._mkTimer <= 0) this._mkCount = 0; }
      // low-health voice + heartbeat vignette
      const hpFrac = this.player.health / this.player.maxHealth;
      this.dirDmg.setLowHealth(hpFrac < 0.25 && this.player.alive);
      if (hpFrac < 0.25 && !this._lowAnnounced) { this.announcer.lowHealth(); this._lowAnnounced = true; }
      else if (hpFrac > 0.4) this._lowAnnounced = false;
      if (this.enemies.boss && this.enemies.boss.alive) this.hud.setBoss(this.enemies.boss.health / this.enemies.boss.maxHealth);
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.setStamina(this.player.stamina, this.player._exhausted);
      this.minimap.update(this.engine.camera, this.enemies.zombies, this.world.colliders);
      if (!this.player.alive) {
        // Self-Revive killstreak: spend it to get back up instead of dying.
        if (this.killstreaks.consumeRevive()) {
          this.player.alive = true;
          this.player.health = this.player.maxHealth * 0.5;
          this.player._regenT = 0;
          this.hud.message('SELF-REVIVE', 1600);
          this.announcer.say('Self revive', { priority: 2 });
        } else {
          this._end(false);
        }
      }
    }

    // Outside combat (menu/pause/over), let the soundtrack settle to a calm drone.
    if (this.music && this.state !== 'playing') this.music.setIntensity(0.0);

    // ADS zoom + recoil compose on top of look input (runs every frame so the
    // view eases back to base FOV when not aiming / not playing).
    this._updateAdsRecoil(dt);
    this.controls.update();   // bake look + recoil into the orientation we render

    // Screen shake: layer a transient offset onto the camera for THIS rendered
    // frame only, then revert it so physics/aim are never affected.
    const sh = this.shake.sample(rawDt);
    const cam = this.engine.camera;
    cam.position.x += sh.x; cam.position.y += sh.y; cam.position.z += sh.z;
    this.engine.render();
    cam.position.x -= sh.x; cam.position.y -= sh.y; cam.position.z -= sh.z;

    // Measure this frame + let the adaptive controller react.
    const frameMs = this.perf.end();
    this.perf.setQualityInfo(this.adaptive.info);
    this.adaptive.update(rawDt, frameMs);
  }
}
