"""Integration parity: C++ can_engine decode vs v3-oracle math on lhr-ev1 fixtures.

Cantools is not installed in ``backend/.venv``, so the oracle here replicates the same
bit-extract + scale/offset + enum-label path (matching ``engine/decode/BitExtract.h``).
MDC spec: ``can_root()/vehicles/lhr-ev1/project.mdc.json``.
Frames: ``backend/tests/fixtures/*.slcan``.

Run (repo root, native engine required):
  PYTHONPATH=engine/build/binding backend/.venv/bin/pytest backend/tests/test_decode_parity.py -v
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from backend.paths import can_root

_REPO = Path(__file__).resolve().parents[2]
_MDC = can_root() / "vehicles" / "lhr-ev1" / "project.mdc.json"
_FIXTURES = Path(__file__).parent / "fixtures"
_PT_SLCAN = _FIXTURES / "lhr_ev1_powertrain.slcan"
_CH_SLCAN = _FIXTURES / "lhr_ev1_chassis.slcan"

# Expected per-message signal maps (golden values from engine/decode/DecoderTest.cpp).
_EXPECTED: dict[str, dict[str, float | str | int]] = {
    "BMS_Status": {
        "PackVoltage": 398.2,
        "PackCurrent": -5.0,
        "SOC": 50.0,
        "TempMax": 25.0,
        "PackState": "Closed",
        "ChargeEnabled": "On",
        "DrivePower": -1991.0,
    },
    "MCU_Drive": {
        "MotorRPM": 1000.0,
        "InverterState": "Drive",
        "Torque": 123.4,
        "MechPower": 123.4 * 1000.0 * 0.10472,
    },
    "BMS_CellArray": {
        "CellIndex": 5.0,
        "CellVoltage": 3.7,
        "CellTemp": 30.0,
    },
    "Diagnostics@mux0": {
        "DiagMux": 0.0,
        "AuxVoltage": 13.8,
    },
    "Diagnostics@mux1": {
        "DiagMux": 1.0,
        "FaultCode": "EPS_Timeout",
    },
}

_REL_TOL = 1e-9


def _require_can_engine():
    try:
        import can_engine  # noqa: PLC0415
    except ImportError as exc:
        pytest.skip(f"can_engine not built: {exc}")
    return can_engine


# --- v3-oracle: cantools-equivalent decode on MDC layouts -------------------


def _extract_le(data: bytes, start: int, length: int) -> int:
    result = 0
    for i in range(length):
        pos = start + i
        byte, bit = divmod(pos, 8)
        if byte < len(data):
            result |= ((data[byte] >> bit) & 1) << i
    return result


def _sign_extend(raw: int, length: int) -> int:
    if length == 0 or length >= 64:
        return raw
    sign = 1 << (length - 1)
    return raw - (1 << length) if raw & sign else raw


def _phys_value(sig: dict, raw_n: float) -> float:
    conv = sig.get("conversion") or {}
    kind = conv.get("kind")
    if kind == "table":
        return raw_n
    if kind == "rational":
        num = sum(k * (raw_n ** (len(conv["numerator"]) - 1 - i))
                  for i, k in enumerate(conv["numerator"]))
        den = sum(k * (raw_n ** (len(conv["denominator"]) - 1 - i))
                  for i, k in enumerate(conv["denominator"]))
        return (num / den if den else 0.0) + conv.get("offset", 0)
    return float(sig.get("scale", 1)) * raw_n + float(sig.get("offset", 0))


def _label_tables(spec: dict) -> dict[str, dict[int, str]]:
    tables: dict[str, dict[int, str]] = {}
    for vt in spec.get("valueTables", []):
        tables[vt["name"]] = {int(e["value"]): e["label"] for e in vt["entries"]}
    for net in spec.get("networks", []):
        for vt in net.get("valueTables", []):
            tables[vt["name"]] = {int(e["value"]): e["label"] for e in vt["entries"]}
    return tables


def _resolve_labels(sig: dict, tables: dict[str, dict[int, str]]) -> dict[int, str] | None:
    if sig.get("choices"):
        return {int(c["value"]): c["label"] for c in sig["choices"]}
    ref = sig.get("valueTableRef")
    return tables.get(ref) if ref else None


def _eval_computed(cs: dict, slots: dict[str, float]) -> float:
    # ponytail: only the two lhr-ev1 computed expressions; test oracle, not a general interpreter.
    # Resolve dependsOn (bare or Message.Signal) against decoded slot values.
    vals = []
    for dep in cs.get("dependsOn", []):
        name = dep.split(".", 1)[-1]
        vals.append(slots[name])
    expr = cs["expr"]
    if expr == "BMS_Status.PackVoltage * BMS_Status.PackCurrent":
        return vals[0] * vals[1]
    if expr == "Torque * MotorRPM * 0.10472":
        return vals[0] * vals[1] * 0.10472
    raise ValueError(f"unsupported computed expr: {expr}")


def _decode_message(spec: dict, tables: dict, net_id: str, msg: dict, data: bytes) -> dict:
    slots: dict[str, float] = {}
    out: dict[str, float | str] = {}

    mux_raw = 0
    mux_sig = (msg.get("multiplexing") or {}).get("multiplexorSignal")
    for sig in msg.get("signals", []):
        if sig.get("is_multiplexer") or sig["name"] == mux_sig:
            raw = _extract_le(data, sig["start"], sig["length"])
            mux_raw = raw
            break

    for sig in msg.get("signals", []):
        mux_ids = sig.get("multiplexer_ids")
        if mux_ids is not None and mux_raw not in mux_ids:
            continue

        raw_u = _extract_le(data, sig["start"], sig["length"])
        if sig.get("is_signed"):
            raw_i = _sign_extend(raw_u, sig["length"])
            raw_n = float(raw_i)
        else:
            raw_i = raw_u
            raw_n = float(raw_u)

        phys = _phys_value(sig, raw_n)
        slots[sig["name"]] = phys

        labels = _resolve_labels(sig, tables)
        if labels and raw_i in labels:
            out[sig["name"]] = labels[raw_i]
        else:
            out[sig["name"]] = phys

    for cs in msg.get("computedSignals", []):
        out[cs["name"]] = _eval_computed(cs, slots)

    net = next(n for n in spec["networks"] if n["id"] == net_id)
    for cs in net.get("computedSignals", []):
        if cs["name"] in out:
            continue
        try:
            out[cs["name"]] = _eval_computed(cs, slots)
        except KeyError:
            pass  # network computed only applies when operands are in this message

    return out


def _oracle_by_message(spec: dict) -> dict[str, dict[str, float | str | int]]:
    tables = _label_tables(spec)
    oracle: dict[str, dict[str, float | str | int]] = {}

    # Raw bytes from DecoderTest.cpp (same as slcan fixtures).
    frames = {
        "BMS_Status": ("powertrain", 256, bytes.fromhex(
            "8C9BCEFF64411200000000000000000000")),
        "MCU_Drive": ("powertrain", 512, bytes.fromhex("E8036402D2040000")),
        "BMS_CellArray": ("powertrain", 257, bytes.fromhex("0588904600000000")),
        "Diagnostics@mux0": ("chassis", 1536, bytes.fromhex("00E8350000000000")),
        "Diagnostics@mux1": ("chassis", 1536, bytes.fromhex("0100010000000000")),
    }

    msg_by_name: dict[str, tuple[str, dict]] = {}
    for net in spec.get("networks", []):
        for msg in net["messages"]:
            msg_by_name[msg["name"]] = (net["id"], msg)

    for key, (_bus, _id, data) in frames.items():
        base = key.split("@")[0]
        net_id, msg = msg_by_name[base]
        oracle[key] = _decode_message(spec, tables, net_id, msg, data)
    return oracle


# --- C++ engine via file replay ---------------------------------------------


def _decode_via_engine() -> dict[str, dict]:
    can_engine = _require_can_engine()
    assert _MDC.exists(), f"missing MDC: {_MDC}"

    config = {
        "role": "desktop",
        "bus": {"type": "inproc", "capacity": 4096},
        "sources": [
            {"type": "file", "path": str(_PT_SLCAN), "bus": "powertrain"},
            {"type": "file", "path": str(_CH_SLCAN), "bus": "chassis"},
        ],
    }
    handle = can_engine.EngineHandle(config)
    handle.load_mdc(_MDC.read_text())
    handle.start()
    try:
        deadline = time.monotonic() + 5.0
        collected: list[dict] = []
        while time.monotonic() < deadline and len(collected) < 5:
            batch = handle.poll_batch(timeout_ms=200)
            if batch:
                collected.extend(batch)
        assert len(collected) >= 5, f"expected 5 decoded frames, got {len(collected)}: {collected}"

        by_name: dict[str, dict] = {}
        diag_idx = 0
        for item in collected:
            name = item.get("message_name")
            if not name:
                continue
            sigs = dict(item["signals"])
            if name == "Diagnostics":
                by_name[f"Diagnostics@mux{diag_idx}"] = sigs
                diag_idx += 1
            else:
                by_name[name] = sigs
            if name == "BMS_CellArray" and "array_index" in item:
                by_name[name]["CellIndex"] = float(item["array_index"])
        return by_name
    finally:
        handle.stop()


def _near(a: float, b: float) -> bool:
    if a == b:
        return True
    denom = max(abs(a), abs(b), 1.0)
    return abs(a - b) / denom <= _REL_TOL


def _compare_signals(
    expected: dict[str, float | str | int],
    got: dict,
    oracle: dict,
    label: str,
) -> list[str]:
    mismatches: list[str] = []
    for sig, want in expected.items():
        cpp = got.get(sig)
        ref = oracle.get(sig)
        if isinstance(want, str):
            if cpp != want:
                mismatches.append(f"{label}.{sig}: cpp={cpp!r} want={want!r}")
            if ref != want:
                mismatches.append(f"{label}.{sig}: oracle={ref!r} want={want!r}")
        else:
            if not isinstance(cpp, (int, float)) or not _near(float(cpp), float(want)):
                mismatches.append(f"{label}.{sig}: cpp={cpp!r} want={want}")
            if not isinstance(ref, (int, float)) or not _near(float(ref), float(want)):
                mismatches.append(f"{label}.{sig}: oracle={ref!r} want={want}")
    return mismatches


def test_decode_parity_lhr_ev1():
    """C++ engine and v3-oracle agree on lhr-ev1 fixture signal values."""
    spec = json.loads(_MDC.read_text())
    oracle = _oracle_by_message(spec)
    cpp = _decode_via_engine()

    mismatches: list[str] = []
    for key, expected in _EXPECTED.items():
        got = cpp.get(key)
        if got is None:
            mismatches.append(f"{key}: missing from engine output (have {list(cpp)})")
            continue
        mismatches.extend(_compare_signals(expected, got, oracle.get(key, {}), key))

    assert not mismatches, "decode parity mismatches:\n" + "\n".join(mismatches)


# --- contract conformance (config + API status shape) -----------------------


def test_mdc_example_validates_against_bundle_schema():
    from backend.schemas import validate_mdc

    spec = json.loads(_MDC.read_text())
    validate_mdc(spec)


def test_config_schema_accepts_server_example():
    from backend.schemas import validate_config

    cfg = json.loads((_REPO / "backend" / "examples" / "server.config.json").read_text())
    validate_config(cfg)  # raises ValidationError on failure


def test_status_payload_matches_api_contract():
    """``telemetry.status_payload()`` includes every API_CONTRACT.md status field."""
    from backend.telemetry import TelemetryService

    svc = TelemetryService()
    payload = svc.status_payload()
    required = {
        "service_running",
        "influx_connected",
        "grafana_active",
        "grafana_url",
        "parser_status",
        "parser_connection_state",
        "error_message",
        "dbc_errors",
        "influx_bucket",
        "vehicle",
        "active_event",
    }
    missing = required - set(payload)
    assert not missing, f"status payload missing contract fields: {missing}"
    assert isinstance(payload["dbc_errors"], list)
    assert payload["active_event"] is None
