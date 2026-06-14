// Thin wrapper over the DOM HUD + overlays.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.hud = $('hud');
    this.scoreVal = $('score-val');
    this.waveVal = $('wave-val');
    this.healthFill = $('health-fill');
    this.healthText = $('health-text');
    this.staminaBar = $('stamina-bar');
    this.staminaFill = $('stamina-fill');
    this.ammoName = $('ammo-name');
    this.ammoMag = $('ammo-mag');
    this.ammoMax = $('ammo-max');
    this.ammoRes = $('ammo-res');
    this.combo = $('combo');
    this.bossBar = $('boss-bar');
    this.bossName = $('boss-name');
    this.bossFill = $('boss-fill');
    this.centerMsg = $('center-msg');
    this.hitmarker = $('hitmarker');
    this.vignette = $('damage-vignette');
    this._msgTimer = null;
  }

  showHud(v) { this.hud.classList.toggle('hidden', !v); }

  setScore(n) { this.scoreVal.textContent = n; }
  setWave(n) { this.waveVal.textContent = n; }
  setEndless(on) { const t = $('wave-total'); if (t) t.textContent = on ? ' \u221e' : ' / 5'; }
  setAds(on) { const c = $('crosshair'); if (c) c.classList.toggle('ads', !!on); }

  setHealth(h, max) {
    const pct = Math.max(0, Math.min(100, (h / max) * 100));
    this.healthFill.style.width = pct + '%';
    this.healthText.textContent = `${Math.ceil(h)}/${max} HP`;
    this.healthFill.style.background = pct > 50
      ? 'linear-gradient(90deg,#39d98a,#6ef0a8)'
      : pct > 25 ? 'linear-gradient(90deg,#e3b341,#f5d06b)'
      : 'linear-gradient(90deg,#e3493b,#ff7a6b)';
  }

  setStamina(frac, exhausted) {
    if (!this.staminaFill) return;
    this.staminaFill.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
    this.staminaBar.classList.toggle('full', frac >= 0.999);
    this.staminaBar.classList.toggle('exhausted', !!exhausted);
  }

  setAmmo(mag, max, reserve) {
    this.ammoMag.textContent = mag;
    this.ammoMax.textContent = max;
    if (this.ammoRes && reserve !== undefined) {
      this.ammoRes.textContent = isFinite(reserve) ? reserve : '∞';
    }
  }
  setWeapon(name) { if (this.ammoName) this.ammoName.textContent = name; }

  setGrenades(n) {
    if (!this._nade) this._nade = document.getElementById('nade-count');
    if (this._nade) this._nade.textContent = n;
  }

  showBoss(name) {
    if (!this.bossBar) return;
    if (this.bossName) this.bossName.textContent = name;
    if (this.bossFill) this.bossFill.style.width = '100%';
    this.bossBar.classList.add('show');
  }
  setBoss(frac) {
    if (this.bossFill) this.bossFill.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
  }
  hideBoss() { if (this.bossBar) this.bossBar.classList.remove('show'); }

  setCombo(count, mult) {
    if (!this.combo) return;
    this.combo.innerHTML = `<span class="combo-x">${count}\u00d7</span> COMBO <span class="combo-mult">\u00d7${mult.toFixed(2)} pts</span>`;
    this.combo.classList.add('show');
    // restart the pop animation each kill
    this.combo.classList.remove('pop'); void this.combo.offsetWidth; this.combo.classList.add('pop');
  }
  hideCombo() { if (this.combo) this.combo.classList.remove('show'); }

  message(text, holdMs = 1400) {
    this.centerMsg.textContent = text;
    this.centerMsg.classList.add('show');
    if (this._msgTimer) clearTimeout(this._msgTimer);
    if (holdMs > 0) this._msgTimer = setTimeout(() => this.centerMsg.classList.remove('show'), holdMs);
  }
  clearMessage() { this.centerMsg.classList.remove('show'); }

  hitmark(headshot = false, kill = false) {
    // Kill-confirm marker: bright/white, thicker bars, bigger pop. Otherwise the
    // usual gold (headshot) / red (body) tick.
    const color = kill ? (headshot ? '#ffe24d' : '#ffffff') : (headshot ? '#ffd34d' : '#ff5b5b');
    this.hitmarker.style.setProperty('--c', color);
    this.hitmarker.style.setProperty('--w', kill ? '4px' : '2px');
    this.hitmarker.classList.remove('show', 'kill');
    void this.hitmarker.offsetWidth; // restart animation
    this.hitmarker.classList.add('show');
    if (kill) this.hitmarker.classList.add('kill');
  }

  flashDamage() {
    this.vignette.style.opacity = '0.9';
    setTimeout(() => { this.vignette.style.opacity = '0'; }, 110);
  }

  setTacticals(n) {
    if (!this._flash) this._flash = document.getElementById('flash-count');
    if (this._flash) this._flash.textContent = n;
  }

  // Whites out the screen, then fades over a duration scaled by blind strength (0..1).
  flashbang(strength = 1) {
    const ov = this._flashOv || (this._flashOv = document.getElementById('flash-overlay'));
    if (!ov) return;
    const s = Math.max(0, Math.min(1, strength));
    if (s <= 0.02) return;
    if (this._flashRAF) cancelAnimationFrame(this._flashRAF);
    const dur = 500 + s * 2200;   // ms — stronger flash blinds longer
    const start = performance.now();
    const peak = 0.35 + 0.65 * s;
    const step = (now) => {
      const k = (now - start) / dur;
      if (k >= 1) { ov.style.opacity = '0'; this._flashRAF = null; return; }
      // brief full-white hold, then ease out
      const o = k < 0.12 ? peak : peak * Math.pow(1 - (k - 0.12) / 0.88, 1.6);
      ov.style.opacity = o.toFixed(3);
      this._flashRAF = requestAnimationFrame(step);
    };
    ov.style.opacity = peak.toFixed(3);
    this._flashRAF = requestAnimationFrame(step);
  }

  showMenu(best) {
    $('menu').classList.remove('hidden');
    $('menu-best').textContent = best > 0 ? best.toLocaleString() : '—';
  }
  hideMenu() { $('menu').classList.add('hidden'); }
  hideLoading() { const l = $('loading'); if (l) l.classList.add('hidden'); }

  showPause(v) { $('pause').classList.toggle('hidden', !v); }

  showEnd({ victory, score, best, newBest }) {
    $('endscreen').classList.remove('hidden');
    $('end-title').textContent = victory ? 'VICTORY' : 'GAME OVER';
    $('end-title').style.color = victory ? '#6ef0a8' : '#ff6b5e';
    $('end-sub').textContent = victory ? 'You cleared all 5 waves. The warehouse is contained.' : 'You were overrun.';
    $('end-score').textContent = score.toLocaleString();
    $('end-best').textContent = newBest ? '🏆 NEW BEST!' : `Best: ${best.toLocaleString()}`;
  }
  hideEnd() { $('endscreen').classList.add('hidden'); }
}
