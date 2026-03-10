"""
Persistent storage for TCP connection presets (name, ip, port).
"""
import json
import logging
import os
import uuid

logger = logging.getLogger(__name__)

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TCP_CONFIGS_FILE = os.path.join(_PROJECT_ROOT, "tcp_configs.json")


def _load() -> list[dict]:
    if not os.path.isfile(TCP_CONFIGS_FILE):
        return []
    try:
        with open(TCP_CONFIGS_FILE, "r") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.warning("Could not load TCP configs: %s", e)
        return []


def _save(configs: list[dict]) -> None:
    with open(TCP_CONFIGS_FILE, "w") as f:
        json.dump(configs, f, indent=2)


def list_configs() -> list[dict]:
    """Return all TCP configs with id, name, ip, port."""
    configs = _load()
    for c in configs:
        if "id" not in c:
            c["id"] = str(uuid.uuid4())
    return configs


def add_config(name: str, ip: str, port: int) -> dict:
    """Add a new config. Returns the created config with id."""
    configs = _load()
    for c in configs:
        if "id" not in c:
            c["id"] = str(uuid.uuid4())
    entry = {"id": str(uuid.uuid4()), "name": name.strip(), "ip": ip.strip(), "port": int(port)}
    configs.append(entry)
    _save(configs)
    return entry


def update_config(config_id: str, name: str, ip: str, port: int) -> dict | None:
    """Update an existing config. Returns updated config or None if not found."""
    configs = _load()
    for c in configs:
        if c.get("id") == config_id:
            c["name"] = name.strip()
            c["ip"] = ip.strip()
            c["port"] = int(port)
            _save(configs)
            return c
    return None


def delete_config(config_id: str) -> bool:
    """Delete a config. Returns True if deleted."""
    configs = _load()
    for i, c in enumerate(configs):
        if c.get("id") == config_id:
            configs.pop(i)
            _save(configs)
            return True
    return False
