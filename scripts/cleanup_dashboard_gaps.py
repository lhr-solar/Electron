#!/usr/bin/env python3
"""Fix HighNoon dashboard gaps after Live conversion.

1. Power stats that were wrongly converted to Live (showing voltage as watts)
   → Influx last() join.time V×I over -30s
2. Age stats that were wrongly converted to Live (showing raw signal as seconds)
   → Influx age Flux (now - last _time)
3. Value mappings restored from highnoon_schema.json choices
   - Fix inverted OK/NOK (schema 0=OK was rewritten as 0=NOK)
   - Driver idle "-" → "Off" so idle ≠ missing data
4. Sensible noValue defaults
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"
SCHEMA_PATH = ROOT / "scripts" / "highnoon_schema.json"
INFLUX_DS = {"type": "influxdb", "uid": "influxdb_main"}

# Live power stats that must be V×I joins (measurement_v, field_v, measurement_i, field_i)
POWER_JOINS: dict[tuple[str, int], tuple[str, str, str, str]] = {
    # overview
    ("00-overview.json", 36): ("1", "Main_Battery_Voltage", "A", "Main_Battery_Current"),
    ("00-overview.json", 37): ("422", "MC_BusVoltage", "422", "MC_BusCurrent"),
    # battery
    ("02-battery-bps.json", 9): ("1", "Main_Battery_Voltage", "A", "Main_Battery_Current"),
    # power electronics
    ("04-power-electronics.json", 6): ("200", "MPPT_Input_Voltage", "200", "MPPT_Input_Current"),
    ("04-power-electronics.json", 7): ("200", "MPPT_Output_Voltage", "200", "MPPT_Output_Current"),
    ("04-power-electronics.json", 21): ("220", "MPPT_Input_Voltage", "220", "MPPT_Input_Current"),
    ("04-power-electronics.json", 22): ("220", "MPPT_Output_Voltage", "220", "MPPT_Output_Current"),
    ("04-power-electronics.json", 36): ("240", "MPPT_Input_Voltage", "240", "MPPT_Input_Current"),
    ("04-power-electronics.json", 37): ("240", "MPPT_Output_Voltage", "240", "MPPT_Output_Current"),
    ("04-power-electronics.json", 53): ("422", "MC_BusVoltage", "422", "MC_BusCurrent"),
    ("04-power-electronics.json", 58): ("302", "Supplemental_Vicor_Voltage", "302", "Supplemental_Vicor_Current"),
    # hv
    ("05-hv.json", 6): ("1", "Main_Battery_Voltage", "A", "Main_Battery_Current"),
    ("05-hv.json", 12): ("422", "MC_BusVoltage", "422", "MC_BusCurrent"),
    # lv
    ("06-lv.json", 5): ("300", "Supplemental_Battery_Voltage", "300", "Supplemental_Battery_Current"),
    ("06-lv.json", 12): ("302", "Supplemental_Vicor_Voltage", "302", "Supplemental_Vicor_Current"),
    # motor
    ("07-motor.json", 55): ("422", "MC_BusVoltage", "422", "MC_BusCurrent"),
    # charging
    ("11-charging.json", 4): ("18FF50E5", "Elcon_VOL_OUT", "18FF50E5", "Elcon_CUR_OUT"),
}

# Total array power = sum of A+B+C MPPT output (47) or input (48)
TOTAL_ARRAY = {
    ("04-power-electronics.json", 47): ("output", [("200", "MPPT_Output_Voltage", "MPPT_Output_Current"),
                                                   ("220", "MPPT_Output_Voltage", "MPPT_Output_Current"),
                                                   ("240", "MPPT_Output_Voltage", "MPPT_Output_Current")]),
    ("04-power-electronics.json", 48): ("input", [("200", "MPPT_Input_Voltage", "MPPT_Input_Current"),
                                                  ("220", "MPPT_Input_Voltage", "MPPT_Input_Current"),
                                                  ("240", "MPPT_Input_Voltage", "MPPT_Input_Current")]),
}

# Schema idle "-" → clearer idle label (true missing stays noValue "—")
IDLE_DASH_REPLACEMENTS = {
    "Ignition_Array": ("Off", "Selected"),
    "Ignition_Motor": ("Off", "Selected"),
    "Ignition_Off": ("Off", "Selected"),
    "Cruise_Set": ("Off", "Pressed"),
    "Gear_Forward": ("Off", "Selected"),
    "Gear_Neutral": ("Off", "Selected"),
    "Gear_Reverse": ("Off", "Selected"),
    "Blinker_Left": ("Off", "On"),
    "Blinker_Right": ("Off", "On"),
    "PushToTalk_Pressed": ("Off", "Pressed"),
    "Regen_Activate": ("Off", "Active"),
    "Hazard_Pressed": ("Off", "Pressed"),
    "Horn_Pressed": ("Off", "Pressed"),
}


def walk_panels(obj, out=None):
    if out is None:
        out = []
    if isinstance(obj, dict):
        if "gridPos" in obj and "type" in obj:
            out.append(obj)
        for v in obj.values():
            walk_panels(v, out)
    elif isinstance(obj, list):
        for i in obj:
            walk_panels(i, out)
    return out


def load_schema_choices() -> dict[str, dict]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    choices: dict[str, dict] = {}
    for msgs in schema.values():
        for msg in msgs:
            for sig in msg.get("signals") or []:
                ch = sig.get("choices")
                if ch:
                    # normalize keys to str
                    choices[sig["name"]] = {str(k): str(v) for k, v in ch.items()}
    return choices


def power_join_query(mv: str, fv: str, mi: str, fi: str) -> str:
    """V×I for a live stat. Prefer field-pivot when V/I share a measurement."""
    # -1h lookback + group() before last(): run_id/tag splits otherwise yield
    # multiple tables and empty pivots; short windows go blank when writes stall.
    if mv == mi:
        return (
            f'from(bucket: "telemetry_main")\n'
            f"  |> range(start: -1h)\n"
            f'  |> filter(fn: (r) => r._measurement == "{mv}")\n'
            f'  |> filter(fn: (r) => r._field == "{fv}" or r._field == "{fi}")\n'
            f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
            f'  |> group(columns: ["_field"])\n'
            f"  |> last()\n"
            f"  |> map(fn: (r) => ({{_time: now(), _value: r._value, _field: r._field}}))\n"
            f"  |> group()\n"
            f'  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
            f"  |> map(fn: (r) => ({{_time: r._time, _value: r.{fv} * r.{fi}, _field: \"Power\"}}))\n"
            f'  |> keep(columns: ["_time", "_value", "_field"])'
        )
    return (
        f'v = from(bucket: "telemetry_main")\n'
        f"  |> range(start: -1h)\n"
        f'  |> filter(fn: (r) => r._measurement == "{mv}")\n'
        f'  |> filter(fn: (r) => r._field == "{fv}")\n'
        f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
        f"  |> group()\n"
        f"  |> last()\n"
        f'  |> map(fn: (r) => ({{_time: now(), _value: r._value, _field: "v"}}))\n'
        f'i = from(bucket: "telemetry_main")\n'
        f"  |> range(start: -1h)\n"
        f'  |> filter(fn: (r) => r._measurement == "{mi}")\n'
        f'  |> filter(fn: (r) => r._field == "{fi}")\n'
        f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
        f"  |> group()\n"
        f"  |> last()\n"
        f'  |> map(fn: (r) => ({{_time: now(), _value: r._value, _field: "i"}}))\n'
        f"union(tables: [v, i])\n"
        f'  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
        f'  |> map(fn: (r) => ({{_time: r._time, _value: r.v * r.i, _field: "Power"}}))\n'
        f'  |> keep(columns: ["_time", "_value", "_field"])'
    )


def total_array_query(pairs: list[tuple[str, str, str]]) -> str:
    """Sum of three MPPT V×I last() products."""
    parts: list[str] = []
    names: list[str] = []
    for i, (meas, fv, fi) in enumerate(pairs):
        pn = f"p{i}"
        names.append(pn)
        parts.append(
            f'{pn} = from(bucket: "telemetry_main")\n'
            f"  |> range(start: -1h)\n"
            f'  |> filter(fn: (r) => r._measurement == "{meas}")\n'
            f'  |> filter(fn: (r) => r._field == "{fv}" or r._field == "{fi}")\n'
            f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
            f'  |> group(columns: ["_field"])\n'
            f"  |> last()\n"
            f"  |> map(fn: (r) => ({{_time: now(), _value: r._value, _field: r._field}}))\n"
            f"  |> group()\n"
            f'  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
            f"  |> map(fn: (r) => ({{_time: now(), _value: r.{fv} * r.{fi}, _field: \"p{i}\"}}))"
        )
    parts.append(
        f"union(tables: [{', '.join(names)}])\n"
        f'  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
        f"  |> map(fn: (r) => ({{_time: r._time, _value: r.p0 + r.p1 + r.p2, _field: \"Power\"}}))\n"
        f'  |> keep(columns: ["_time", "_value", "_field"])'
    )
    return "\n".join(parts)


def age_query(measurement: str, field: str) -> str:
    return (
        f'from(bucket: "telemetry_main")\n'
        f"  |> range(start: -1h)\n"
        f'  |> filter(fn: (r) => r._measurement == "{measurement}")\n'
        f'  |> filter(fn: (r) => r._field == "{field}")\n'
        f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
        f"  |> group()\n"
        f"  |> last()\n"
        f"  |> map(fn: (r) => ({{ _value: (float(v: uint(v: now())) - float(v: uint(v: r._time))) / 1000000000.0 }}))\n"
        f'  |> keep(columns: ["_value"])'
    )


def is_live_target(t: dict) -> bool:
    return isinstance(t, dict) and (
        t.get("queryType") == "measurements" or bool(t.get("channel"))
    )


def channel_measurement(channel: str | None) -> str | None:
    if not channel:
        return None
    # stream/telemetry/<measurement>
    parts = channel.strip("/").split("/")
    return parts[-1] if parts else None


def to_influx_stat(panel: dict, query: str) -> None:
    panel["datasource"] = dict(INFLUX_DS)
    panel["targets"] = [
        {
            "datasource": dict(INFLUX_DS),
            "refId": "A",
            "query": query,
        }
    ]
    opts = panel.setdefault("options", {})
    reduce = opts.setdefault("reduceOptions", {})
    reduce["calcs"] = ["lastNotNull"]
    reduce["fields"] = ""
    reduce["values"] = False
    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
    if defaults.get("noValue") in (None, ""):
        defaults["noValue"] = "—"


def power_timeseries_query(mv: str, fv: str, mi: str, fi: str, field_name: str = "Power") -> str:
    """Historical V×I. join.time after aggregateWindow needs group(); pivot is more reliable."""
    if mv == mi:
        return (
            f'from(bucket: "telemetry_main")\n'
            f"  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n"
            f'  |> filter(fn: (r) => r._measurement == "{mv}")\n'
            f'  |> filter(fn: (r) => r._field == "{fv}" or r._field == "{fi}")\n'
            f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
            f"  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)\n"
            f'  |> group(columns: ["_time"])\n'
            f'  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
            f"  |> filter(fn: (r) => exists r.{fv} and exists r.{fi})\n"
            f"  |> map(fn: (r) => ({{_time: r._time, _value: r.{fv} * r.{fi}, _field: \"{field_name}\"}}))"
        )
    return (
        f'v = from(bucket: "telemetry_main")\n'
        f"  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n"
        f'  |> filter(fn: (r) => r._measurement == "{mv}")\n'
        f'  |> filter(fn: (r) => r._field == "{fv}")\n'
        f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
        f"  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)\n"
        f'  |> map(fn: (r) => ({{_time: r._time, _value: r._value, _field: "v"}}))\n'
        f"  |> group()\n"
        f'i = from(bucket: "telemetry_main")\n'
        f"  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n"
        f'  |> filter(fn: (r) => r._measurement == "{mi}")\n'
        f'  |> filter(fn: (r) => r._field == "{fi}")\n'
        f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
        f"  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)\n"
        f'  |> map(fn: (r) => ({{_time: r._time, _value: r._value, _field: "i"}}))\n'
        f"  |> group()\n"
        f"union(tables: [v, i])\n"
        f'  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
        f"  |> filter(fn: (r) => exists r.v and exists r.i)\n"
        f'  |> map(fn: (r) => ({{_time: r._time, _value: r.v * r.i, _field: "{field_name}"}}))'
    )


# Timeseries power panels: (file, id) -> V/I pair + output field name
POWER_TIMESERIES: dict[tuple[str, int], tuple[str, str, str, str, str]] = {
    ("00-overview.json", 40): ("1", "Main_Battery_Voltage", "A", "Main_Battery_Current", "Pack_Power"),
    ("02-battery-bps.json", 10): ("1", "Main_Battery_Voltage", "A", "Main_Battery_Current", "Pack_Power"),
    ("05-hv.json", 7): ("1", "Main_Battery_Voltage", "A", "Main_Battery_Current", "Pack_Power"),
    ("05-hv.json", 13): ("422", "MC_BusVoltage", "422", "MC_BusCurrent", "MC_Bus_Power"),
    ("06-lv.json", 8): ("300", "Supplemental_Battery_Voltage", "300", "Supplemental_Battery_Current", "Supp_Power"),
    ("06-lv.json", 15): ("302", "Supplemental_Vicor_Voltage", "302", "Supplemental_Vicor_Current", "Vicor_Power"),
    ("07-motor.json", 58): ("422", "MC_BusVoltage", "422", "MC_BusCurrent", "Bus_Power"),
}


def fix_power_timeseries(fname: str, panel: dict) -> bool:
    key = (fname, panel.get("id"))
    spec = POWER_TIMESERIES.get(key)
    if not spec:
        # Heuristic: timeseries with join.time / Power title
        if panel.get("type") != "timeseries":
            return False
        title = panel.get("title") or ""
        if not re.search(r"\bPower\b", title, re.I):
            return False
        targets = panel.get("targets") or []
        if not targets:
            return False
        q = targets[0].get("query") or ""
        if "join.time" not in q and "join(tables:" not in q:
            return False
        ms = re.findall(r'_measurement == "([^"]+)"', q)
        fs = re.findall(r'_field == "([^"]+)"', q)
        if len(ms) >= 2 and len(fs) >= 2:
            spec = (ms[0], fs[0], ms[1], fs[1], "Power")
        elif len(ms) >= 1 and len(fs) >= 2:
            spec = (ms[0], fs[0], ms[0], fs[1], "Power")
        else:
            return False
    mv, fv, mi, fi, out = spec
    panel["datasource"] = dict(INFLUX_DS)
    panel["targets"] = [
        {
            "datasource": dict(INFLUX_DS),
            "refId": "A",
            "query": power_timeseries_query(mv, fv, mi, fi, out),
        }
    ]
    return True


def fix_power_panel(fname: str, panel: dict) -> bool:
    key = (fname, panel.get("id"))
    if key in TOTAL_ARRAY:
        _, pairs = TOTAL_ARRAY[key]
        to_influx_stat(panel, total_array_query(pairs))
        defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
        defaults["unit"] = "watt"
        defaults["noValue"] = "—"
        return True
    spec = POWER_JOINS.get(key)
    if not spec:
        return False
    # Always rewrite so query shape stays current (pivot / -5m lookback).
    mv, fv, mi, fi = spec
    to_influx_stat(panel, power_join_query(mv, fv, mi, fi))
    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
    defaults["unit"] = "watt"
    defaults["noValue"] = "—"
    return True


def fix_age_panel(panel: dict) -> bool:
    title = panel.get("title") or ""
    if not re.search(r"\bage\b", title, re.I):
        return False
    if re.search(r"Tap Age|tap age", title):
        return False
    targets = panel.get("targets") or []
    if not targets:
        return False
    t0 = targets[0]
    meas = None
    field = None
    if is_live_target(t0):
        meas = channel_measurement(t0.get("channel"))
        fields = ((t0.get("filter") or {}).get("fields")) or []
        field = fields[0] if fields else None
    else:
        q = t0.get("query") or ""
        if "uint(v: now())" not in q and "float(v: uint(v: now()))" not in q:
            # Already age-like or not — only rewrite known age panels / Live leftovers
            if "keep(columns: [\"_value\"])" not in q and "now()" not in q:
                return False
        ms = re.findall(r'_measurement == "([^"]+)"', q)
        fs = re.findall(r'_field == "([^"]+)"', q)
        meas = ms[0] if ms else None
        field = fs[0] if fs else None
    if not meas or not field:
        return False
    if field.endswith("_Age") or field.endswith("_age"):
        return False
    to_influx_stat(panel, age_query(meas, field))
    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
    defaults["unit"] = "s"
    defaults["noValue"] = "stale"
    defaults["decimals"] = 1
    defaults["thresholds"] = {
        "mode": "absolute",
        "steps": [
            {"color": "green", "value": None},
            {"color": "yellow", "value": 2},
            {"color": "red", "value": 5},
        ],
    }
    defaults["color"] = {"mode": "thresholds"}
    return True


def color_for_choice(text: str, value: str) -> str:
    t = text.strip().lower()
    if t in {"ok", "closed", "enabled", "on", "selected", "pressed", "active", "pass", "forward"}:
        return "green"
    if t in {"nok", "not ok", "open", "fault", "fail", "error"}:
        return "red"
    if t in {"neutral", "-", "—", "off", "disabled", "idle"}:
        return "text"
    if value == "0" and t in {"ok", "normal"}:
        return "green"
    if value != "0" and t not in {"ok"}:
        if "fault" in t or "error" in t or "over" in t or "under" in t:
            return "red"
    return "green" if value == "0" else "orange"


def mapping_from_choices(choices: dict[str, str], field: str | None = None) -> list[dict]:
    # Replace schema "-" idle with Off/Selected style when known
    idle = IDLE_DASH_REPLACEMENTS.get(field or "")
    opts = {}
    for i, (k, v) in enumerate(sorted(choices.items(), key=lambda kv: int(kv[0]) if kv[0].lstrip("-").isdigit() else kv[0])):
        text = v
        if idle and k in ("0", "1"):
            text = idle[0] if k == "0" else idle[1]
        elif v.strip() == "-":
            text = "Off"
        color = color_for_choice(text if text != v else v, k)
        # Standard OK/NOK polarity from schema
        if v.upper() == "OK":
            text, color = "OK", "green"
        elif v.upper() in {"NOK", "NOT OK", "FAULT"} or (len(choices) == 2 and k == "1" and choices.get("0", "").upper() == "OK"):
            if v.upper() == "OK":
                pass
            elif choices.get("0", "").upper() == "OK" and k != "0":
                # keep schema text for multi-fault; for binary 1 often fault name
                if len(choices) == 2 and set(x.upper() for x in choices.values()) <= {"OK", "NOK", "NOT OK", "FAULT"}:
                    text, color = ("OK", "green") if v.upper() == "OK" else ("NOK", "red")
                elif len(choices) == 2 and choices.get("0", "").upper() == "OK":
                    text = "OK" if k == "0" else "NOK"
                    color = "green" if k == "0" else "red"
        opts[k] = {"text": text, "color": color, "index": i}
    # Clean binary OK/NOK from schema
    if set(choices.keys()) == {"0", "1"}:
        c0, c1 = choices["0"], choices["1"]
        if c0.upper() == "OK":
            opts["0"] = {"text": "OK", "color": "green", "index": 0}
            opts["1"] = {"text": "NOK", "color": "red", "index": 1}
        elif idle:
            opts["0"] = {"text": idle[0], "color": "text", "index": 0}
            opts["1"] = {"text": idle[1], "color": "green", "index": 1}
        elif c0.strip() == "-":
            opts["0"] = {"text": "Off", "color": "text", "index": 0}
            opts["1"] = {"text": c1 if c1.strip() != "-" else "On", "color": "green", "index": 1}
    return [{"type": "value", "options": opts}]


def panel_fields(panel: dict) -> list[str]:
    fields: list[str] = []
    for t in panel.get("targets") or []:
        if not isinstance(t, dict):
            continue
        ff = ((t.get("filter") or {}).get("fields")) or []
        fields.extend(ff)
        q = t.get("query") or ""
        fields.extend(re.findall(r'_field == "([^"]+)"', q))
    return fields


def fix_mappings(panel: dict, schema_choices: dict[str, dict]) -> int:
    changed = 0
    fields = panel_fields(panel)
    primary = fields[0] if fields else None
    choices = schema_choices.get(primary) if primary else None

    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
    mappings = defaults.get("mappings")

    if choices and panel.get("type") in ("stat", "gauge", "bargauge", "state-timeline", "table"):
        new_maps = mapping_from_choices(choices, primary)
        if mappings != new_maps:
            defaults["mappings"] = new_maps
            changed += 1
            if panel.get("type") in ("stat", "gauge", "bargauge"):
                opts = panel.setdefault("options", {})
                if opts.get("colorMode") != "background":
                    opts["colorMode"] = "background"
                    changed += 1
    elif isinstance(mappings, list):
        # Fix inverted binary OK/NOK even without schema field match
        for m in mappings:
            if m.get("type") != "value":
                continue
            opts = m.get("options") or {}
            if set(opts.keys()) != {"0", "1"}:
                continue
            t0 = str((opts.get("0") or {}).get("text") or "")
            t1 = str((opts.get("1") or {}).get("text") or "")
            if t0 == "NOK" and t1 == "OK":
                opts["0"] = {**(opts.get("0") or {}), "text": "OK", "color": "green"}
                opts["1"] = {**(opts.get("1") or {}), "text": "NOK", "color": "red"}
                changed += 1
            elif t0.strip() == "-":
                opts["0"] = {**(opts.get("0") or {}), "text": "Off", "color": "text"}
                if t1.strip() in {"-", "—"}:
                    opts["1"] = {**(opts.get("1") or {}), "text": "On", "color": "green"}
                changed += 1

    # Timeline overrides: replace "-" with Off
    for ov in (panel.get("fieldConfig") or {}).get("overrides") or []:
        field_name = (ov.get("matcher") or {}).get("options")
        for prop in ov.get("properties") or []:
            if prop.get("id") != "mappings":
                continue
            for m in prop.get("value") or []:
                if m.get("type") != "value":
                    continue
                opts = m.get("options") or {}
                idle = IDLE_DASH_REPLACEMENTS.get(field_name or "")
                for k, v in list(opts.items()):
                    if not isinstance(v, dict):
                        continue
                    if v.get("text") in ("-", "—"):
                        if idle and k == "0":
                            v["text"] = idle[0]
                            v["color"] = "text"
                        else:
                            v["text"] = "Off"
                            v["color"] = "text"
                        changed += 1
                    elif idle and k == "1" and v.get("text") in ("Selected", "Pressed", "OK", "On"):
                        v["text"] = idle[1]
                        v["color"] = "green"
                        changed += 1
    return changed


def fix_novalue(panel: dict) -> int:
    if panel.get("type") not in ("stat", "gauge", "bargauge"):
        return 0
    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
    title = panel.get("title") or ""
    changed = 0
    if re.search(r"\bage\b", title, re.I) and not re.search(r"Tap Age", title, re.I):
        if defaults.get("noValue") != "stale":
            defaults["noValue"] = "stale"
            changed += 1
    elif defaults.get("noValue") in (None, "", "-"):
        defaults["noValue"] = "—"
        changed += 1
    return changed


def fix_live_reduce(panel: dict) -> int:
    """Keep Live reduce pinned to exact field name (not regex with tags)."""
    changed = 0
    for t in panel.get("targets") or []:
        if not is_live_target(t):
            continue
        fields = ((t.get("filter") or {}).get("fields")) or []
        if not fields:
            continue
        field = fields[0]
        if t.get("buffer") != 1:
            t["buffer"] = 1
            changed += 1
        if panel.get("type") in ("stat", "gauge", "bargauge"):
            opts = panel.setdefault("options", {})
            reduce = opts.setdefault("reduceOptions", {})
            # Exact name — Live frames are field-named without tags
            if reduce.get("fields") not in (field, f"/^{re.escape(field)}$/", f"/{re.escape(field)}/"):
                reduce["fields"] = field
                changed += 1
            elif reduce.get("fields") != field:
                reduce["fields"] = field
                changed += 1
            if reduce.get("calcs") != ["lastNotNull"]:
                reduce["calcs"] = ["lastNotNull"]
                changed += 1
    return changed


def precharge_delta_query() -> str:
    return (
        'bat = from(bucket: "telemetry_main")\n'
        "  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n"
        '  |> filter(fn: (r) => r._measurement == "21")\n'
        '  |> filter(fn: (r) => r._field == "VCU_Precharge_Battery_Voltage")\n'
        '  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
        "  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)\n"
        '  |> map(fn: (r) => ({_time: r._time, _value: r._value, _field: "bat"}))\n'
        "  |> group()\n"
        'mot = from(bucket: "telemetry_main")\n'
        "  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n"
        '  |> filter(fn: (r) => r._measurement == "21")\n'
        '  |> filter(fn: (r) => r._field == "VCU_Precharge_Motor_Voltage")\n'
        '  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
        "  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)\n"
        '  |> map(fn: (r) => ({_time: r._time, _value: r._value, _field: "mot"}))\n'
        "  |> group()\n"
        "union(tables: [bat, mot])\n"
        '  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
        "  |> filter(fn: (r) => exists r.bat and exists r.mot)\n"
        '  |> map(fn: (r) => ({_time: r._time, _value: r.bat - r.mot, _field: "Precharge_Delta"}))'
    )


def fix_remaining_joins(fname: str, panel: dict) -> int:
    """Rewrite leftover join.time power/delta targets that the Power heuristics missed."""
    changed = 0
    # HV precharge delta
    if fname == "05-hv.json" and panel.get("id") == 20:
        panel["datasource"] = dict(INFLUX_DS)
        panel["targets"] = [
            {"datasource": dict(INFLUX_DS), "refId": "A", "query": precharge_delta_query()}
        ]
        return 1
    # PE combined V/I/Power panels: keep V+I targets, replace power join target
    if fname == "04-power-electronics.json" and panel.get("id") in (54, 59):
        specs = {
            54: ("422", "MC_BusVoltage", "422", "MC_BusCurrent", "MC_Bus_Power"),
            59: ("302", "Supplemental_Vicor_Voltage", "302", "Supplemental_Vicor_Current", "Vicor_Power"),
        }
        mv, fv, mi, fi, out = specs[panel["id"]]
        new_targets = []
        for t in panel.get("targets") or []:
            q = t.get("query") or ""
            if "join.time" in q or "join(tables:" in q:
                new_targets.append(
                    {
                        "datasource": dict(INFLUX_DS),
                        "refId": t.get("refId") or "C",
                        "query": power_timeseries_query(mv, fv, mi, fi, out),
                    }
                )
                changed += 1
            else:
                new_targets.append(t)
        if changed:
            panel["targets"] = new_targets
        return changed
    return 0


def fix_file(path: Path, schema_choices: dict, dry_run: bool) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    fname = path.name
    counts = {"power": 0, "power_ts": 0, "age": 0, "mappings": 0, "novalue": 0, "live": 0, "joins": 0}
    for panel in walk_panels(data):
        if panel.get("type") == "row":
            continue
        if fix_power_panel(fname, panel):
            counts["power"] += 1
        if fix_power_timeseries(fname, panel):
            counts["power_ts"] += 1
        counts["joins"] += fix_remaining_joins(fname, panel)
        if fix_age_panel(panel):
            counts["age"] += 1
        n = fix_mappings(panel, schema_choices)
        counts["mappings"] += n
        counts["novalue"] += fix_novalue(panel)
        counts["live"] += fix_live_reduce(panel)
    if not dry_run:
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    schema_choices = load_schema_choices()
    files = [DASH_DIR / args.file] if args.file else sorted(DASH_DIR.glob("*.json"))
    totals = {"power": 0, "power_ts": 0, "age": 0, "mappings": 0, "novalue": 0, "live": 0, "joins": 0}
    for path in files:
        c = fix_file(path, schema_choices, args.dry_run)
        print(f"{path.name}: {c}")
        for k, v in c.items():
            totals[k] += v
    print("totals", totals)


if __name__ == "__main__":
    main()
