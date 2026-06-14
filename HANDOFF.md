# FPS Game Version 2 — Handoff / State of the Project

This document is for whoever (human or AI) continues this game. It captures the goal,
architecture, hard constraints, how to build/test/deploy, everything done so far, and the
open threads. Read this fully before changing anything.

---

## 1. Goal & context

Owner: **Lisa Bentely**. The ask: take this browser FPS to "**Call of Duty level**" —
go above & beyond on game feel, mechanics, animations, and polish, while **locking 60fps
on mid/low-end phones**. Work is iterative; Lisa tests on both desktop (mouse) and Android
(touch) and is very sensitive to control *feel*.

Live game: **https://tapiwamakandigona.github.io/fps-game-version-2/**

---

## 2. Hard constraints (DO NOT BREAK THESE)

These are architectural commitments. Breaking them breaks the whole approach.

1. **Buildless.** Plain ES modules loaded directly in the browser via an import map in
   `index.html` (`import * as THREE from 'three'`, Three.js r0.161 from a CDN). There is
   **no npm, no Node, no bundler, no build step**. You edit a `.js` file and it ships.
   (`node --check` is not available in the dev environment either.)
2. **No binary assets.** All textures are generated procedurally on a `<canvas>`; all audio
   is synthesized live with the WebAudio API (`src/systems/Audio.js`). There are **no image,
   model, or audio files** in the repo, by design. This keeps load instant and dependency-free.
3. **Mobile performance is the budget.** Must hold ~60fps on modest Android phones. There's
   an adaptive quality system (`src/systems/Perf.js`) and quality presets (low/med/high),
   pixelRatio clamped to 1.5. Every feature must respect this.

If a future feature seems to require breaking #1 or #2 (e.g. imported 3D models / mocap),
that is a **major architecture decision** — flag it to Lisa, don't just do it. See §8.

---

## 3. Repo, branches, deploy

