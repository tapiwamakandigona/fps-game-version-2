import json, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.getcwd())
    httpd = socketserver.TCPServer(("127.0.0.1", 0), h); httpd.allow_reuse_address = True
    globals()["PORT"] = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start(); return httpd

PROBE = r"""
async () => {
  const out = { steps: [] };
  const g = window.__game;
  if (!g) return { err: 'no game' };
  g._startRun();
  await new Promise(r => setTimeout(r, 100));
  const ks = g.killstreaks;
  // Simulate a streak: add kills and tick to reach UAV(3), Sentry(5), Mortar(7), Self-Revive(10).
  for (let i = 0; i < 10; i++) {
    ks.addKill();
    out.steps.push({ kill: i + 1, streak: ks.streak });
  }
  out.hasRevive = ks.hasSelfRevive === true;
  // tick the whole game loop-ish systems for ~2.5s to run sentry/mortar/uav effects
  let acc = 0;
  for (let f = 0; f < 150; f++) { ks.update(0.016); acc += 0.016; }
  out.afterTickStreak = ks.streak;
  out.prog = ks.getProgress ? ks.getProgress() : null;
  // self-revive consume
  out.revive1 = ks.consumeRevive();
  out.revive2 = ks.consumeRevive();
  ks.reset();
  out.afterReset = ks.streak;
  ks.dispose();
  out.ok = true;
  return out;
}
"""

def main():
    httpd = serve()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                    "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = b.new_page()
        cerr, perr = [], []
        pg.on("console", lambda m: cerr.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: perr.append(str(e)))
        pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
        pg.wait_for_timeout(800)
        try:
            r = pg.evaluate(PROBE)
        except Exception as e:
            r = {"err": str(e)}
        r["consoleErrors"] = cerr[:6]
        r["pageErrors"] = perr[:6]
        print(json.dumps(r, indent=2))
        b.close()
    httpd.shutdown()

main()
