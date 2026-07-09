"""
Persistent storage for TCP connection presets (name, ip, port).

File format (server/tcp_configs.json):
  {
    "auto": "<config-id>" | null,   # optional: auto-start this preset in server mode
    "configs": [ { "id", "name", "ip", "port" }, ... ]
  }

Legacy root-level list format is still accepted and migrated on save.
"""
import json
import logging
import os
import uuid

logger = logging.getLogger(__name__)

_SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_PROJECT_ROOT = os.path.abspath(os.path.join(_SERVER_DIR, ".."))
TCP_CONFIGS_FILE = os.path.join(_SERVER_DIR, "tcp_configs.json")
_LEGACY_TCP_CONFIGS_FILE = os.path.join(_PROJECT_ROOT, "tcp_configs.json")

# From Photon networkGui.cpp DAQ Server preset + local replay/debug listener.
DEFAULT_TCP_CONFIGS = [
    {"id": "daq-server", "name": "DAQ Server", "ip": "3.141.38.115", "port": 6500},
    {"id": "debug", "name": "debug", "ip": "127.0.0.1", "port": 6500},
]


def _normalize(raw) -> tuple[list[dict], str | None]:
    """Return (configs, auto_id) from either object or legacy list payload."""
    if isinstance(raw, list):
        return raw, None
    if isinstance(raw, dict):
        configs = raw.get("configs")
        if not isinstance(configs, list):
            configs = []
        auto = raw.get("auto")
        if auto is not None:
            auto = str(auto).strip() or None
        return configs, auto
    return [], None


def _load() -> tuple[list[dict], str | None]:
    path = TCP_CONFIGS_FILE
    if not os.path.isfile(path) and os.path.isfile(_LEGACY_TCP_CONFIGS_FILE):
        path = _LEGACY_TCP_CONFIGS_FILE
    if not os.path.isfile(path):
        return [], None
    try:
        with open(path, "r") as f:
            return _normalize(json.load(f))
    except Exception as e:
        logger.warning("Could not load TCP configs: %s", e)
        return [], None


def _save(configs: list[dict], auto: str | None) -> None:
    payload = {"auto": auto, "configs": configs}
    with open(TCP_CONFIGS_FILE, "w") as f:
        json.dump(payload, f, indent=2)
    # Drop legacy root file once migrated under server/
    if os.path.isfile(_LEGACY_TCP_CONFIGS_FILE) and os.path.abspath(_LEGACY_TCP_CONFIGS_FILE) != os.path.abspath(TCP_CONFIGS_FILE):
        try:
            os.remove(_LEGACY_TCP_CONFIGS_FILE)
        except OSError as e:
            logger.warning("Could not remove legacy tcp_configs.json: %s", e)


def _ensure_defaults(configs: list[dict], auto: str | None) -> tuple[list[dict], str | None]:
    existing_ids = {c.get("id") for c in configs}
    added = False
    for default in DEFAULT_TCP_CONFIGS:
        if default["id"] in existing_ids:
            continue
        configs.append(dict(default))
        added = True
    if added or not os.path.isfile(TCP_CONFIGS_FILE):
        _save(configs, auto)
    return configs, auto


def _ensure_ids(configs: list[dict]) -> list[dict]:
    for c in configs:
        if "id" not in c:
            c["id"] = str(uuid.uuid4())
    return configs


def list_configs() -> list[dict]:
    """Return all TCP configs with id, name, ip, port."""
    configs, auto = _load()
    configs = _ensure_ids(configs)
    configs, _ = _ensure_defaults(configs, auto)
    return configs


def get_auto_id() -> str | None:
    """Return the optional auto-start config id for server mode, or None."""
    configs, auto = _load()
    configs = _ensure_ids(configs)
    configs, auto = _ensure_defaults(configs, auto)
    if not auto:
        return None
    if any(c.get("id") == auto for c in configs):
        return auto
    return None


def get_config(config_id: str) -> dict | None:
    for c in list_configs():
        if c.get("id") == config_id:
            return c
    return None


def set_auto_id(config_id: str | None) -> str | None:
    """Set (or clear) the auto-start config id. Returns the stored value."""
    configs, existing_auto = _load()
    configs = _ensure_ids(configs)
    configs, _ = _ensure_defaults(configs, existing_auto)
    auto = (str(config_id).strip() or None) if config_id is not None else None
    if auto is not None and not any(c.get("id") == auto for c in configs):
        raise ValueError(f"TCP config id not found: {auto}")
    _save(configs, auto)
    return auto


def add_config(name: str, ip: str, port: int) -> dict:
    """Add a new config. Returns the created config with id."""
    configs, auto = _load()
    configs = _ensure_ids(configs)
    entry = {"id": str(uuid.uuid4()), "name": name.strip(), "ip": ip.strip(), "port": int(port)}
    configs.append(entry)
    _save(configs, auto)
    return entry


def update_config(config_id: str, name: str, ip: str, port: int) -> dict | None:
    """Update an existing config. Returns updated config or None if not found."""
    configs, auto = _load()
    configs = _ensure_ids(configs)
    for c in configs:
        if c.get("id") == config_id:
            c["name"] = name.strip()
            c["ip"] = ip.strip()
            c["port"] = int(port)
            _save(configs, auto)
            return c
    return None


def delete_config(config_id: str) -> bool:
    """Delete a config. Returns True if deleted. Clears auto if it pointed at this id."""
    configs, auto = _load()
    configs = _ensure_ids(configs)
    for i, c in enumerate(configs):
        if c.get("id") == config_id:
            configs.pop(i)
            if auto == config_id:
                auto = None
            _save(configs, auto)
            return True
    return False
