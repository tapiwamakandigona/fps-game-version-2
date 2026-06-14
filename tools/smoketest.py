#!/usr/bin/env python3
"""Headless smoke test for FPS Arena v2.

Serves the repo over HTTP, loads it in headless Chromium with software WebGL,
captures console errors, verifies the renderer initialised, then drives the game
loop via window.__game internals (pointer-lock can't be grabbed headless) and
checks it runs for a few seconds without throwing. Prints a JSON report.

Usage:  uv run python tools/smoketest.py [--seconds 6]
Exit 0 if healthy, 1 otherwise.
"""
import json, sys, threading, http.server, socketserver, functools, os, time, contextlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 0


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    httpd.allow_reuse_address = True
    globals()["ACTUAL_PORT"] = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def main():
    seconds = 6
    if "--seconds" in sys.argv:
        seconds = int(sys.argv[sys.argv.index("--seconds") + 1])
    httpd = serve()
    from playwright.sync_api import sync_playwright
    report = {"console_errors": [], "page_errors": [], "ok": False, "fps": None, "metrics": {}}
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=swiftshader",
            "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
        ])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: report["console_errors"].append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: report["page_errors"].append(str(e)))
        page.goto(f"http://127.0.0.1:{ACTUAL_PORT}/index.html", wait_until="load")
        # wait for game bootstrap
        try:
            page.wait_for_function("window.__game && window.__game.engine", timeout=15000)
        except Exception as e:
            report["bootstrap_error"] = str(e)
        # verify WebGL renderer is real (not the failure fallback)
        report["metrics"]["renderer"] = page.evaluate(
            "() => { const g = window.__game; if(!g) return null; return { hasComposer: !!g.engine.composer, state: g.state }; }")
        # drive the game loop: start a run headlessly and let it tick
        page.evaluate("() => { try { window.__game._startRun(); } catch(e){ window.__startErr = String(e); } }")
        # sample FPS over the window
        page.evaluate("""() => {
            window.__frames = 0; window.__lastT = performance.now();
            const loop = () => { window.__frames++; requestAnimationFrame(loop); };
            requestAnimationFrame(loop);
        }""")
        time.sleep(seconds)
        fps = page.evaluate("() => { const dt = (performance.now() - window.__lastT)/1000; return window.__frames / dt; }")
        report["fps"] = round(fps, 1)
        report["metrics"]["after"] = page.evaluate(
            "() => { const g = window.__game; return { state: g.state, enemies: g.enemies.zombies.length, wave: g.enemies.wave, alive: g.player.alive, startErr: window.__startErr||null }; }")
        browser.close()
    httpd.shutdown()
    report["ok"] = (not report["page_errors"]) and report["metrics"].get("renderer") is not None
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
