# FPS Arena v2 — Studio Roadmap

This repo is developed "studio-style": a recurring autonomous dev loop picks the
top unchecked item below, implements + tests it on the live build, then checks it
off and logs it in `CHANGELOG.md`. Add new ideas to the backlog freely.

## Done (v2.0 — initial release)
- [x] Buildless Three.js architecture (ES modules + CDN import map, no bundler)
- [x] Cinematic engine: ACES tone mapping, sRGB, UnrealBloom, FogExp2, soft shadows
- [x] Concept A warehouse level (PBR concrete/metal, crates, containers, lamp lighting)
- [x] Player: pointer-lock look, WASD+sprint+jump, circle-vs-AABB collision, HP + regen
- [x] Hitscan pistol: muzzle flash, recoil, reload, headshots, no shoot-through-cover
- [x] Zombie AI: seek + attack, hit-flash, topple death, headshot tagging
- [x] 5-wave survival loop with scaling difficulty + **real Victory / Game Over**
- [x] HUD, menus, procedural WebAudio SFX, localStorage high score

## Backlog (priority order — top item is next)
- [x] v2.1 Brightness + visibility pass (exposure/fog/lighting so the level reads clearly)
- [x] v2.1 Performance pass (shadow map size, bloom res, pixel-ratio clamp, fewer shadow casters)
- [x] v2.2 Tracer rounds + muzzle-origin bullet feedback
- [x] v2.2 Second weapon (shotgun, 8-pellet spread) + 1/2 + mouse-wheel switching
- [x] v2.5 In-game brightness slider + quality presets (Low/Med/High)
- [x] v2.6 Health/ammo pickups dropped by zombies (finite shotgun reserve)
- [ ] Minimap / enemy direction indicators on the HUD
- [ ] Sprint stamina + view bob + landing impact for game feel
- [ ] Damage numbers floating off enemies; kill streak / combo scoring
- [x] v2.3 "Runner" (fast, low HP) + "Brute" (slow, tanky, high-damage) zombie variants
- [ ] Boss on wave 5 (port/upgrade the v1 BossEnemy idea) with a health bar
- [x] v2.5 Settings panel: brightness, quality, look sensitivity, volume (persisted)
- [x] v2.4 Mobile/touch controls (virtual stick + fire button)
- [ ] Performance: instanced meshes for crates, frustum-culled zombie updates
- [ ] Reduce first-load by self-hosting a pinned Three.js build instead of CDN

## Research log
- (entries appended by the studio loop: graphics techniques, references, decisions)
