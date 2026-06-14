import os, threading, http.server, socketserver, functools, json
from playwright.sync_api import sync_playwright

os.chdir("/work/repos/fps-game-version-2")
def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.getcwd())
    httpd = socketserver.TCPServer(("127.0.0.1", 0), h); httpd.allow_reuse_address = True
    globals()["PORT"] = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start(); return httpd

httpd = serve()
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width":900,"height":520})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
    pg.wait_for_timeout(400)
    res = pg.evaluate("""() => {
      const g = window.__game; g.endlessMode=false; g._startRun();
      const c = g.controls; c.isLocked = true;
      const yaws=[]; const pitches=[];
      // simulate looking DOWN hard for many frames (movementY > 0), with a fixed yaw push
      for (let i=0;i<200;i++){
        document.dispatchEvent(new MouseEvent('mousemove', {movementX: 3, movementY: 25}));
        c.update();
        yaws.push(c.yaw); pitches.push(c.pitch);
      }
      // find the biggest single-frame yaw jump (the 'jerk' would show as a spike)
      let maxJump=0;
      for (let i=1;i<yaws.length;i++){ const d=Math.abs(yaws[i]-yaws[i-1]); if(d>maxJump) maxJump=d; }
      const expectedStep = Math.abs(3*0.002*c.pointerSpeed); // per-event yaw step
      // recoil compose + recover check
      c.setRecoil(0.2, 0.1); c.update(); const pAtKick = c.pitch + 0.2;
      c.setRecoil(0,0); c.update();
      return { finalPitch:+c.pitch.toFixed(4), pitchLimit:+(Math.PI/2-0.04).toFixed(4),
               clamped: Math.abs(c.pitch-(Math.PI/2-0.04))<1e-3 || Math.abs(c.pitch+(Math.PI/2-0.04))<1e-3,
               maxYawJump:+maxJump.toFixed(5), expectedStep:+expectedStep.toFixed(5),
               jerkFree: maxJump <= expectedStep*1.5 + 1e-6 };
    }""")
    print(json.dumps({"res":res,"errs":errs[:3]}))
    b.close()
httpd.shutdown()
