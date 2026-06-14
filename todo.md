# FPS Arena v2 → "Call of Duty level" — Lead plan (Viktor)

Owner repo: tapiwamakandigona/fps-game-version-2 (buildless Three.js, deploys to GH Pages from main)
Requester: Lisa. Mandate: COD-level features + mechanics, lock 60fps, go above and beyond, coordinate subagents.

## Constraints
- NO build step. ES modules + import map only. No npm/Node. No binary assets (procedural only).
- Deploys from main → keep main always working. Validate every increment with tools/smoketest.py.
- Git identity: Tapiwa Makandigona <silentics.org@gmail.com>

## Validation
- [x] Headless smoke harness (tools/smoketest.py): boots, no errors, loop runs. (swiftshader fps not real-hw)
- [ ] Add CPU frame-time profiling to harness for perf regression checks
- [ ] In-game FPS/frame-time meter (real-hardware truth)

## Research (models)
- [ ] R1 Game design: what's missing for COD-level feel (gunplay, movement, progression, meta)
- [ ] R2 Performance: Three.js/WebGL techniques to lock 60fps in THIS codebase

## WAVE 1 — Performance foundation (lock 60fps)
- [ ] Weapon raycast: hit only a curated target list (zombies+world), not whole scene recursively
- [ ] Object-pool tracers / impacts / damage numbers
- [ ] Adaptive dynamic-resolution scaler targeting 60fps (auto pixel-ratio)
- [ ] Frustum-culled / distance-throttled zombie animation updates
- [ ] Shared per-variant zombie materials where possible
- [ ] In-game perf meter + dev overlay

## WAVE 2 — Core COD gunplay & movement
- [ ] ADS (aim down sights) + FOV zoom, hipfire bloom vs ADS accuracy
- [ ] Recoil patterns per weapon, weapon sway, sprint-out-to-fire delay
- [ ] Crouch + tactical slide + mantle
- [ ] Damage falloff + (optional) penetration

## WAVE 3 — Progression & meta
- [ ] Killstreaks (UAV/airstrike-style) earned by streak
- [ ] Kill feed + XP/level + announcer (SpeechSynthesis, buildless)
- [ ] Enhanced HUD pass

## WAVE 4 — AI, ordnance, audio polish
- [ ] Smarter enemy AI (separation/flanking, line-of-sight)
- [ ] Flashbang + smoke grenades
- [ ] Dynamic music intensity (WebAudio)

## Log
- 2026-06-14: cloned, audited all 24 src files, built smoke harness, baseline green.
