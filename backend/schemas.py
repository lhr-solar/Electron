"""One load/validate path for the two project contracts the backend enforces:
the engine config (`engine/config.schema.json`) and the MDC spec
(`Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json`, fully self-contained — no external refs).

We validate against the bundled schemas directly with `jsonschema` rather than
re-implementing parsing. `ValidationError` carries a UI-friendly message.
"""
from __future__ import annotations

import functools
import json
from pathlib import Path

from jsonschema import Draft202012Validator
from pydantic import BaseModel, Field

from .paths import can_root

_REPO = Path(__file__).resolve().parent.parent
_CONFIG_SCHEMA = _REPO / "engine" / "config.schema.json"


def _mdc_schema_path() -> Path:
    return can_root() / "mdc" / "schema" / "mdc.schema.bundle.json"


class ValidationError(ValueError):
    """Raised when a document fails schema validation. `detail` is human-readable."""

    def __init__(self, title: str, detail: str):
        self.title = title
        self.detail = detail
        super().__init__(f"{title}: {detail}")


@functools.lru_cache(maxsize=2)
def _validator(schema_path: str) -> Draft202012Validator:
    schema = json.loads(Path(schema_path).read_text())
    return Draft202012Validator(schema)


def _validate(doc: dict, schema_path: Path, title: str) -> None:
    errors = sorted(_validator(str(schema_path)).iter_errors(doc), key=lambda e: list(e.path))
    if errors:
        e = errors[0]
        loc = "/".join(str(p) for p in e.path) or "(root)"
        raise ValidationError(title, f"{loc}: {e.message}")


def validate_config(config: dict) -> None:
    _validate(config, _CONFIG_SCHEMA, "Invalid config")


def validate_mdc(spec: dict) -> None:
    _validate(spec, _mdc_schema_path(), "Invalid MDC spec")


# --- Named events (additive API contract; not part of engine/config schemas) ---


class EventStart(BaseModel):
    name: str
    tags: list[str] = Field(default_factory=list)
    note: str | None = None


class Event(BaseModel):
    id: str
    name: str
    start_ts_ns: int
    end_ts_ns: int | None = None
    tags: list[str] = Field(default_factory=list)
    note: str | None = None
