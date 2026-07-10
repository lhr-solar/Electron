#!/usr/bin/env python3
"""Vehicle velocity → mph; collapse MC_FAULT_* Live stats into one panel.

MC_VehicleVelocity is m/s in the DBC. Grafana unit velocitymph converts for display.
Motor rpm / slip / fan speeds are left alone.

Replace grids of small MC_FAULT_* Live tiles with one multi-field Live stat.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"
GRAFANA_DS = {"type": "datasource", "uid": "-- Grafana --"}
VEHICLE_VEL_FIELD = "MC_VehicleVelocity"

OK_NOK_MAP = [
    {
        "type": "value",
        "options": {
            "0": {"text": "OK", "color": "green", "index": 0},
            "1": {"text": "Fault", "color": "red", "index": 1},
        },
    }
]


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


def panel_fields(panel: dict) -> list[str]:
    fields: list[str] = []
    for t in panel.get("targets") or []:
        fields.extend(((t.get("filter") or {}).get("fields")) or [])
        fields.extend(re.findall(r'_field == "([^"]+)"', t.get("query") or ""))
    return fields


def is_live(panel: dict) -> bool:
    for t in panel.get("targets") or []:
        if t.get("queryType") == "measurements" or t.get("channel"):
            return True
    return False


def ensure_mph_unit(panel: dict) -> int:
    """Set unit velocitymph on panels/overrides that show MC_VehicleVelocity."""
    fields = panel_fields(panel)
    if VEHICLE_VEL_FIELD not in fields:
        return 0
    title = panel.get("title") or ""
    if re.search(r"\bage\b", title, re.I):
        return 0

    changed = 0
    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
    overrides = panel.setdefault("fieldConfig", {}).setdefault("overrides", [])

    if defaults.get("unit") == "velocityms":
        defaults["unit"] = "velocitymph"
        changed += 1

    # Single-field vehicle speed stat: set default unit
    if panel.get("type") == "stat" and fields == [VEHICLE_VEL_FIELD]:
        if defaults.get("unit") != "velocitymph":
            defaults["unit"] = "velocitymph"
            changed += 1
        if defaults.get("decimals") is None:
            defaults["decimals"] = 1
            changed += 1

    for ov in overrides:
        if (ov.get("matcher") or {}).get("options") != VEHICLE_VEL_FIELD:
            continue
        for prop in ov.get("properties") or []:
            if prop.get("id") == "unit" and prop.get("value") in ("velocityms", "m/s", "mps"):
                prop["value"] = "velocitymph"
                changed += 1

    # Ensure an override exists for mixed timeseries
    if VEHICLE_VEL_FIELD in fields and set(fields) != {VEHICLE_VEL_FIELD}:
        has = any(
            (ov.get("matcher") or {}).get("options") == VEHICLE_VEL_FIELD
            and any(p.get("id") == "unit" for p in ov.get("properties") or [])
            for ov in overrides
        )
        if not has:
            overrides.append(
                {
                    "matcher": {"id": "byName", "options": VEHICLE_VEL_FIELD},
                    "properties": [
                        {"id": "unit", "value": "velocitymph"},
                        {"id": "displayName", "value": "Vehicle Velocity"},
                    ],
                }
            )
            changed += 1

    return changed


def short_fault_label(field: str) -> str:
    name = field.replace("MC_FAULT_", "")
    name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    return name.replace("_", " ")


def make_combined_fault_panel(template: dict, fields: list[str], title: str, grid: dict) -> dict:
    channel = "stream/telemetry/421"
    for t in template.get("targets") or []:
        if t.get("channel"):
            channel = t["channel"]
            break
    return {
        "id": template.get("id"),
        "type": "stat",
        "title": title,
        "gridPos": dict(grid),
        "datasource": dict(GRAFANA_DS),
        "fieldConfig": {
            "defaults": {
                "noValue": "—",
                "color": {"mode": "thresholds"},
                "mappings": OK_NOK_MAP,
                "thresholds": {
                    "mode": "absolute",
                    "steps": [{"color": "green", "value": None}],
                },
                "displayName": "${__field.name}",
            },
            "overrides": [
                {
                    "matcher": {"id": "byName", "options": f},
                    "properties": [{"id": "displayName", "value": short_fault_label(f)}],
                }
                for f in fields
            ],
        },
        "options": {
            "colorMode": "background",
            "graphMode": "none",
            "justifyMode": "center",
            "orientation": "auto",
            "textMode": "value_and_name",
            "wideLayout": True,
            "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
        },
        "targets": [
            {
                "refId": "A",
                "datasource": dict(GRAFANA_DS),
                "queryType": "measurements",
                "channel": channel,
                "filter": {"fields": list(fields)},
                "buffer": 1,
            }
        ],
    }


def consolidate_mc_fault_stats(data: dict, fname: str) -> int:
    panels = data.get("panels")
    if not isinstance(panels, list):
        return 0

    fault_panels = []
    for p in panels:
        if not isinstance(p, dict) or p.get("type") != "stat":
            continue
        title = p.get("title") or ""
        if re.search(r"\bage\b", title, re.I):
            continue
        fields = panel_fields(p)
        if len(fields) == 1 and fields[0].startswith("MC_FAULT_") and is_live(p):
            fault_panels.append(p)

    if len(fault_panels) < 2:
        return 0

    # One combined panel per dashboard (all MC_FAULT live tiles together)
    fault_panels.sort(key=lambda p: (int(p["gridPos"]["y"]), int(p["gridPos"]["x"])))
    remove_ids: set[int] = set()
    repl_map: dict[int, dict] = {}
    changed = 0

    seen: set[str] = set()
    uniq: list[str] = []
    for p in fault_panels:
        for f in panel_fields(p):
            if f not in seen:
                seen.add(f)
                uniq.append(f)

    first = fault_panels[0]
    ys = [int(p["gridPos"]["y"]) for p in fault_panels]
    grid = {
        "h": max(6, 3 + (len(uniq) + 5) // 6 * 3),
        "w": 24,
        "x": 0,
        "y": min(ys),
    }
    title = "MC Faults (live)" if fname.startswith("01-") else "MC Faults"
    combined = make_combined_fault_panel(first, uniq, title, grid)
    repl_map[first["id"]] = combined
    for p in fault_panels[1:]:
        remove_ids.add(p["id"])
    changed = len(fault_panels)

    if not repl_map:
        return 0

    data["panels"] = [
        repl_map[p["id"]] if isinstance(p, dict) and p.get("id") in repl_map else p
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
    counts = {"mph": 0, "faults": 0, "reflow": 0}
    for panel in walk_panels(data):
        if panel.get("type") == "row":
            continue
        counts["mph"] += ensure_mph_unit(panel)
    counts["faults"] = consolidate_mc_fault_stats(data, path.name)
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
    totals = {"mph": 0, "faults": 0, "reflow": 0}
    for path in files:
        c = fix_file(path, args.dry_run)
        print(f"{path.name}: {c}")
        for k, v in c.items():
            totals[k] += v
    print("totals", totals)


if __name__ == "__main__":
    main()
