// On-screen controls for touch devices: left virtual stick (move), right-side
// drag-to-look, and FIRE / JUMP / RELOAD / SWAP buttons. Feeds the shared Input.
export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
}

export class TouchControls {
  constructor(input, container) {
    this.input = input;
    this.lookSens = 0.0040;
    this.joyR = 56;          // stick max travel (px)
    this.joyId = null;
    this.lookId = null;
    this._lookX = 0; this._lookY = 0;
    this._build(container);
    this.setEnabled(false);
  }

  _build(container) {
    const root = document.createElement('div');
    root.id = 'touch-ui';
    root.innerHTML = `
      <div id="look-pad"></div>
      <div id="joystick"><div id="joy-knob"></div></div>
      <div id="touch-buttons">
        <button id="t-swap" class="t-btn t-small">SWAP</button>
        <button id="t-nade" class="t-btn t-small">NADE</button>
        <button id="t-reload" class="t-btn t-small">RELOAD</button>
        <button id="t-jump" class="t-btn t-small">JUMP</button>
        <button id="t-fire" class="t-btn t-fire">FIRE</button>
      </div>`;
    container.appendChild(root);
    this.root = root;
    this.lookPad = root.querySelector('#look-pad');
    this.joy = root.querySelector('#joystick');
    this.knob = root.querySelector('#joy-knob');
    this._wire();
  }

  setEnabled(v) {
    this.enabled = v;
    this.root.style.display = v ? 'block' : 'none';
    if (!v) { this._resetJoy(); this.input.axisX = 0; this.input.axisZ = 0; this.input.touchSprint = false; this.input.setJump(false); this.input.fireUp(); }
  }

  _resetJoy() {
    this.joyId = null;
    this.input.axisX = 0; this.input.axisZ = 0; this.input.touchSprint = false;
    if (this.knob) this.knob.style.transform = 'translate(-50%,-50%)';
  }

  _findTouch(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }

  _wire() {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

    // --- joystick ---
    const joyRect = () => this.joy.getBoundingClientRect();
    this.joy.addEventListener('touchstart', (e) => {
      stop(e);
      if (this.joyId !== null) return;
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      this._joyMove(t, joyRect());
    }, { passive: false });
    this.joy.addEventListener('touchmove', (e) => {
      stop(e);
      const t = this._findTouch(e.changedTouches, this.joyId);
      if (t) this._joyMove(t, joyRect());
    }, { passive: false });
    const joyEnd = (e) => {
      if (this._findTouch(e.changedTouches, this.joyId)) this._resetJoy();
    };
    this.joy.addEventListener('touchend', joyEnd);
    this.joy.addEventListener('touchcancel', joyEnd);

    // --- look pad ---
    this.lookPad.addEventListener('touchstart', (e) => {
      stop(e);
      if (this.lookId !== null) return;
      const t = e.changedTouches[0];
      this.lookId = t.identifier;
      this._lookX = t.clientX; this._lookY = t.clientY;
    }, { passive: false });
    this.lookPad.addEventListener('touchmove', (e) => {
      stop(e);
      const t = this._findTouch(e.changedTouches, this.lookId);
      if (!t) return;
      const dx = t.clientX - this._lookX, dy = t.clientY - this._lookY;
      this._lookX = t.clientX; this._lookY = t.clientY;
      this.input.addLook(dx * this.lookSens, dy * this.lookSens);
    }, { passive: false });
    const lookEnd = (e) => { if (this._findTouch(e.changedTouches, this.lookId)) this.lookId = null; };
    this.lookPad.addEventListener('touchend', lookEnd);
    this.lookPad.addEventListener('touchcancel', lookEnd);

    // --- buttons ---
    const fire = this.root.querySelector('#t-fire');
    fire.addEventListener('touchstart', (e) => { stop(e); this.input.fireDown(); });
    fire.addEventListener('touchend', (e) => { stop(e); this.input.fireUp(); });
    fire.addEventListener('touchcancel', () => this.input.fireUp());

    const jump = this.root.querySelector('#t-jump');
    jump.addEventListener('touchstart', (e) => { stop(e); this.input.setJump(true); });
    jump.addEventListener('touchend', (e) => { stop(e); this.input.setJump(false); });
    jump.addEventListener('touchcancel', () => this.input.setJump(false));

    this.root.querySelector('#t-reload').addEventListener('touchstart', (e) => { stop(e); this.input.triggerReload(); });
    this.root.querySelector('#t-swap').addEventListener('touchstart', (e) => { stop(e); this.input.triggerSwap(); });
    this.root.querySelector('#t-nade').addEventListener('touchstart', (e) => { stop(e); if (this.input.onGrenade) this.input.onGrenade(); });
  }

  _joyMove(t, rect) {
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, this.joyR);
    const nx = (dx / len), ny = (dy / len);
    const kx = nx * clamped, ky = ny * clamped;
    this.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    this.input.axisX = nx * (clamped / this.joyR);
    this.input.axisZ = -ny * (clamped / this.joyR);   // up = forward
    this.input.touchSprint = (clamped / this.joyR) > 0.92;
  }
}
