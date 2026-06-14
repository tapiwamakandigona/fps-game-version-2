import json, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.getcwd())
    httpd = socketserver.TCPServer(("127.0.0.1", 0), h); httpd.allow_reuse_address = True
    globals()["PORT"] = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start(); return httpd

PROBE = r"""
async () => {
  const out = {};
  const g = window.__game;
  if (!g) return { err: 'no game' };
  g.endlessMode = true;
  g._startRun();
  await new Promise(r => setTimeout(r, 100));
  // Pack-a-Punch the current weapon via the upgrade path.
  const w = g.weapons.current;
  out.before = { name: w.name, dmgMult: w.damageMult, mag: w.magSize, paP: w.paP };
  g.score = 99999;
  g._applyUpgrade('packapunch');
  out.after = { name: g.weapons.current.name, dmgMult: g.weapons.current.damageMult,
                mag: g.weapons.current.magSize, paP: g.weapons.current.paP };
  // Second apply on same weapon should be a no-op (returns false).
  const before2 = g.weapons.current.damageMult;
  g._applyUpgrade('packapunch');
  out.secondNoOp = (g.weapons.current.damageMult === before2);
  // Shop dynamic hooks
  out.shopName = g.shop.weaponName();
  out.shopPaP = g.shop.weaponPaP();
  // Endless: jump enemies to a cleared wave-5 state and verify it continues, not ends.
  out.endlessFlag = g.enemies.endless;
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
        r["consoleErrors"] = cerr[:6]; r["pageErrors"] = perr[:6]
        print(json.dumps(r, indent=2))
        b.close()
    httpd.shutdown()

main()
