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

  hitmark(headshot = false) {
    this.hitmarker.style.setProperty('--c', headshot ? '#ffd34d' : '#ff5b5b');
    this.hitmarker.classList.remove('show');
    void this.hitmarker.offsetWidth; // restart animation
    this.hitmarker.classList.add('show');
  }

  flashDamage() {
    this.vignette.style.opacity = '0.9';
    setTimeout(() => { this.vignette.style.opacity = '0'; }, 110);
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
