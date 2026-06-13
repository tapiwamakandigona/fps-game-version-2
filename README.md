# FPS Arena v2 — Warehouse: Containment

A realistic, atmospheric browser FPS built with **Three.js**. Survive 5 escalating
waves of zombies in an industrial warehouse and clear them all to win.

## Play
Live: enable GitHub Pages on this repo (Settings → Pages → Deploy from `main` / root).
Then open the Pages URL.

## Run locally
No build step. Just serve the folder:

```
python3 -m http.server 8000
# open http://localhost:8000
```

## Controls
WASD move · Mouse look · Click shoot · R reload · Shift sprint · Space jump · Esc pause

## Tech
- Buildless ES modules; Three.js r0.161 loaded from CDN via an import map.
- ACES filmic tone mapping + UnrealBloom + fog for the cinematic look.
- Procedural canvas textures and WebAudio sound — zero binary assets.

See `AI_CONTEXT.md` for architecture and the file map.
