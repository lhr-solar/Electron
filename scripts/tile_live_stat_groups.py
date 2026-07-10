#!/usr/bin/env python3
"""Compact Live value boxes into tiled multi-field panels by logical group.

Merges nearby single-field Live stats that share a family (faults, limits,
contactors, temps, …). Multiple Live channels are allowed as multiple targets.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"
GRAFANA_DS = {"type": "datasource", "uid": "-- Grafana --"}

SKIP_TITLE = re.compile(
    r"heatmap|per channel|by idx|by segment|tap faults|tap data|\bage\b",
    re.I,
)
SKIP_FIELD = re.compile(
    r"Tap_Data|Tap_Fault|HSS_Measured|HSS_Current_Limit|HSS_Enabled|HSS_Fault|Voltage_Tap|Temperature_Tap",
    re.I,
)


def walk_top(data: dict) -> list[dict]:
    return [p for p in (data.get("panels") or []) if isinstance(p, dict)]


def panel_fields(p: dict) -> list[str]:
    out: list[str] = []
    for t in p.get("targets") or []:
        out.extend(((t.get("filter") or {}).get("fields")) or [])
    return out


def is_live_stat(p: dict) -> bool:
    if p.get("type") != "stat":
        return False
    title = p.get("title") or ""
    if SKIP_TITLE.search(title):
        return False
    return any(t.get("queryType") == "measurements" or t.get("channel") for t in (p.get("targets") or []))


def channel_of(p: dict) -> str | None:
    for t in p.get("targets") or []:
        if t.get("channel"):
            return t["channel"]
    return None


def short_label(field: str, title: str | None = None) -> str:
    if title and len(title) <= 28 and not title.startswith("MC_"):
        # Keep short human titles from original panels
        bad = {"Electrical", "Temperatures", "Velocity", "Status", "Faults", "Limits"}
        if title not in bad:
            return title
    name = field
    for prefix in (
        "MC_FAULT_",
        "MC_LIMIT_",
        "MC_",
        "BPS_",
        "VCU_",
        "MPPT_",
        "Elcon_",
        "LightingBoard_",
        "Lighting_",
        "Light_",
        "Controls_",
        "Supplemental_",
        "AccelPedal_",
        "BrakePedal_",
        "Brake_",
        "LWS_",
        "Camera_",
        "Cruise_",
        "Gear_",
        "Ignition_",
        "Regen_",
        "Motor_",
        "Array_",
        "HV_",
        "LV_",
        "Main_",
        "Pump_",
        "Coolant_",
        "FlowRate_",
        "Radiator_",
        "BQ25756E_",
        "LTC4421_",
        "Supp_",
        "Telemetry_",
        "Display_",
    ):
        if name.startswith(prefix):
            name = name[len(prefix) :]
            break
    name = name.replace("_", " ")
    name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    return name.strip() or field


def family(field: str, title: str) -> str:
    blob = f"{field} {title}".upper()
    if "FAN" in blob:
        return "fans"
    if "LIMIT" in blob:
        return "limits"
    if any(x in blob for x in ("FAULT", "WATCHDOG", "TIMEOUT", "MISMATCH", "LOCKOUT", "WARNING", "WARN_")):
        return "faults"
    if "CONTACTOR" in blob:
        return "contactors"
    if any(x in blob for x in ("IGNITION", "GEAR_", "CRUISE")):
        return "driver_inputs"
    if any(x in blob for x in ("BLINKER", "HAZARD", "HORN", "PUSHTOTALK", "REGEN_ACTIVATE", "REGEN_ENABLE", "REGEN ACTIVATE", "REGEN ENABLE")):
        return "driver_switches"
    if "SEGMENT" in blob and "STATUS" in blob:
        return "bps_segments"
    if any(x in blob for x in ("CHARGE_OK", "REGEN_OK", "BPS_FAULT", "BPS FAULT")):
        return "bps_status"
    if any(x in blob for x in ("SUPPLY", "RAIL", "15V", "1.9V", "3.3V")):
        return "rails"
    if any(x in blob for x in ("COOLANT", "FLOW", "PUMP")):
        return "cooling"
    if any(x in blob for x in ("TEMP", "HEATSINK", "AMBIENT", "HUMIDITY")):
        return "temps"
    if any(x in blob for x in ("VELOCITY", "SLIP", "WHEEL RPM", "RPM")) and "FAN" not in blob:
        return "speed"
    if any(x in blob for x in ("ODOMETER", "DCBUSAH", "BUS AH", "AH NOMINAL", "AH ACTUAL")):
        return "odometer"
    if any(x in blob for x in ("SETPOINT", "REQUEST")):
        return "setpoints"
    if any(x in blob for x in ("HEADLIGHT", "INDICATOR", "STROBE", "BRAKELIGHT", "CUSTOMMODE", "BLINK_SYNC", "LIGHTING", "LB ")):
        return "lighting"
    if any(x in blob for x in ("CAMERA", "DISPLAY", "HEARTBEAT")):
        return "cabin"
    if "MPPT" in blob and any(x in blob for x in ("INPUT", "OUTPUT")):
        return "mppt_io"
    if "MPPT" in blob:
        return "mppt_status"
    if any(x in blob for x in ("ELCON", "CCS", "CHARGER")) or re.search(r"\bIF\b", blob):
        return "elcon"
    if "FSM" in blob or field.startswith("VCU_"):
        return "vcu"
    if any(x in blob for x in ("PEDAL", "STEERING", "LWS", "BRAKE PRESSURE", "BRAKE_PRESSURE")):
        return "driver_sensors"
    if any(x in blob for x in ("CELL V", "CELL T", "SPREAD", "MEAN", "MIN", "MAX")) and "TAP" not in blob:
        return "cell_stats"
    if any(x in blob for x in ("CURRENT", "VOLTAGE", " IQ", " ID", "_IQ", "_ID", "BEMF", "PHASE", "POWER", "MC_VD", "MC_VQ", " VD", " VQ")):
        return "electrical"
    # bare Vd / Vq panel titles
    if field in ("MC_Vd", "MC_Vq", "MC_Id", "MC_Iq", "MC_BEMFd", "MC_BEMFq") or title in ("Vd", "Vq", "Id", "Iq", "BEMF d", "BEMF q"):
        return "electrical"
    if any(x in blob for x in ("READY", "ENABLED", "SELECTED", "VALID", "MODE", "STATUS", "SOURCE")):
        return "status"
    return "misc"


FAMILY_TITLE = {
    "limits": "Limits",
    "faults": "Faults",
    "contactors": "Contactors",
    "driver_inputs": "Driver Inputs",
    "driver_switches": "Driver Switches",
    "bps_segments": "BPS Segments",
    "bps_status": "BPS Status",
    "rails": "Supply Rails",
    "cooling": "Cooling",
    "temps": "Temperatures",
    "speed": "Velocity",
    "fans": "Radiator Fans",
    "electrical": "Electrical",
    "odometer": "Odometer / Ah",
    "setpoints": "Setpoints / Requests",
    "lighting": "Lighting",
    "cabin": "Cabin / Cameras",
    "mppt_status": "MPPT Status",
    "mppt_io": "MPPT I/O",
    "elcon": "Elcon / Charger",
    "vcu": "VCU Status",
    "driver_sensors": "Driver Sensors",
    "cell_stats": "Cell Stats",
    "status": "Status",
    "misc": "Status",
}


def tile_height(n: int) -> int:
    if n <= 4:
        return 3
    if n <= 8:
        return 4
    if n <= 12:
        return 5
    if n <= 18:
        return 6
    return 7


def group_title(fam: str, items: list[dict]) -> str:
    fields = [c["field"] for c in items]
    titles = " ".join(c["title"] for c in items)
    if fam == "limits" and all(f.startswith("MC_LIMIT_") for f in fields):
        return "MC Limits"
    if fam == "faults" and all(f.startswith("MC_FAULT_") for f in fields):
        return "MC Faults"
    if fam == "faults" and all(f.startswith("VCU_") for f in fields):
        return "VCU Faults"
    if fam == "mppt_io":
        m = re.search(r"MPPT\s*([ABC])", titles, re.I)
        return f"MPPT {m.group(1)} I/O" if m else "MPPT I/O"
    if fam == "mppt_status":
        m = re.search(r"MPPT\s*([ABC])", titles, re.I)
        return f"MPPT {m.group(1)} Status" if m else "MPPT Status"
    if fam == "electrical" and all("Bus" in c["title"] or c["field"].startswith("MC_Bus") for c in items):
        return "MC Bus"
    if fam == "electrical" and all(c["field"] in ("MC_Iq", "MC_Id") for c in items):
        return "MC Id / Iq"
    if fam == "electrical" and all("Phase" in c["title"] or "Phase" in c["field"] for c in items):
        return "Phase Currents"
    if fam == "electrical" and all("BEMF" in c["title"] or "BEMF" in c["field"] or c["field"] in ("MC_Vd", "MC_Vq") for c in items):
        return "MC Voltages / BEMF"
    if fam == "temps" and all(c["field"].startswith("MC_") for c in items):
        return "MC Temperatures"
    if fam == "temps" and "MPPT" in titles:
        m = re.search(r"MPPT\s*([ABC])", titles, re.I)
        return f"MPPT {m.group(1)} Temps" if m else "MPPT Temps"
    if fam == "temps" and "Cabin" in titles:
        return "Cabin Temp / Humidity"
    if fam == "cell_stats" and any("V" in c["title"] for c in items) and not any("T" == c["title"][-1:] for c in items):
        if all("T " in c["title"] or "Temp" in c["title"] for c in items):
            return "Cell Temps"
        if all("V " in c["title"] or "Voltage" in c["title"] or "Cell V" in c["title"] for c in items):
            return "Cell Voltages"
    if fam == "lighting":
        for board in ("Front", "Left", "Rear", "Right", "Canopy"):
            if all(board in c["title"] for c in items):
                return f"Lighting {board}"
        if any("Fault" in c["title"] for c in items):
            return "Lighting Faults"
        if any("Set " in c["title"] or c["field"].startswith("Lighting_") for c in items):
            return "Lighting Commands"
    return FAMILY_TITLE.get(fam, "Status")


def collect_units_decimals(p: dict, field: str) -> tuple[str | None, int | None]:
    d = ((p.get("fieldConfig") or {}).get("defaults") or {})
    unit, decimals = d.get("unit"), d.get("decimals")
    for ov in ((p.get("fieldConfig") or {}).get("overrides") or []):
        if (ov.get("matcher") or {}).get("options") != field:
            continue
        for prop in ov.get("properties") or []:
            if prop.get("id") == "unit":
                unit = prop.get("value")
            if prop.get("id") == "decimals":
                decimals = prop.get("value")
    return unit, decimals


def make_tiled(
    template: dict,
    items: list[dict],
    title: str,
    grid: dict,
) -> dict:
    # Build targets: one per channel, fields listed
    by_ch: dict[str, list[str]] = {}
    labels: dict[str, str] = {}
    units: dict[str, str] = {}
    decimals: dict[str, int] = {}
    mappings = None
    for c in items:
        ch = c["channel"]
        f = c["field"]
        by_ch.setdefault(ch, [])
        if f not in by_ch[ch]:
            by_ch[ch].append(f)
        labels[f] = short_label(f, c["title"])
        u, d = collect_units_decimals(c["panel"], f)
        if u:
            units[f] = u
        if d is not None:
            decimals[f] = d
        m = ((c["panel"].get("fieldConfig") or {}).get("defaults") or {}).get("mappings")
        if m and mappings is None:
            mappings = m

    all_fields = [f for fs in by_ch.values() for f in fs]
    defaults = (template.get("fieldConfig") or {}).get("defaults") or {}
    overrides = []
    for f in all_fields:
        props = [{"id": "displayName", "value": labels[f]}]
        if f in units:
            props.append({"id": "unit", "value": units[f]})
        if f in decimals:
            props.append({"id": "decimals", "value": decimals[f]})
        overrides.append({"matcher": {"id": "byName", "options": f}, "properties": props})

    # Status-like families get background tiles; numeric get value color
    fam = items[0]["family"]
    bg = fam in {
        "faults",
        "limits",
        "contactors",
        "driver_inputs",
        "driver_switches",
        "bps_segments",
        "bps_status",
        "status",
        "vcu",
        "lighting",
        "mppt_status",
    }

    targets = []
    for i, (ch, fs) in enumerate(by_ch.items()):
        targets.append(
            {
                "refId": chr(ord("A") + i),
                "datasource": dict(GRAFANA_DS),
                "queryType": "measurements",
                "channel": ch,
                "filter": {"fields": list(fs)},
                "buffer": 1,
            }
        )

    return {
        "id": template.get("id"),
        "type": "stat",
        "title": title,
        "gridPos": dict(grid),
        "datasource": dict(GRAFANA_DS),
        "fieldConfig": {
            "defaults": {
                "noValue": defaults.get("noValue", "—"),
                "color": {"mode": "thresholds"} if bg else (defaults.get("color") or {"mode": "palette-classic"}),
                "mappings": mappings or [],
                "thresholds": defaults.get("thresholds")
                or {"mode": "absolute", "steps": [{"color": "green", "value": None}]},
                "displayName": "${__field.name}",
            },
            "overrides": overrides,
        },
        "options": {
            "colorMode": "background" if bg else "value",
            "graphMode": "none",
            "justifyMode": "center",
            "orientation": "auto",
            "textMode": "value_and_name",
            "wideLayout": True,
            "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
        },
        "targets": targets,
    }


def shrink_existing_combined(data: dict) -> int:
    n = 0
    for p in walk_top(data):
        if not is_live_stat(p):
            continue
        fs = panel_fields(p)
        if len(fs) < 2:
            continue
        opts = p.setdefault("options", {})
        for k, v in {
            "graphMode": "none",
            "justifyMode": "center",
            "orientation": "auto",
            "textMode": "value_and_name",
            "wideLayout": True,
        }.items():
            if opts.get(k) != v:
                opts[k] = v
                n += 1
        # Prefer background for fault/limit combined panels
        title = (p.get("title") or "").lower()
        if "fault" in title or "limit" in title:
            if opts.get("colorMode") != "background":
                opts["colorMode"] = "background"
                n += 1
        g = p.setdefault("gridPos", {})
        want = tile_height(len(fs))
        if int(g.get("h") or 0) > want:
            g["h"] = want
            n += 1
        if int(g.get("w") or 0) != 24 and int(g.get("x") or 0) == 0:
            g["w"] = 24
            n += 1
    return n


def merge_clusters(data: dict) -> int:
    panels = walk_top(data)
    cands = []
    for p in panels:
        if not is_live_stat(p):
            continue
        fs = panel_fields(p)
        if len(fs) != 1:
            continue
        f = fs[0]
        if SKIP_FIELD.search(f):
            continue
        ch = channel_of(p)
        if not ch:
            continue
        title = p.get("title") or f
        cands.append(
            {
                "panel": p,
                "field": f,
                "title": title,
                "channel": ch,
                "family": family(f, title),
                "y": int((p.get("gridPos") or {}).get("y") or 0),
                "x": int((p.get("gridPos") or {}).get("x") or 0),
            }
        )

    if len(cands) < 2:
        return 0

    # Primary: same family + same channel + nearby y (always safe)
    cands.sort(key=lambda c: (c["family"], c["channel"], c["y"], c["x"]))
    groups: list[list[dict]] = []
    for c in cands:
        if not groups:
            groups.append([c])
            continue
        g = groups[-1]
        head = g[0]
        same = (
            c["family"] == head["family"]
            and c["channel"] == head["channel"]
            and c["family"] != "misc"
        )
        span = 14 if head["family"] in ("faults", "limits", "lighting", "vcu") else 8
        near = abs(c["y"] - min(x["y"] for x in g)) <= span
        if same and near:
            g.append(c)
        else:
            groups.append([c])

    # Secondary: merge adjacent same-family groups across channels when field names don't collide
    def try_merge_across_channels(groups: list[list[dict]]) -> list[list[dict]]:
        if not groups:
            return groups
        out: list[list[dict]] = [list(groups[0])]
        for g in groups[1:]:
            prev = out[-1]
            if (
                g[0]["family"] == prev[0]["family"]
                and g[0]["family"] not in ("misc", "lighting")  # lighting stays per-channel/board
                and abs(min(c["y"] for c in g) - min(c["y"] for c in prev)) <= 8
            ):
                fields_prev = {c["field"] for c in prev}
                if not any(c["field"] in fields_prev for c in g):
                    prev.extend(g)
                    continue
            out.append(list(g))
        return out

    groups = try_merge_across_channels(groups)

    remove_ids: set[int] = set()
    repl: dict[int, dict] = {}
    changed = 0

    for g in groups:
        if len(g) < 2:
            continue
        # Dedupe by field within group (same channel shouldn't duplicate)
        seen: set[str] = set()
        uniq: list[dict] = []
        for c in g:
            if c["field"] in seen:
                continue
            seen.add(c["field"])
            uniq.append(c)
        if len(uniq) < 2:
            continue

        first = uniq[0]["panel"]
        title = group_title(uniq[0]["family"], uniq)
        grid = {
            "h": tile_height(len(uniq)),
            "w": 24,
            "x": 0,
            "y": min(c["y"] for c in uniq),
        }
        combined = make_tiled(first, uniq, title, grid)
        repl[first["id"]] = combined
        for c in uniq[1:]:
            remove_ids.add(c["panel"]["id"])
        changed += len(uniq)

    if not repl:
        return 0

    data["panels"] = [
        repl[p["id"]] if isinstance(p, dict) and p.get("id") in repl else p
        for p in panels
        if not (isinstance(p, dict) and p.get("id") in remove_ids)
    ]
    return changed


def reflow(data: dict) -> int:
    panels = [
        p
        for p in (data.get("panels") or [])
        if isinstance(p, dict) and isinstance(p.get("gridPos"), dict)
    ]
    panels.sort(key=lambda p: (int(p["gridPos"].get("y") or 0), int(p["gridPos"].get("x") or 0)))
    changed = 0
    bottoms: list[tuple[int, int, int]] = []
    for p in panels:
        g = p["gridPos"]
        x, w, h = int(g.get("x") or 0), int(g.get("w") or 24), int(g.get("h") or 1)
        x1 = x + w
        y = int(g.get("y") or 0)
        need = 0
        for bx0, bx1, bb in bottoms:
            if not (x1 <= bx0 or x >= bx1):
                need = max(need, bb)
        if y < need:
            g["y"] = need
            y = need
            changed += 1
        bottoms.append((x, x1, y + h))
    return changed


def fix_file(path: Path, dry_run: bool) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    counts = {"shrink": 0, "merge": 0, "reflow": 0}
    counts["merge"] = merge_clusters(data)
    counts["shrink"] = shrink_existing_combined(data)
    counts["reflow"] = reflow(data)
    if not dry_run:
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    files = [DASH_DIR / args.file] if args.file else sorted(DASH_DIR.glob("*.json"))
    totals = {"shrink": 0, "merge": 0, "reflow": 0}
    for path in files:
        c = fix_file(path, args.dry_run)
        print(f"{path.name}: {c}")
        for k, v in c.items():
            totals[k] += v
    print("totals", totals)


if __name__ == "__main__":
    main()
