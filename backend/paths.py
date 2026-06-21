"""Per-call path resolvers for the user-local `.electron` layout (contract §1)."""
from __future__ import annotations

import os
from pathlib import Path

_REPO_CAN = Path(__file__).resolve().parent.parent / "Embedded-Sharepoint" / "can"


def can_home() -> Path:
    """`.electron` dir: CAN_HOME env, else ``~/.electron`` (read-only; no mkdir)."""
    return Path(os.environ.get("CAN_HOME", Path.home() / ".electron"))


def can_root() -> Path:
    """Checked-out ``can/`` tree (evaluated per call)."""
    if os.environ.get("CAN_ROOT"):
        return Path(os.environ["CAN_ROOT"])
    sharepoint_can = can_home() / "sharepoint" / "can"
    if sharepoint_can.exists():
        return sharepoint_can
    return _REPO_CAN


def mdc_docs_dir() -> Path:
    """User-authored MDC CRUD store (separate from the git checkout)."""
    backend_data = os.environ.get("BACKEND_DATA_DIR")
    if backend_data:
        return Path(backend_data) / "mdc"
    if os.environ.get("CAN_HOME"):
        return can_home() / "mdc-docs"
    # ponytail: dev fallback when CAN_HOME unset (tests/sandbox without Tauri)
    return Path(__file__).resolve().parent / "data" / "mdc"
