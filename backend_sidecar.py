#!/usr/bin/env python3
"""Nuitka onefile entry for the Tauri backend sidecar.

Lives outside the ``backend`` package so Nuitka compiles this file as ``__main__``
while ``backend.*`` keeps package context for relative imports in ``main.py``.
"""
from __future__ import annotations

import uvicorn

from backend.main import app
from backend.state import store

if __name__ == "__main__":
    cfg = store.get_config().get("api", {})
    uvicorn.run(app, host=cfg.get("host", "127.0.0.1"), port=cfg.get("port", 8350))
