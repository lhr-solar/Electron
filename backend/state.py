"""Backend runtime state: the effective engine config and the MDC spec store.

Config is held in memory and validated against `engine/config.schema.json` on
every replace/merge. The seed is the minimal desktop default unless
`BACKEND_CONFIG` points at a config file (server/deploy use this to boot
headless with the TCP listener + sinks). MDC specs live as files under the data
dir, validated against the MDC schema on write.
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

from .paths import mdc_docs_dir
from .schemas import ValidationError, validate_config, validate_mdc

logger = logging.getLogger(__name__)

_MDC_DIR = mdc_docs_dir()

_DEFAULT_CONFIG: dict = {
    "role": "desktop",
    "sources": [],
    "sinks": [],
    "api": {"host": "127.0.0.1", "port": 8350},
}


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for k, v in patch.items():
        out[k] = _deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


_ENV_REF = re.compile(r"\$\{([A-Z0-9_]+)\}")


def _expand_env(value):
    """Recursively replace `${VAR}` in string values with env vars (deploy passes
    secrets like the Influx token via the environment, never in the file)."""
    if isinstance(value, str):
        return _ENV_REF.sub(lambda m: os.environ.get(m.group(1), m.group(0)), value)
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_env(v) for v in value]
    return value


def _seed_config() -> dict:
    """Boot config: load `BACKEND_CONFIG` (with env expansion) if set, else the
    desktop default. A bad/invalid file is fatal — the server should not silently
    fall back to a desktop config that ignores the listener + sinks."""
    path = os.environ.get("BACKEND_CONFIG")
    if not path:
        return json.loads(json.dumps(_DEFAULT_CONFIG))
    cfg = _expand_env(json.loads(Path(path).read_text()))
    validate_config(cfg)
    logger.info("loaded boot config from %s (role=%s)", path, cfg.get("role"))
    return cfg


class Store:
    def __init__(self):
        self._config = _seed_config()
        _MDC_DIR.mkdir(parents=True, exist_ok=True)

    # --- config ---
    def get_config(self) -> dict:
        return json.loads(json.dumps(self._config))

    def put_config(self, config: dict) -> dict:
        validate_config(config)
        self._config = config
        return self.get_config()

    def patch_config(self, patch: dict) -> dict:
        merged = _deep_merge(self._config, patch)
        validate_config(merged)
        self._config = merged
        return self.get_config()

    # --- mdc ---
    def _path(self, spec_id: str) -> Path:
        safe = os.path.basename(spec_id)
        if not safe or safe != spec_id:
            raise ValidationError("Invalid MDC id", f"{spec_id!r} must not contain path separators")
        return _MDC_DIR / f"{safe}.mdc.json"

    def list_mdc(self) -> list[dict]:
        out = []
        for p in sorted(_MDC_DIR.glob("*.mdc.json")):
            spec_id = p.name[: -len(".mdc.json")]
            try:
                meta = json.loads(p.read_text()).get("metadata", {})
            except (OSError, ValueError):
                meta = {}
            out.append({"id": spec_id, "metadata": meta})
        return out

    def get_mdc(self, spec_id: str) -> dict | None:
        p = self._path(spec_id)
        return json.loads(p.read_text()) if p.exists() else None

    def put_mdc(self, spec_id: str, spec: dict) -> None:
        validate_mdc(spec)
        self._path(spec_id).write_text(json.dumps(spec, indent=2))

    def delete_mdc(self, spec_id: str) -> bool:
        p = self._path(spec_id)
        if not p.exists():
            return False
        p.unlink()
        return True


store = Store()
