// Minimap — rotating radar-style HUD overlay.
// Shows player facing, enemy positions, and level geometry in a circular view.

import { ARENA_HALF } from '../world/Warehouse.js';

const SIZE = 148;           // canvas px (CSS may down-scale on mobile)
const RADIUS = SIZE / 2 - 4;
const WORLD_R = ARENA_HALF + 2; // world-unit radius to fit in the circle
const SCALE = RADIUS / WORLD_R;

// Variant → blip colour
const BLIP_COLORS = {
  normal:   '#ff5252',
  runner:   '#bfff45',
  brute:    '#ff3d3d',
  spitter:  '#9fe04a',
  exploder: '#ff9b2e',
  boss:     '#ff0033',
};

export class Minimap {
  constructor(hudEl) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.width  = SIZE;
    this.canvas.height = SIZE;
    this.canvas.style.cssText =
      `position:absolute;top:14px;right:18px;width:${SIZE}px;height:${SIZE}px;` +
      'border-radius:50%;border:2px solid rgba(127,178,255,0.35);' +
      'background:rgba(6,12,22,0.55);pointer-events:none;z-index:6;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    hudEl.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  /** Call each frame.
   * @param {THREE.Camera} camera
   * @param {Zombie[]} zombies  — live enemy array
   * @param {THREE.Box3[]} colliders — level AABB list
   */
  update(camera, zombies, colliders) {
    const ctx = this.ctx;
    const cx = SIZE / 2, cy = SIZE / 2;

    // Player yaw: camera faces -Z in local space; getWorldDirection gives us that.
    const dir = camera.getWorldDirection(tmpV);
    const yaw = Math.atan2(dir.x, dir.z); // angle from +Z (forward)

    ctx.clearRect(0, 0, SIZE, SIZE);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS + 1, 0, Math.PI * 2);
    ctx.clip();

    // --- Grid rings (subtle) ---
    ctx.strokeStyle = 'rgba(127,178,255,0.10)';
    ctx.lineWidth = 1;
    for (let r = RADIUS * 0.33; r < RADIUS; r += RADIUS * 0.33) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- Level geometry (walls / colliders) ---
    const px = camera.position.x;
    const pz = camera.position.z;
    ctx.strokeStyle = 'rgba(180,195,215,0.30)';
    ctx.lineWidth = 1.4;
    for (const b of colliders) {
      this._drawBox(ctx, b, px, pz, yaw, cx, cy);
    }

    // --- Enemy blips ---
    for (const z of zombies) {
      if (!z.alive || z.dead) continue;
      const ep = z.group.position;
      const [sx, sy] = this._worldToMap(ep.x - px, ep.z - pz, yaw, cx, cy);
      // Only draw if inside the circle
      const dd = Math.hypot(sx - cx, sy - cy);
      if (dd > RADIUS - 2) continue;

      const col = BLIP_COLORS[z.variant] || BLIP_COLORS.normal;
      const isBrute = z.variant === 'brute';
      const r = isBrute ? 4.5 : 3;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // --- Player triangle (center, always points up = forward) ---
    ctx.fillStyle = '#7fb2ff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.closePath();
    ctx.fill();

    // Faint circle border inside clip
    ctx.strokeStyle = 'rgba(127,178,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /** Convert world-relative coords to minimap pixel coords, rotated by -yaw. */
  _worldToMap(dx, dz, yaw, cx, cy) {
    // Rotate so player's forward (camera -Z → dz negative) maps to screen-up.
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);
    const rx = dx * cos - dz * sin;
    const ry = dx * sin + dz * cos;
    return [cx + rx * SCALE, cy - ry * SCALE];
  }

  /** Draw a rotated AABB outline on the minimap. */
  _drawBox(ctx, box, px, pz, yaw, cx, cy) {
    const x0 = box.min.x - px, x1 = box.max.x - px;
    const z0 = box.min.z - pz, z1 = box.max.z - pz;
    const corners = [
      this._worldToMap(x0, z0, yaw, cx, cy),
      this._worldToMap(x1, z0, yaw, cx, cy),
      this._worldToMap(x1, z1, yaw, cx, cy),
      this._worldToMap(x0, z1, yaw, cx, cy),
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath();
    ctx.stroke();
  }

  setVisible(v) {
    this.canvas.style.display = v ? 'block' : 'none';
  }
}

// Reuse one vector to avoid GC
import * as THREE from 'three';
const tmpV = new THREE.Vector3();
