"""Role-gated static web-app serving.

In `role: server` the backend hosts the built React app (`app/dist`) so browser
clients load the SAME app + viewports the desktop uses, alongside the REST/WS
API. In `role: desktop` (Tauri sidecar) the app is served by Tauri itself, so
this is skipped entirely.

The served directory is configurable via `server.webRoot` in the engine config
(default `app/dist`, relative to the repo root). If the build output does not
exist yet, we mount a tiny generated placeholder and log a warning rather than
crashing — the API stays fully usable while the app build catches up.

SPA fallback: unknown non-`/api`, non-`/ws` GET paths return `index.html` so
client-side routing (the workspace viewports) works on deep links / refresh.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

_REPO = Path(__file__).resolve().parent.parent
_DEFAULT_WEB_ROOT = "app/dist"

_PLACEHOLDER_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CAN — server</title>
    <style>
      body { font: 15px/1.6 system-ui, sans-serif; margin: 4rem auto; max-width: 40rem;
             color: #ddd; background: #111; padding: 0 1rem; }
      code { background: #222; padding: 0.1em 0.4em; border-radius: 4px; }
      a { color: #6cf; }
    </style>
  </head>
  <body>
    <h1>CAN server is running</h1>
    <p>The REST/WS API is live, but the web app build is not present yet.</p>
    <p>Build it and restart, or point <code>server.webRoot</code> at the build:</p>
    <pre><code>cd app && npm install && npm run build   # produces app/dist</code></pre>
    <p>API: <a href="/api/status">/api/status</a> &middot; WebSocket: <code>/ws</code></p>
  </body>
</html>
"""


def _resolve_web_root(config: dict) -> Path:
    server = config.get("server") or {}
    raw = server.get("webRoot") or _DEFAULT_WEB_ROOT
    p = Path(raw)
    return p if p.is_absolute() else (_REPO / p).resolve()


def mount_webapp(app: FastAPI, config: dict) -> None:
    """Mount static app serving when `role == server`. No-op for desktop.

    Idempotent on role: desktop callers get nothing mounted, so the Tauri sidecar
    keeps serving its own bundle.
    """
    if config.get("role") != "server":
        logger.info("role != server — skipping static web-app serving.")
        return

    web_root = _resolve_web_root(config)
    index = web_root / "index.html"

    if not index.is_file():
        logger.warning(
            "web app build not found at %s — serving placeholder. "
            "Build app/dist or set server.webRoot.",
            web_root,
        )
        _mount_placeholder(app)
        return

    logger.info("serving web app from %s", web_root)
    # Static assets (hashed JS/CSS) live under the build root; SPA fallback below
    # handles routes that don't map to a file.
    app.mount("/assets", StaticFiles(directory=web_root / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    async def _index():  # noqa: D401 — FastAPI route
        return FileResponse(index)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa_fallback(full_path: str):  # noqa: D401 — FastAPI route
        candidate = (web_root / full_path).resolve()
        # candidate must be inside web_root (not web_root itself) to avoid serving outside the dir
        if web_root in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)


def _mount_placeholder(app: FastAPI) -> None:
    @app.get("/", include_in_schema=False)
    async def _placeholder():  # noqa: D401 — FastAPI route
        return HTMLResponse(_PLACEHOLDER_HTML)
