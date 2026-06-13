import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Engine } from './Engine.js';
import { Warehouse } from '../world/Warehouse.js';
import { Player } from '../entities/Player.js';
import { WeaponManager } from '../weapons/WeaponManager.js';
import { EnemyManager, TOTAL_WAVES } from '../entities/EnemyManager.js';
import { Input } from '../systems/Input.js';
import { TouchControls, isTouchDevice } from '../systems/TouchControls.js';
import { Audio } from '../systems/Audio.js';
import { HUD } from '../ui/HUD.js';

const HS_KEY = 'fps-v2-highscore';

export class Game {
  constructor() {
    this.engine = new Engine(document.getElementById('game-canvas'));
    this.hud = new HUD();
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

    this.player.onHurt = () => { this.hud.flashDamage(); this.audio.hurt(); };
    this.weapons.onHit = (z, headshot) => {
      this.hud.hitmark(headshot);
      if (headshot) { this.score += 50; this.hud.message('HEADSHOT  +50', 700); this.hud.setScore(this.score); }
    };
    this.enemies.onWaveStart = (w) => { this.hud.setWave(w); this.hud.message(`WAVE ${w}`, 1500); this.audio.wave(); };
    this.enemies.onIntermission = (next, secs) => this.hud.message(`WAVE CLEARED — next in ${secs}`, 1100);
    this.enemies.onKill = (z, sc) => { this.score += sc; this.hud.setScore(this.score); };
    this.enemies.onVictory = () => this._end(true);

    this.input.onReload = () => { if (this.state === 'playing') this.weapons.reload(); };
    this.input.onShoot = () => { if (this.state === 'playing') this.weapons.fire(); };
    this.input.onSwitch = (i) => { if (this.state === 'playing') this.weapons.switchTo(i); };
    this.input.onSwitchNext = () => { if (this.state === 'playing') this.weapons.next(); };
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
    this.player.spawn(this.world.playerSpawn);
    this.weapons.reset();
    this.hud.setHealth(this.player.health, this.player.maxHealth);
    this.hud.showHud(true);
    this.input.setEnabled(true);
    if (this.touch) this.touchControls.setEnabled(true);
    this.state = 'playing';
    this.enemies.start();
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
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    this.world.update(t);

    if (this.state === 'playing') {
      if (this.touch) this._applyTouchLook();
      this.player.update(dt, this.input);
      this.weapons.update(dt, this.input.mouseDown);
      this.enemies.update(dt, t);
      this.hud.setHealth(this.player.health, this.player.maxHealth);
      if (!this.player.alive) this._end(false);
    }

    this.engine.render();
  }
}
