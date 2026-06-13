# Changelog

## v2.14 — Enemy variety: Spitter & Exploder
- **Spitter** (sickly green, from wave 3) — hangs back at range and lobs glowing acid globs
  that arc toward you. They’re dodgeable, deal chip damage on hit, and the projectile pops on
  impact. Forces you to move instead of camping.
- **Exploder** (glowing orange, from wave 4) — fragile but *fast*; rushes you and detonates on
  contact for heavy radial-falloff damage. Shoot it before it reaches you and it still blows up
  where it dies — useful for chaining packs, dangerous up close.
- Both read at a glance: tinted bodies, an unstable orange pulse on exploders, and dedicated
  minimap blip colours (green spitter / orange exploder).

## v2.13 — More weapons: SMG, Rifle & Grenades
- **SMG** (key *3*) — fast full-auto, low per-shot damage, 30-round mag with a big reserve.
  Great for swarms.
- **Rifle** (key *4*) — slow, pinpoint semi-auto that hits like a truck (62 dmg, 2.4× on
  headshots). Rewards aim.
- **Throwable grenade** (key *G*, NADE button on mobile) — arcs and bounces, then explodes
  with radial falloff damage to everything nearby, a big boom, flash and screen shake. You get
  *3 per wave* (refilled each wave). Live count shown on the HUD.
- Each gun has its own viewmodel, muzzle-flash size, and screen-shake weight. Switch with
  *1–4* or the mouse wheel / SWAP button.

## v2.12 — Juice pass
- **Screen shake** — a trauma-based camera shake punches on every shot (bigger on the
  shotgun), when you take damage, when the boss arrives, and on kills. It's applied to the
  render frame only, so it never touches your aim or collisions.
- **Impact sparks** — every bullet now pops a little additive flash where it lands: warm
  sparks on walls/crates, red on a body hit, bright gold on a headshot.
- **Hit-stop** — a tiny time-freeze on kills (a touch longer on brutes, and a meaty one on
  the boss death) that makes each kill feel like it connects.

## v2.11 — Performance pass
- **Self-hosted, pinned Three.js core** (r0.161) served from the repo instead of a CDN —
  removes a runtime dependency on unpkg for the largest asset and pins the exact version so a
  CDN change can never break the build.
- **Instanced crates:** all crate stacks now render as a single `InstancedMesh` (one draw call
  instead of ~16) while keeping their colliders, shadows and bullet-blocking intact.

## v2.10 — Wave-5 boss: THE BUTCHER
- Wave 5 now spawns a **boss** — a massive, red-glowing brute (2600 HP) alongside the
  remaining horde. It hits hard and soaks a lot of fire.
- A dedicated **boss health bar** appears at the top of the screen while it's alive, with a
  "⚠ THE BUTCHER INCOMING" warning on spawn and "BOSS DOWN!" on the kill.
- Killing it is worth 1500 base points (× your current combo multiplier).

## v2.9 — Damage numbers + combo scoring
- **Floating damage numbers** pop off enemies on every hit (gold + larger for headshots).
  Shotgun pellets are now aggregated into a single number/hit-sound per blast instead of
  spamming 8.
- **Combo / kill-streak scoring:** chaining kills within 3s builds a combo that raises your
  points multiplier up to **3×**. A "N× COMBO" banner shows the live multiplier; it resets
  if you go too long without a kill.

## v2.8 — Game feel: stamina, view bob, landing
- **Sprint stamina:** sprinting now drains a stamina meter (new bar under your health),
  empties in ~4.5s, and you must recover to ~35% before sprinting again (no stutter-sprint).
  Bar turns amber when exhausted, dims when full.
- **View bob:** the camera (and weapon) bob naturally while walking, faster/deeper while
  sprinting — stops when you stand still. Purely visual, doesn't affect aim or collision.
- **Landing impact:** a springy camera dip when you land from a jump/fall, scaled by how
  hard you hit the ground.

## v2.7 — Minimap (2026-06-13)
- New **rotating minimap** in the top-right corner of the HUD, radar-style.
- **Player** shown as a blue triangle at center; the map rotates with the camera
  so "up" is always your facing direction.
- **Enemy blips** color-coded by variant: red (normal), yellow-green (runner),
  dark red (brute). Only alive enemies are shown.
- **Level geometry** (walls, pillars, crates, containers) rendered as grey outlines
  so you can orient yourself at a glance.
- Subtle **grid rings** for distance reference.
- Responsive: auto-shrinks on mobile/touch devices.
- Hidden during menus and end screens; only visible during gameplay.

## v2.6 — Health & ammo pickups
- Zombies now sometimes **drop pickups** on death: green **health** (+25 HP) or amber
  **ammo** (+8 shotgun shells). Brutes drop more often. Pickups glow, bob, spin, and
  fade out after ~14s; walk over them to collect (bullets pass through them).
- **Ammo economy:** the pistol keeps an **infinite reserve** (always-usable fallback so
  you can never fully soft-lock), while the **shotgun now has a finite reserve** (starts
  18, caps at 36) that you top up with ammo pickups. HUD shows the live reserve count.
- Pickup chime + on-screen "+25 HP / +8 SHELLS" feedback.

## v2.5 — Settings panel
- New **SETTINGS** panel (from the menu or pause): **Brightness** slider, **Quality**
  presets (**Low / Med / High** — Low drops bloom + shadows and pixel ratio so weak
  phones stay smooth), **Look sensitivity**, and **Volume**. All persist via localStorage.
- Phones default to the lighter **Med** preset on first run for a steady 60 FPS.

## v2.4 — Mobile support
- **Phones can play now.** On touch devices the game shows an on-screen *left
  virtual stick* (move), *drag the right side* to look, and *FIRE / JUMP / RELOAD /
  SWAP* buttons. Pointer-lock is skipped on touch — tap **TAP TO PLAY** to start.
- Movement is analog (push the stick further to sprint); look is smooth drag.
- Performance held at the 60 FPS target (draw calls + per-frame work benchmarked).

## v2.3 — Enemy variants
- Two new enemy types mixed into the waves: a fast, fragile **Runner** (yellow-green,
  from wave 2) and a slow, hulking **Brute** (dark red, high HP + heavy hits, from
  wave 3). Each is colour- and size-coded so you can read the threat instantly, and
  brutes are worth more points.

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
