// Between-wave upgrade shop. Spend SCORE on permanent (per-run) upgrades.
// The shop owns its DOM and the upgrade definitions; the Game wires apply()
// callbacks and tells it when to open/close.

export class UpgradeShop {
  constructor() {
    this.upgrades = [
      { id: 'vitality',  icon: '\u2764\ufe0f', name: 'VITALITY',   desc: '+25 max HP &amp; full heal',
        base: 450, growth: 1.55, level: 0, max: 6 },
      { id: 'firepower', icon: '\ud83d\udd25', name: 'FIREPOWER',  desc: '+15% weapon damage',
        base: 700, growth: 1.7, level: 0, max: 6 },
      { id: 'fasthands', icon: '\u26a1', name: 'FAST HANDS', desc: '-18% reload time',
        base: 550, growth: 1.6, level: 0, max: 4 },
      { id: 'munitions', icon: '\ud83d\udce6', name: 'MUNITIONS',  desc: '+30% ammo reserve (refill)',
        base: 500, growth: 1.55, level: 0, max: 5 },
      { id: 'demolition', icon: '\ud83d\udca3', name: 'DEMOLITION', desc: '+1 grenade per wave',
        base: 650, growth: 1.65, level: 0, max: 4 },
      { id: 'packapunch', icon: '✨', name: 'PACK-A-PUNCH', desc: 'Upgrade current weapon',
        base: 2500, growth: 1, level: 0, max: 4, fixed: true },
    ];
    this.onApply = null;       // (id) => void  — Game applies the effect
    this.onDeploy = null;      // () => void    — close shop, start next wave
    this.getScore = () => 0;   // () => number
    this.spendScore = () => {};// (cost) => void
    this.weaponName = () => 'WEAPON';   // current weapon name
    this.weaponPaP = () => false;       // is current weapon already Pack-a-Punch'd?
    this._build();
  }

  cost(u) { return u.fixed ? u.base : Math.round(u.base * Math.pow(u.growth, u.level)); }

  _build() {
    const root = document.createElement('div');
    root.id = 'shop';
    root.className = 'overlay hidden';
    root.innerHTML = `
      <div class="panel shop-panel">
        <h1>UPGRADE SHOP</h1>
        <h2 id="shop-sub">WAVE CLEARED</h2>
        <p class="shop-bank">SCORE: <span id="shop-score">0</span></p>
        <div id="shop-grid"></div>
        <button id="shop-deploy">DEPLOY \u2192 NEXT WAVE</button>
        <p class="shop-hint">Spend score now or bank it for a higher final score.</p>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.grid = root.querySelector('#shop-grid');
    this.scoreEl = root.querySelector('#shop-score');
    this.subEl = root.querySelector('#shop-sub');
    root.querySelector('#shop-deploy').addEventListener('click', () => { if (this.onDeploy) this.onDeploy(); });

    this.cards = {};
    for (const u of this.upgrades) {
      const card = document.createElement('button');
      card.className = 'shop-card';
      card.innerHTML = `
        <div class="shop-ic">${u.icon}</div>
        <div class="shop-info">
          <div class="shop-name">${u.name} <span class="shop-lv"></span></div>
          <div class="shop-desc">${u.desc}</div>
        </div>
        <div class="shop-cost"></div>`;
      card.addEventListener('click', () => this._buy(u));
      this.grid.appendChild(card);
      this.cards[u.id] = card;
    }
  }

  _buy(u) {
    if (u.level >= u.max) return;
    // Pack-a-Punch is per-weapon: block if the equipped weapon is already upgraded.
    if (u.id === 'packapunch' && this.weaponPaP()) return;
    const c = this.cost(u);
    if (this.getScore() < c) return;
    this.spendScore(c);
    u.level++;
    if (this.onApply) this.onApply(u.id);
    this.refresh();
  }

  // Update score + all card states (called on open and after each buy).
  refresh() {
    const score = this.getScore();
    this.scoreEl.textContent = score;
    for (const u of this.upgrades) {
      const card = this.cards[u.id];
      const c = this.cost(u);
      if (u.id === 'packapunch') {
        // Dynamic per-weapon card: reflects the currently equipped weapon.
        const done = this.weaponPaP();
        card.querySelector('.shop-desc').textContent = `Upgrade ${this.weaponName()}: +60% dmg, +50% mag`;
        card.querySelector('.shop-lv').textContent = u.level > 0 ? `\u00d7${u.level}` : '';
        card.querySelector('.shop-cost').textContent = done ? 'DONE' : c;
        const afford = !done && score >= c;
        card.classList.toggle('maxed', done);
        card.classList.toggle('afford', afford);
        card.classList.toggle('locked', !done && !afford);
        continue;
      }
      const maxed = u.level >= u.max;
      card.querySelector('.shop-lv').textContent = u.level > 0 ? `Lv ${u.level}` : '';
      card.querySelector('.shop-cost').textContent = maxed ? 'MAX' : c;
      const afford = !maxed && score >= c;
      card.classList.toggle('maxed', maxed);
      card.classList.toggle('afford', afford);
      card.classList.toggle('locked', !maxed && !afford);
    }
  }

  open(nextWave) {
    this.subEl.textContent = `WAVE CLEARED \u2014 NEXT: WAVE ${nextWave}`;
    this.refresh();
    this.root.classList.remove('hidden');
  }

  close() { this.root.classList.add('hidden'); }

  // Reset levels for a brand-new run.
  reset() { for (const u of this.upgrades) u.level = 0; }
}