- Cloned/working at the repo root (this file's directory).
- **Branches:**
  - `main` — what GitHub Pages serves. Keep it always-deployable.
  - `feat/cod-overhaul` — feature branch where work happens.
- **Deploy workflow (every change):**
  1. Work + commit on `feat/cod-overhaul`.
  2. `git checkout main && git merge --no-ff feat/cod-overhaul`.
  3. Smoke-test `main` (see §5).
  4. `git push origin main` **and** `git push origin feat/cod-overhaul` (keep both in sync).
  5. Pages auto-builds. Poll the Pages API until `status == "built"`, then curl the live
     files to confirm the new code is served.
- **Bump the build stamp every deploy:** `BUILD` const at the top of `src/core/Game.js`
  (e.g. `'v12 · 2026-06-14'`). It renders faint in the bottom-right corner as
  `build vN · DATE`.

### ⚠️ GitHub Pages caching gotcha (important — caused repeated "ghost bug" reports)
Pages serves files (including `index.html`) with a ~10-minute cache. A tester who reloads
right after a deploy gets **stale code** and re-reports already-fixed bugs. The `build vN`
stamp exists so a tester can confirm they're current. If they don't see the latest N, tell
them to **hard-refresh (Ctrl+Shift+R)** / clear cached files / wait ~10 min. Always suspect
caching first when a "fixed" bug reappears — but still verify the fix is genuinely live.

---

## 4. Architecture map (where things live)

`src/core/Game.js` is the conductor — it owns the engine, world, player, weapons, enemies,
shop, killstreaks, announcer, kill feed, directional damage, music, HUD, controls, and shells,
and runs the main loop.

**Main loop `_loop()` order while playing (order matters):**
`_applyTouchLook()` → `controls.update()` → `player.update(dt,input)` →
set `weapons.current._sprint` → `weapons.update(dt, mouseDown)` →
enemies / pickups / damage numbers / impacts / `shells.update` / grenades / killstreaks /
directional damage → music → `_updateAdsRecoil(dt)` → `controls.update()` (bakes recoil) →
screen shake (positional only) → render.

Key modules:
- `src/systems/LookControls.js` — **authoritative** first-person look. We replaced
  Three's `PointerLockControls` because composing recoil/touch on top of it forced repeated
  quaternion→euler→quaternion round-trips that snap near vertical (the old "jerk when looking
  down" bug). Here **yaw & pitch are plain scalars (single source of truth); we only ever
  COMPOSE a quaternion, never read one back.** Recoil is a transient additive offset, so aim
  recovers with zero drift. `PITCH_LIMIT ≈ 87.7°`. Also contains **mouse spike rejection**
  (see §6) for the Chromium pointer-lock giant-delta bug. API: `yaw/pitch/pointerSpeed/
  isLocked/lock()/unlock()/addEventListener/addYawPitch/setRecoil/update/syncFromCamera/dispose`.
- `src/weapons/Weapon.js` — per-weapon model (procedural meshes), fire/recoil/spread/ADS,
  and **viewmodel animation**: reload (two-beat mag-swap), idle breathing sway, **sprint
  pose** (lowers/cants the gun, eased via `_sprintBlend`), **equip raise-up** (`onEquip()`
  sets `_equipT`). All animation uses **rotation + position.z only** — ADS owns position x/y,
  so they never fight. `onShoot` fires once per shot (wired to shake + shell ejection).
- `src/weapons/WeaponManager.js` — holds the weapons, `switchTo(i)` (calls `onEquip()`),
  sets `current._ads`, relays onShoot/onHit/onRecoil/onImpact, owns the shared tracer pool.
- `src/entities/Player.js` — movement, sprint + stamina, crouch + slide, view bob, landing
  dip. Has **no audio reference**; emits a `this.onFootstep(intensity)` callback on each
  foot-plant (Game wires it to `audio.footstep`). `constructor(camera, colliders)`.
- `src/enemies/EnemyManager.js` + `Zombie.js` — wave spawning (boss every 5th wave),
  enemy variants (spitter / exploder / boss / melee / brute), stun state.
- `src/systems/`:
  - `Audio.js` — WebAudio synth. Helpers `_env`/`_noise`/`_tones`. Sounds: shoot/explosion/
    empty/reload/hit/killConfirm/hurt/pickup/wave/victory/gameover/**footstep**.
  - `Music.js` — adaptive layered synth music.
  - `Input.js` / `TouchControls.js` — keyboard+mouse / on-screen touch (joystick + buttons).
  - `Perf.js` — `PerfMeter` + `AdaptiveQuality` (drops quality if fps sags).
  - `Announcer.js`, `Killstreaks.js`, `ScreenShake.js`, `ShellEjector.js` (pooled brass),
    `Settings.js`.
- `index.html` — HUD (`#ammo` block: weapon name/counts/reserve/nade/flash), menu / pause /
  end-screen overlays, fullscreen button + in-game `⛶` toggle (`.touch-only`), `#build-tag`.
- `styles.css` — desktop + `body.is-touch` mobile rules. On touch: compact ammo readout
  docked bottom-centre; touch button grid hugs the lower-right; top utility row clears the
  minimap. Touch button size classes `.t-mini`/`.t-small`/`.t-fire`.

Settings DEFAULTS: brightness 1.35, quality high, sensitivity 1.0, volume 0.5, FOV 90.

---

## 5. Test tooling (no unit-test framework — Playwright smoke/integration)

All in `tools/`. Run with: `uv run --project /work python tools/<name>.py`
(They spin up `python -m http.server` on a random port and drive headless Chromium with
SwiftShader: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.)

- `tools/smoketest.py --seconds N` → JSON `{ ok, console_errors, page_errors }`. Run this on
  `main` before every push. Expect `ok True` and empty error arrays.
- `tools/combattest.py` → `{ pass: true }` — boots a run, fires, confirms hits/kills work.
- `tools/metatest.py` → exercises meta systems (Pack-a-Punch / endless).
- `tools/looktest.py` → look-jerk regression → `{ jerkFree: true }`. Run after any
  LookControls change.

**Ad-hoc test pattern** (used heavily during dev — write a throwaway script in a temp dir):
http.server on random port + Playwright; `window.__game` is the live `Game`; `g._startRun()`
enters play. For mobile UI: `browser.new_context(has_touch=True, is_mobile=True)` at landscape
phone sizes (e.g. 844×390, 800×360, 915×412), then in-page add `body.is-touch` and call
`g.touchControls.setEnabled(true)`. **Gotcha:** read the camera forward vector from
`cam.quaternion` directly — `matrixWorld` is stale between manual `controls.update()` calls.
Clean up throwaway scripts/screenshots afterward.

**Poll Pages build (needs a GitHub token):**
`GET https://api.github.com/repos/tapiwamakandigona/fps-game-version-2/pages/builds/latest`
with `Authorization: Bearer <token>`; wait until `status == "built"` (usually 1–2 polls of
~12s), then curl the live `src/...` files to confirm the new code is served.

---

## 6. The two "feel" bugs that drove a lot of work (root causes + fixes)

1. **"Jerk when looking up/down" (constant, near-vertical).** Root cause: `PointerLockControls`
   euler round-trip instability near the poles. **Fixed** by rewriting look as `LookControls`
   with authoritative yaw/pitch scalars (never decompose the quaternion). Confirmed jerk-free
   through the poles, including while firing.
2. **"Pointer occasionally JUMPS during slow look while standing still"** (intermittent — this
   is different from #1). Root cause: a **Chromium pointer-lock bug** where `movementX/Y`
   sporadically reports a single huge delta. Synthetic tests with uniform input never hit it.
   **Fixed** in `LookControls._onMouseMove` with **adaptive spike rejection**: track an EMA of
   recent per-event delta magnitude; cap each event to `ceiling = min(300, max(45, ema*6))`.
   An isolated spike gets clamped (measured ~103° teleport → ~7° blip, ~15× reduction) while a
   genuine fast flick passes at ~93% (only the first 1–2 events soften). Raw 1:1 feel otherwise.
   **As of last contact, Lisa had NOT yet confirmed this resolved it on a fresh load — follow up.**

---

## 7. Work completed (waves 1–12, all merged to `main` and live)

1–7 (foundation/feel): perf pass (raycast target list, tracer pool, impacts, `Perf.js`);
ADS + recoil + spread + damage falloff; crouch + slide; Announcer / KillFeed / DirectionalDamage
/ Killstreaks; Pack-a-Punch + Endless mode; adaptive Music + DamageNumbers + dynamic crosshair;
FOV slider (default 90); flashbang; **LookControls rewrite** + Android touch redesign + reload
animation + idle sway.
8. **Kill-confirm** — elimination hitmarker (`HUD.hitmark(headshot,kill)`) + `Audio.killConfirm` ding.
9. **Brass shell-casing ejection** — `ShellEjector` (18 pooled casings, gravity + one floor bounce + fade).
10. **Mobile UI polish + fullscreen + build stamp + mouse spike rejection** — compact
    bottom-centre ammo, tightened touch cluster clear of the minimap (tested at 3 phone sizes,
    informed by real mobile-shooter layouts), menu + in-game fullscreen toggle + auto-enter on
    touch start, `BUILD` stamp, and the §6.2 spike fix.
11. **Sprint + equip animations** — weapon lowers/cants while sprinting (eased); quick raise-up
    when a weapon is drawn. Viewmodel-only (no aim effect).
12. **Footstep audio** — `Audio.footstep(intensity)` (soft low-passed noise scuff + faint low
    thud) fired per foot-plant from `Player.onFootstep`; quicker + louder when sprinting,
    silent when idle/crouched.

---

## 8. Open threads / what to do next

- **Confirm the mouse spike-fix with Lisa** on a hard-refreshed load (§6.2). Top priority —
  it's her main concern.
- **AI 3D / mocap tooling research (requested by Lisa):** SCAIL 2, VideoMDM, AnchorWorld,
  World Tracing, MeshFlow — tools for generating 3D meshes / transferring motion / first-person
  world sim. **Tension to resolve before adopting any:** they produce **binary assets**
  (meshes, mocap, textures) which directly conflict with constraints §2.1 (buildless) and
  §2.2 (no binary assets), and would threaten the mobile-60fps budget (§2.3). The honest path
  is likely: keep the shipping game procedural/buildless, and only consider these for a separate
  higher-fidelity branch/build with a real asset pipeline — or borrow their *ideas* (motion
  curves, layout) to improve our procedural animation without importing heavy assets. (A written
  assessment was being prepared for Lisa.)
- **Possible future polish ideas** (all must respect §2): enemy hit-flinch/death animations,
  weapon-bob synced more tightly to footsteps, landing thud audio, more weapon variety,
  objective/mutator modes.

---

## 9. Conventions & gotchas summary

- Viewmodel animations: use **rotation + position.z only** (ADS owns position x/y).
- `Player` has no audio — communicate via callbacks (`onFootstep`, `onSlide`, etc.).
- Read camera forward from `cam.quaternion` in tests (matrixWorld is stale between updates).
- Always bump `BUILD`, smoke-test `main`, push **both** branches, and verify live after deploy.
- Suspect Pages caching first when a fixed bug "reappears" — but verify the fix is truly live.
