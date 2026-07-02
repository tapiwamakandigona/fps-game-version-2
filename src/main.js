import { Game } from './core/Game.js';

function fail(msg) {
  const l = document.getElementById('loading');
  if (l) l.querySelector('.panel').innerHTML =
    `<h2>Could not start</h2><p class="tagline">${msg}</p>`;
  console.error('[FPS Arena]', msg);
}

// PWA: offline cache + installability (manifest.webmanifest). Registered after
// load so it never competes with the game boot for bandwidth.
window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});

window.addEventListener('DOMContentLoaded', () => {
  // basic WebGL check
  try {
    const c = document.createElement('canvas');
    if (!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))) {
      return fail('WebGL is not available in this browser.');
    }
  } catch (e) { return fail('WebGL is not available.'); }

  try {
    window.__game = new Game();
    console.log('[FPS Arena] started');
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  }
});
