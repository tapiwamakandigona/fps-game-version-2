# Changelog

## v2.2 — Weapons & feedback
- New weapon system: switch between **Pistol** (auto, precise) and **Shotgun**
  (8-pellet spread, pump-action) with **1 / 2** keys or the **mouse wheel**.
- **Tracer rounds** + muzzle-origin bullet lines for clear shot feedback; per-pellet
  hitscan still respects cover (no shooting through walls).
- HUD shows the active weapon name + its magazine.

## v2.1 — Visibility & performance pass
- Brighter scene: tone-mapping exposure 1.0→1.35, lighter base materials, stronger
  ambient/hemisphere/sun + warmer lamp lights, thinner fog. The warehouse now reads
  clearly instead of being too dark.
- Performance: shadow map 2048→1024, half-resolution bloom, pixel-ratio clamp 2→1.5,
  far fewer shadow casters (walls/pillars/ceiling no longer cast; zombies cast from
  the torso only). Noticeably smoother on mid-range hardware.

## v2.0 — Initial release
- Buildless Three.js FPS: cinematic engine (ACES + bloom + fog + soft shadows),
  Concept-A atmospheric warehouse, pointer-lock player with collision, hitscan pistol
  (headshots, no shoot-through-cover), zombie AI, 5-wave survival with a real
  Victory / Game Over, HUD, menus, procedural WebAudio SFX, localStorage high score.
