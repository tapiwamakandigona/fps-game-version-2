import os, threading, http.server, socketserver, functools, json
from playwright.sync_api import sync_playwright

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.getcwd())
    httpd = socketserver.TCPServer(("127.0.0.1", 0), h); httpd.allow_reuse_address = True
    globals()["PORT"] = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start(); return httpd

def main():
    httpd = serve()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width":900,"height":520})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append("console:"+m.text) if m.type=="error" else None)
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
        pg.wait_for_timeout(500)
        res = pg.evaluate("""() => {
          const g = window.__game; g.endlessMode=false; g._startRun();
          const gm = g.grenadeMgr;
          const startTac = gm.tactical;
          const ok = gm.throwTactical();
          let flashed = 0; const realFb = g.hud.flashbang.bind(g.hud);
          g.hud.flashbang = (s)=>{ flashed = s; return realFb(s); };
          window.__probe = () => {
            const cam = g.engine.camera;
            const z = g.enemies.zombies.find(x=>x.alive);
            let near=null;
            if (z) {
              const dir = z.group.position.clone(); cam.getWorldDirection(dir);
              z.group.position.set(cam.position.x+dir.x*4, 0, cam.position.z+dir.z*4);
              near=z;
            }
            // detonate a flash 3.5m dead ahead of the player
            const dir2 = cam.position.clone(); cam.getWorldDirection(dir2);
            const fp = cam.position.clone(); fp.x+=dir2.x*3.5; fp.y=1.2; fp.z+=dir2.z*3.5;
            gm._detonateFlash({ pos: fp });
            return { ok, startTac, afterTac: gm.tactical,
                     zStun: near ? +near.stun.toFixed(2) : -1, flashed,
                     hudTac: document.getElementById('flash-count').textContent };
          };
          return null;
        }""")
        pg.wait_for_timeout(2200)  # let wave 1 spawn
        res = pg.evaluate("() => window.__probe()")
        print(json.dumps({"res":res, "errs":errs[:4]}))
        b.close()
    httpd.shutdown()

main()
