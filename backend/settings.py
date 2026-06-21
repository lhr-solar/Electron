"""Load/seed/save ``can_home()/settings.json`` (contract §3)."""
from __future__ import annotations

import json
import logging
import os
from copy import deepcopy
from pathlib import Path
from typing import Callable

from .paths import can_home

logger = logging.getLogger(__name__)

_HARD_DEFAULTS: dict = {
    "defaultVehicle": None,
    "defaultReadBitrate": 500000,
    "sharepoint": {
        "remoteUrl": "https://github.com/lhr-solar/Embedded-Sharepoint.git",
        "branch": "custom_mdc",
    },
}

_ENV_TOP = {
    "defaultVehicle": "CAN_DEV_DEFAULT_VEHICLE",
    "defaultReadBitrate": "CAN_DEV_DEFAULT_BITRATE",
}

_ENV_SHAREPOINT = {
    "remoteUrl": "CAN_DEV_SHAREPOINT_REMOTE",
    "branch": "CAN_DEV_SHAREPOINT_BRANCH",
}


def _settings_path() -> Path:
    return can_home() / "settings.json"


def _flag_value(key: str, env_name: str):
    raw = os.environ.get(env_name)
    if raw is None or raw == "":
        return _HARD_DEFAULTS[key]
    if key == "defaultReadBitrate":
        return int(raw)
    return raw


def _flag_sharepoint(key: str) -> str:
    env_name = _ENV_SHAREPOINT[key]
    raw = os.environ.get(env_name)
    if raw is None or raw == "":
        return _HARD_DEFAULTS["sharepoint"][key]
    return raw


def _deep_fill(target: dict, defaults: dict) -> bool:
    """Fill absent keys from defaults; return True if anything was filled."""
    filled = False
    for key, default in defaults.items():
        if key not in target:
            target[key] = deepcopy(default)
            filled = True
        elif isinstance(default, dict) and isinstance(target.get(key), dict):
            if _deep_fill(target[key], default):
                filled = True
    return filled


def _seed_missing(data: dict) -> bool:
    filled = False
    for key, env_name in _ENV_TOP.items():
        if key not in data:
            data[key] = _flag_value(key, env_name)
            filled = True
    share = data.setdefault("sharepoint", {})
    if not isinstance(share, dict):
        share = {}
        data["sharepoint"] = share
    for key in _HARD_DEFAULTS["sharepoint"]:
        if key not in share:
            share[key] = _flag_sharepoint(key)
            filled = True
    return filled


def _load_raw() -> tuple[dict, bool]:
    path = _settings_path()
    if not path.is_file():
        return {}, True
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("settings.json corrupt or unreadable (%s), re-seeding", exc)
        return {}, True
    if not isinstance(raw, dict):
        logger.warning("settings.json root is not an object, re-seeding")
        return {}, True
    return raw, False


def _save(data: dict) -> None:
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def get_settings() -> dict:
    data, missing_file = _load_raw()
    filled = _seed_missing(data)
    if missing_file or filled:
        _save(data)
    return deepcopy(data)


def update_settings(patch: dict) -> dict:
    current = get_settings()
    merged = _deep_merge(current, patch)
    _validate_settings(merged)
    _save(merged)
    return deepcopy(merged)


def _deep_merge(base: dict, patch: dict) -> dict:
    out = deepcopy(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _validate_settings(data: dict) -> None:
    if "defaultReadBitrate" in data and not isinstance(data["defaultReadBitrate"], int):
        raise ValueError("defaultReadBitrate must be an integer")
    if "defaultVehicle" in data and data["defaultVehicle"] is not None:
        if not isinstance(data["defaultVehicle"], str):
            raise ValueError("defaultVehicle must be a string or null")
    share = data.get("sharepoint")
    if share is not None:
        if not isinstance(share, dict):
            raise ValueError("sharepoint must be an object")
        for key in ("remoteUrl", "branch"):
            if key in share and not isinstance(share[key], str):
                raise ValueError(f"sharepoint.{key} must be a string")


def effective_default_vehicle(
    vehicle_ids: list[str],
    warn: Callable[[str], None] | None = None,
) -> str | None:
    """Resolve default vehicle; fall back to first + non-fatal warn (contract §3)."""
    settings = get_settings()
    dv = settings.get("defaultVehicle")
    if not vehicle_ids:
        return None
    if dv is None:
        return vehicle_ids[0]
    if dv in vehicle_ids:
        return dv
    if warn:
        warn(f"defaultVehicle {dv!r} not in vehicle list; using {vehicle_ids[0]!r}")
    return vehicle_ids[0]
