#!/usr/bin/env python3
"""Functional combat test: verifies the curated-target raycast still hits enemies
and world geometry. Aims the camera at a spawned zombie, fires, and checks damage
was dealt; then aims at a wall and checks an impact/tracer was produced.
Exit 0 on pass."""
import json, sys, threading, http.server, socketserver, functools, os, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8732

def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    globals()["ACTUAL_PORT"] = httpd.server_address[1]
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

PROBE = r"""
() => {
  const g = window.__game;
  const out = { steps: [] };
  g._startRun();
  // force-spawn a zombie right in front of the camera by aiming at the nearest one
  const cam = g.engine.camera;
  // run a few enemy updates so at least one zombie exists
  for (let i=0;i<3;i++) g.enemies.update(0.4, i);
  let z = g.enemies.zombies.find(z => z.alive);
  if (!z) { out.error = 'no zombie spawned'; return out; }
  // teleport zombie 6m in front and aim at its head
  const THREE = g.engine.camera.parent ? null : null;
  z.group.position.set(cam.position.x, 0, cam.position.z - 6);
  // aim camera straight along -Z at the zombie head height
  cam.lookAt(z.group.position.x, 1.6, z.group.position.z);
  // flush world matrices (the render loop normally does this every frame)
  g.engine.scene.updateMatrixWorld(true);
  const hpBefore = z.health;
  const targets = g.weapons.getTargets();
  out.targetCount = targets.length;
  out.targetHasZombie = targets.includes(z.group);
  // switch to rifle (pinpoint), fire
  g.weapons.switchTo(3);
  g.weapons.current.cooldown = 0; g.weapons.current.mag = 8;
  g.weapons.fire();
  out.zombieDamaged = z.health < hpBefore;
  out.hpBefore = hpBefore; out.hpAfter = z.health;
  // now aim at a far wall (no enemy): fire and confirm a tracer was spawned
  cam.lookAt(cam.position.x, 1.7, cam.position.z - 50);
  // clear enemies so the ray only hits world
  for (const zz of g.enemies.zombies) zz.group.position.set(999,0,999);
  g.engine.scene.updateMatrixWorld(true);
  g.weapons.current.cooldown = 0; g.weapons.current.mag = 8;
  const tracersBefore = g.weapons.tracers.active.length;
  g.weapons.fire();
  out.tracerSpawned = g.weapons.tracers.active.length > tracersBefore;
  out.pass = out.targetHasZombie && out.zombieDamaged && out.tracerSpawned;
  return out;
}
"""

def main():
    httpd = serve()
    from playwright.sync_api import sync_playwright
    rep = {"console_errors": [], "page_errors": []}
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={"width":1280,"height":720})
        pg.on("console", lambda m: rep["console_errors"].append(m.text) if m.type=="error" else None)
        pg.on("pageerror", lambda e: rep["page_errors"].append(str(e)))
        pg.goto(f"http://127.0.0.1:{ACTUAL_PORT}/index.html", wait_until="load")
        pg.wait_for_function("window.__game && window.__game.engine", timeout=15000)
        rep["probe"] = pg.evaluate(PROBE)
        b.close()
    httpd.shutdown()
    rep["pass"] = bool(rep["probe"].get("pass")) and not rep["page_errors"]
    print(json.dumps(rep, indent=2))
    return 0 if rep["pass"] else 1

if __name__ == "__main__":
    sys.exit(main())
