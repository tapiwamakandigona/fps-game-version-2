import * as THREE from 'three';

// All textures are generated procedurally on a <canvas> so the game ships with
// zero binary asset files (keeps it buildless + light). Each helper returns a
// THREE.CanvasTexture configured for tiling.

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, repeat = 1, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// fractal-ish value noise painted as semi-transparent specks
function speckle(ctx, size, count, alpha, minR, maxR, hueFn) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = minR + Math.random() * (maxR - minR);
    const a = alpha * (0.4 + Math.random() * 0.6);
    ctx.fillStyle = hueFn(a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function concreteTexture(repeat = 4, base = '#3a3f47') {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // grime + grain
  speckle(ctx, size, 1400, 0.06, 0.5, 2.2, (a) => `rgba(0,0,0,${a})`);
  speckle(ctx, size, 900, 0.05, 0.5, 2.0, (a) => `rgba(255,255,255,${a})`);
  // subtle large stains
  speckle(ctx, size, 18, 0.12, 14, 40, (a) => `rgba(20,18,14,${a})`);
  // panel seams
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const p = (i / 4) * size;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  return toTexture(c, repeat);
}

export function roughnessNoise(repeat = 4, mid = 180) {
  const size = 128;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${mid},${mid},${mid})`;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 1600, 0.4, 0.5, 2.5, (a) => `rgba(255,255,255,${a})`);
  speckle(ctx, size, 1600, 0.4, 0.5, 2.5, (a) => `rgba(0,0,0,${a})`);
  return toTexture(c, repeat, false);
}

export function metalTexture(repeat = 1, base = '#5a5e66') {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // brushed vertical streaks
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.04)`;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 6, size); ctx.stroke();
  }
  // rust patches
  speckle(ctx, size, 40, 0.18, 6, 26, (a) => `rgba(120,60,30,${a})`);
  speckle(ctx, size, 80, 0.10, 2, 8, (a) => `rgba(90,45,20,${a})`);
  // bolts at corners
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (const [x, y] of [[18,18],[size-18,18],[18,size-18],[size-18,size-18]]) {
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI*2); ctx.fill();
  }
  return toTexture(c, repeat);
}

export function crateTexture(base = '#7a5a32') {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // wood plank grain
  for (let p = 0; p < 4; p++) {
    const y0 = (p / 4) * size;
    ctx.fillStyle = p % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,230,180,0.05)';
    ctx.fillRect(0, y0, size, size / 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(size, y0); ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const y = Math.random() * size;
    ctx.strokeStyle = 'rgba(60,40,20,0.18)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(size*0.3, y+4, size*0.6, y-4, size, y); ctx.stroke();
  }
  // border frame
  ctx.strokeStyle = 'rgba(40,26,12,0.8)'; ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);
  return toTexture(c, 1);
}
