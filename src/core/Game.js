import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Engine } from './Engine.js';
import { Warehouse } from '../world/Warehouse.js';
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

const COMBO_WINDOW = 3.0; // seconds between kills to keep a combo alive

const HS_KEY = 'fps-v2-highscore';

export class Game {
  constructor() {
    this.engine = new Engine(document.getElementById('game-canvas'));
    this.hud = new HUD();
    this.minimap = new Minimap(document.getElementById('hud'));
    this.input = new Input();
    this.audio = new Audio();
    this.touch = isTouchDevice();
    this.touchControls = new TouchControls(this.input, document.getElementById('game-container'));
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.controls = new PointerLockControls(this.engine.camera, this.engine.renderer.domElement);
    // Camera must live in the scene graph so the weapon viewmodel (a child of the
    // camera) gets rendered.
    this.engine.scene.add(this.engine.camera);

    this.state = 'menu';
    this.score = 0;
    this.best = Number(localStorage.getItem(HS_KEY) || 0);
    this.clock = new THREE.Clock();

    this._buildWorld();
    this._wireControls();

    // Settings (brightness/quality/sensitivity/volume) — apply before first frame.
    const container = document.getElementById('game-container');
    this.settings = new Settings(this);
    this.settingsPanel = new SettingsPanel(this.settings, container, () => this._closeSettings());
    this.settings.apply();

    this._wireButtons();

    this.hud.hideLoading();
    if (this.touch) this._applyTouchMenu();
    this.hud.showMenu(this.best);
    this.engine.camera.position.copy(this.world.playerSpawn);

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _buildWorld() {
    this.world = new Warehouse(this.engine.scene);
    this.player = new Player(this.engine.camera, this.world.colliders);
    this.weapons = new WeaponManager(this.engine.camera, this.engine.scene, this.audio, this.hud);
    this.enemies = new EnemyManager(this.engine.scene, this.player, this.world, this.audio);
    this.pickups = new PickupManager(this.engine.scene);
    this.pickups.onCollect = (type, amount) => this._onPickup(type, amount);
    this.damageNumbers = new DamageNumbers(this.engine.camera, document.getElementById('hud'));
    this.impacts = new Impacts(this.engine.scene, this.engine.camera);
    this.shake = new ScreenShake();
    this._hitStop = 0;
    this.grenadeMgr = new GrenadeManager(this.engine.scene, this.engine.camera, () => this.enemies.zombies, 24);
    this.grenadeMgr.onChange = (n) => this.hud.setGrenades(n);
    this.grenadeMgr.onExplode = (pos) => {
      this.impacts.spawn(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xffa030, 5);
      this.shake.add(0.7);
      this._hitStop = Math.max(this._hitStop, 0.05);
      this.audio.explosion();
    };
    this.combo = 0; this.comboTimer = 0;

    this.player.onHurt = () => { this.hud.flashDamage(); this.audio.hurt(); this.shake.add(0.4); };
    // Juice: shake on fire, sparks at impact points.
    this.weapons.onShoot = (type) => this.shake.add(
      { shotgun: 0.32, rifle: 0.30, smg: 0.10, pistol: 0.16 }[type] ?? 0.16);
    this.weapons.onImpact = (point, isZomb, headshot) => {
      const color = isZomb ? (headshot ? 0xffe24d : 0xff5a5a) : 0xffd27f;
      this.impacts.spawn(point, color, headshot ? 1.5 : (isZomb ? 1.1 : 0.9));
    };
    this.weapons.onHit = (z, headshot, point, dmg) => {
      this.hud.hitmark(headshot);
      if (point && dmg) this.damageNumbers.spawn(point, dmg, headshot);
      if (headshot) { this.score += 50; this.hud.message('HEADSHOT  +50', 700); this.hud.setScore(this.score); }
    };
    this.enemies.onWaveStart = (w) => { this.hud.setWave(w); this.hud.message(`WAVE ${w}`, 1500); this.audio.wave(); this.grenadeMgr.refill(); };
    this.enemies.onIntermission = (next, secs) => this.hud.message(`WAVE CLEARED — next in ${secs}`, 1100);
    this.enemies.onKill = (z, sc) => {
      // combo: each kill within the window raises the points multiplier (caps at 3x)
      this.combo++; this.comboTimer = COMBO_WINDOW;
      const mult = Math.min(3, 1 + (this.combo - 1) * 0.25);
      const award = Math.round(sc * mult);
      this.score += award; this.hud.setScore(this.score);
      if (this.combo >= 2) this.hud.setCombo(this.combo, mult);
      this.pickups.maybeDrop(z.group.position, z.variant);
      // hit-stop punch on kills (a touch longer on brutes)
      this._hitStop = Math.max(this._hitStop, z.variant === 'brute' ? 0.06 : 0.04);
      this.shake.add(0.12);
    };
    this.enemies.onVictory = () => this._end(true);
    this.enemies.onBossSpawn = (b) => {
      this.hud.showBoss(b.name || 'BOSS');
      this.hud.message('\u26a0  ' + (b.name || 'BOSS') + ' INCOMING', 2000);
      this.audio.wave();
      this.shake.add(0.6);
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
    document.getElementById('start-btn').addEventListener('click', () => this._requestLock());
    document.getElementById('resume-btn').addEventListener('click', () => this._requestLock());
    document.getElementById('restart-btn').addEventListener('click', () => { this.hud.hideEnd(); this._requestLock(); });
    const sm = document.getElementById('settings-btn');
    const sp = document.getElementById('settings-btn-pause');
    if (sm) sm.addEventListener('click', () => this._openSettings('menu'));
    if (sp) sp.addEventListener('click', () => this._openSettings('pause'));
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

  _requestLock() {
    this.audio.resume();
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
    this.combo = 0; this.comboTimer = 0; this.hud.hideCombo();
    this.hud.hideBoss();
    this.player.spawn(this.world.playerSpawn);
    this.weapons.reset();
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.showHud(true);
    this.minimap.setVisible(true);
    this.input.setEnabled(true);
    if (this.touch) this.touchControls.setEnabled(true);
    this.state = 'playing';
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
    this.hud.showHud(false);
    this.minimap.setVisible(false);
    this.hud.showEnd({ victory, score: this.score, best: this.best, newBest });
  }

  _applyTouchLook() {
    const { x, y } = this.input.consumeLook();
    if (!x && !y) return;
    const cam = this.engine.camera;
    this._euler.setFromQuaternion(cam.quaternion);
    this._euler.y -= x;
    this._euler.x -= y;
    const lim = Math.PI / 2 - 0.02;
    this._euler.x = Math.max(-lim, Math.min(lim, this._euler.x));
    cam.quaternion.setFromEuler(this._euler);
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    let dt = rawDt;
    // hit-stop: briefly slow the world for a punchy impact (real time still elapses)
    if (this._hitStop > 0) { this._hitStop = Math.max(0, this._hitStop - rawDt); dt = rawDt * 0.08; }
    const t = this.clock.elapsedTime;

    this.world.update(t);

    if (this.state === 'playing') {
      if (this.touch) this._applyTouchLook();
      this.player.update(dt, this.input);
      this.weapons.update(dt, this.input.mouseDown);
      this.enemies.update(dt, t);
      this.pickups.update(dt, this.engine.camera.position);
      this.damageNumbers.update(dt);
      this.impacts.update(dt);
      this.grenadeMgr.update(dt);
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) { this.combo = 0; this.hud.hideCombo(); }
      }
      if (this.enemies.boss && this.enemies.boss.alive) this.hud.setBoss(this.enemies.boss.health / this.enemies.boss.maxHealth);
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      this.hud.setStamina(this.player.stamina, this.player._exhausted);
      this.minimap.update(this.engine.camera, this.enemies.zombies, this.world.colliders);
      if (!this.player.alive) this._end(false);
    }

    // Screen shake: layer a transient offset onto the camera for THIS rendered
    // frame only, then revert it so physics/aim are never affected.
    const sh = this.shake.sample(rawDt);
    const cam = this.engine.camera;
    cam.position.x += sh.x; cam.position.y += sh.y; cam.position.z += sh.z;
    this.engine.render();
    cam.position.x -= sh.x; cam.position.y -= sh.y; cam.position.z -= sh.z;
  }
}
