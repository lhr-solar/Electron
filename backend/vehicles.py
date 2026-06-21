"""Vehicle discovery under ``can_root()/vehicles/`` (contract §5)."""
from __future__ import annotations

import os
from pathlib import Path

from .paths import can_root


def list_vehicles() -> list[dict]:
    root = can_root() / "vehicles"
    if not root.is_dir():
        return []
    out: list[dict] = []
    for p in sorted(root.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_dir() or p.name.startswith("."):
            continue
        has_dbc = any(p.glob("*.dbc"))
        has_mdc = any(p.glob("*.mdc.json"))
        if has_dbc or has_mdc:
            out.append({"id": p.name, "hasDbc": has_dbc, "hasMdc": has_mdc})
    return out


def validate_vehicle_name(name: str) -> str | None:
    """Return error detail if invalid, else None."""
    if not name:
        return "name must be non-empty"
    if os.path.basename(name) != name or "/" in name or "\\" in name:
        return "name must be a single path segment"
    return None


def create_vehicle(name: str) -> dict:
    err = validate_vehicle_name(name)
    if err:
        raise ValueError(err)
    vehicle_dir = can_root() / "vehicles" / name
    if vehicle_dir.exists():
        raise FileExistsError(name)
    vehicle_dir.mkdir(parents=True, exist_ok=True)
    return {"id": name, "hasDbc": False, "hasMdc": False}
