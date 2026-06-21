"""DBC import/export via Embedded-Sharepoint tools (dbc2mdc / mdc2dbc).

Import always shells out to ``dbc2mdc.py``. Export prefers ``mdc2dbc.py`` when
present; otherwise falls back to an inline cantools builder (ponytail: inline
fallback when the subprocess tool is missing or errors).
"""
from __future__ import annotations

import json
import logging
import subprocess
import sys
import tempfile
from collections import OrderedDict
from pathlib import Path

from .paths import can_root
from .schemas import ValidationError, validate_mdc

logger = logging.getLogger(__name__)


def _dbc2mdc_path() -> Path:
    return can_root() / "mdc" / "tools" / "dbc2mdc.py"


def _mdc2dbc_path() -> Path:
    return can_root() / "mdc" / "tools" / "mdc2dbc.py"


class DbcToolError(RuntimeError):
    """Raised when a DBC tool subprocess fails."""


def import_dbc(dbc_bytes: bytes, vehicle_id: str | None = None) -> dict:
    """Import a .dbc file into a validated v3 MDC document."""
    dbc2mdc = _dbc2mdc_path()
    if not dbc2mdc.is_file():
        raise DbcToolError(f"dbc2mdc not found: {dbc2mdc}")

    with tempfile.TemporaryDirectory() as tmp:
        dbc_path = Path(tmp) / "import.dbc"
        out_path = Path(tmp) / "out.mdc.json"
        dbc_path.write_bytes(dbc_bytes)
        cmd = [sys.executable, str(dbc2mdc), str(dbc_path), "-o", str(out_path)]
        if vehicle_id:
            cmd.extend(["--vehicle-id", vehicle_id])
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            detail = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
            raise DbcToolError(detail)
        try:
            spec = json.loads(out_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise DbcToolError(f"dbc2mdc output is not valid JSON: {exc}") from exc

    try:
        validate_mdc(spec)
    except ValidationError as exc:
        raise DbcToolError(exc.detail) from exc
    return spec


def export_dbc(spec: dict, network_id: str | None = None) -> tuple[str, list[str]]:
    """Export one network from a v3 MDC document to DBC text + lossy warnings."""
    validate_mdc(spec)
    networks = spec.get("networks") or []
    if not networks:
        raise ValidationError("Invalid MDC spec", "networks: [] is too short")

    if network_id is None:
        if len(networks) != 1:
            raise ValidationError(
                "Invalid export request",
                "network_id is required when the document has multiple networks",
            )
        network = networks[0]
    else:
        network = next((n for n in networks if n.get("id") == network_id), None)
        if network is None:
            raise ValidationError("Invalid export request", f'unknown network_id "{network_id}"')

    if _mdc2dbc_path().is_file():
        try:
            return _export_subprocess(spec, network)
        except DbcToolError as exc:
            logger.warning("mdc2dbc subprocess failed, using inline fallback: %s", exc)

    return _export_inline(spec, network)


def _export_subprocess(spec: dict, network: dict) -> tuple[str, list[str]]:
    # ponytail: mdc2dbc exports one .dbc when networks[] has a single entry.
    export_spec = {**spec, "networks": [network]}
    with tempfile.TemporaryDirectory() as tmp:
        spec_path = Path(tmp) / "project.mdc.json"
        out_path = Path(tmp) / f"{network['id']}.dbc"
        spec_path.write_text(json.dumps(export_spec, indent=2), encoding="utf-8")
        cmd = [sys.executable, str(_mdc2dbc_path()), str(spec_path), "-o", str(out_path)]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            detail = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
            raise DbcToolError(detail)
        warnings = [
            line.strip()
            for line in (proc.stderr or "").splitlines()
            if "mdc2dbc: warning:" in line
        ]
        try:
            dbc = out_path.read_text(encoding="utf-8")
        except OSError as exc:
            raise DbcToolError(f"mdc2dbc produced no output: {exc}") from exc
    return dbc, warnings


def _warn(msg: str) -> str:
    return f"mdc2dbc: warning: {msg}"


def _export_inline(spec: dict, network: dict) -> tuple[str, list[str]]:
    try:
        import cantools.database.can as can_db
        from cantools.database.conversion import LinearConversion, NamedSignalConversion
    except ImportError as exc:
        raise DbcToolError(
            "mdc2dbc tool missing and cantools is not installed "
            "(pip install 'lhrs-can-backend[tools]')"
        ) from exc

    warnings: list[str] = []
    if network.get("computedSignals"):
        warnings.append(_warn("computedSignals dropped (not DBC-expressible)"))
    if network.get("samplePoint") is not None:
        warnings.append(_warn("samplePoint dropped (not DBC-expressible)"))

    tables: dict[str, dict[int, str]] = {}
    for vt in spec.get("valueTables", []):
        tables[vt["name"]] = {int(e["value"]): e["label"] for e in vt.get("entries", [])}
    for vt in network.get("valueTables", []):
        tables[vt["name"]] = {int(e["value"]): e["label"] for e in vt.get("entries", [])}

    def _choices(sig: dict) -> dict[int, str] | None:
        if sig.get("choices"):
            return {int(c["value"]): c["label"] for c in sig["choices"]}
        ref = sig.get("valueTableRef")
        if ref:
            if ref in tables:
                return tables[ref]
            warnings.append(_warn(f'valueTableRef "{ref}" unresolved on signal {sig["name"]!r}'))
        return None

    def _signal(sig: dict) -> can_db.Signal:
        for key in ("alarms", "display"):
            if sig.get(key):
                warnings.append(_warn(f'{key} on signal {sig["name"]!r} dropped (not DBC-expressible)'))
        conv = sig.get("conversion") or {}
        if conv.get("kind") == "rational":
            warnings.append(
                _warn(f'rational conversion on signal {sig["name"]!r} dropped (DBC is linear-only)')
            )
        scale = float(sig.get("scale", 1))
        offset = float(sig.get("offset", 0))
        is_float = bool(sig.get("is_float"))
        choices = _choices(sig)
        if choices:
            conversion = NamedSignalConversion(scale, offset, OrderedDict(choices), is_float)
        else:
            conversion = LinearConversion(scale, offset, is_float)
        kwargs: dict = {
            "name": sig["name"],
            "start": int(sig["start"]),
            "length": int(sig["length"]),
            "byte_order": sig.get("byte_order", "little_endian"),
            "is_signed": bool(sig.get("is_signed")),
            "conversion": conversion,
            "minimum": sig.get("minimum"),
            "maximum": sig.get("maximum"),
            "unit": sig.get("unit") or None,
            "comment": sig.get("comment"),
            "receivers": sig.get("receivers") or [],
            "is_multiplexer": sig.get("is_multiplexer") or None,
            "multiplexer_ids": sig.get("multiplexer_ids"),
            "multiplexer_signal": sig.get("multiplexer_signal"),
            "spn": sig.get("spn"),
        }
        # ponytail: cantools distinguishes None (plain) from False (explicit non-mux); False omitted.
        return can_db.Signal(**{k: v for k, v in kwargs.items() if v is not None})

    messages: list[can_db.Message] = []
    for msg in network.get("messages", []):
        for key in ("computedSignals", "array", "transport", "header_id", "contained_messages"):
            if msg.get(key):
                warnings.append(_warn(f'{key} on message {msg["name"]!r} dropped (not DBC-expressible)'))
        if msg.get("display"):
            warnings.append(_warn(f'display on message {msg["name"]!r} dropped (not DBC-expressible)'))
        signals = [_signal(s) for s in msg.get("signals", [])]
        messages.append(
            can_db.Message(
                frame_id=int(msg["frame_id"]),
                name=msg["name"],
                length=int(msg["length"]),
                signals=signals,
                is_extended_frame=bool(msg.get("is_extended_frame")),
                is_fd=bool(msg.get("is_fd")),
                comment=msg.get("comment"),
                senders=msg.get("senders") or [],
                send_type=msg.get("send_type"),
                cycle_time=msg.get("cycle_time"),
                protocol=msg.get("protocol"),
            )
        )

    nodes = [can_db.Node(name=n["name"], comment=n.get("comment")) for n in network.get("nodes", [])]
    buses = []
    if network.get("baudrate"):
        buses.append(
            can_db.Bus(
                name=network.get("name") or network["id"],
                comment=network.get("comment"),
                baudrate=int(network["baudrate"]),
                fd_baudrate=int(network["fd_baudrate"]) if network.get("fd_baudrate") else None,
            )
        )

    db = can_db.Database(messages=messages, nodes=nodes, buses=buses or None)
    return db.as_dbc_string(), warnings
