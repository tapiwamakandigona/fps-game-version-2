# AI_CONTEXT — fps-game-version-2

Handoff notes so any AI/human can continue this build. Read this first.

## What this is
A ground-up rebuild of Jake's browser FPS ("FPS Arena v2"). Goal from Jake:
realistic, atmospheric **"Concept A" warehouse** look, **fully functional**, **one
level that makes sense**, with a real **win condition** (v1's big flaw was that it
had no win state). Build everything that makes sense for a polished single level.

## Hard constraint: NO build step
The dev sandbox has **no Node/npm**. So this project is deliberately **buildless**:
- Plain ES modules loaded directly by the browser.
- Three.js + addons come from a CDN via an **import map** in `index.html`.
- It deploys to **GitHub Pages** as static files — no bundler, no CI build.
Do **not** introduce Vite/webpack/TS that needs compiling, or Pages will break.

To test locally: `python3 -m http.server 8000` in repo root, open `http://localhost:8000`.
(Note: headless browsers can't grab pointer-lock, so mouse-look/WASD can't be
driven in automated tests — verify *rendering* + *console errors*, play-test by hand.)

## Tech
- Three.js r0.161 (`three` + `three/addons/` import map).
- Post-processing: EffectComposer → RenderPass → UnrealBloomPass → OutputPass.
- ACES Filmic tone mapping + sRGB output for the cinematic look.
- Procedural canvas textures (no binary asset files) for concrete/metal/crates.
- WebAudio-synth sound (no audio files) for shoot/hit/reload/hurt/wave.
- Controls: PointerLockControls (desktop). Touch controls = TODO (see below).

## File map (`src/`)
- `main.js` — bootstraps `Game`.
- `core/Engine.js` — renderer, scene, camera, fog, EffectComposer/bloom, resize.
- `core/Game.js` — state machine (menu/playing/paused/gameover/victory), main loop, wiring.
- `world/textures.js` — procedural concrete/metal/crate/floor textures.
- `world/Warehouse.js` — the level: floor, walls, pillars, crates, mezzanine, lights, colliders (Box3[]).
- `entities/Player.js` — movement, gravity/jump, capsule-vs-box collision, health.
- `entities/Zombie.js` — enemy mesh + seek/attack AI + health + hit/death.
- `entities/EnemyManager.js` — wave spawning + WIN condition (survive N waves → victory).
- `weapons/Pistol.js` — viewmodel, hitscan raycast, muzzle-flash PointLight, recoil, ammo/reload.
- `systems/Input.js` — keyboard/mouse state.
- `systems/Audio.js` — WebAudio procedural SFX.
- `ui/HUD.js` — DOM overlay: score, HP bar, ammo, wave, crosshair, center messages, menu + end screens.
- `ui/Minimap.js` — Canvas-based rotating radar minimap; shows player, enemy blips (color-coded by variant), and level geometry outlines.

## Level design (one level: "Warehouse — Containment")
Wave survival in a single enclosed warehouse. 5 waves, escalating zombie count/speed.
Clear all waves → **VICTORY**. Die → **GAME OVER**. High score persisted in localStorage.
This intentionally fixes v1's "endless level with unreachable victory()" bug.

## Status (shipped — see CHANGELOG.md + ROADMAP.md)
- v2.0 base game complete and live; v2.1 brightness + perf pass; v2.2 weapon system
  (Pistol + Shotgun, 1/2/wheel switch, tracer rounds); v2.3 enemy variants (runner/brute).
- Weapons now live in `weapons/Weapon.js` (generic hitscan, pellets + tracers) +
  `weapons/WeaponManager.js` (switching). The old `weapons/Pistol.js` is removed.
- Zombie variants: `entities/Zombie.js` takes opts.variant/scale/score; the mix is
  decided in `entities/EnemyManager.js` `_variantStats()`.
- DEVELOPMENT IS STUDIO-DRIVEN: pick the top unchecked ROADMAP.md item each cycle,
  ship ONE tested increment, deploy, keep the game bright + performant, never break main.
- Testing: the browser is REMOTE (can't hit sandbox localhost) — always test on the
  live Pages URL via window.__game internals (._startRun(), .weapons, .enemies).

## Conventions
- Keep it buildless and dependency-light. One concept per module. No secrets in repo.
- Git identity: Tapiwa Makandigona <silentics.org@gmail.com>.
