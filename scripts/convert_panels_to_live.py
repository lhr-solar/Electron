#!/usr/bin/env python3
"""Convert HighNoon Flux last() live panels to Grafana Live Measurements.

Keeps historical panels (v.timeRangeStart / aggregateWindow) on Influx.
Sets dashboard refresh to 1s (Influx time-series; Live stats update via WS).

Usage:
  python scripts/convert_panels_to_live.py              # all HighNoon
  python scripts/convert_panels_to_live.py --file 00-overview.json
  python scripts/convert_panels_to_live.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"

MEASUREMENT_RE = re.compile(r'r\._measurement\s*==\s*"([^"]+)"')
FIELD_RE = re.compile(r'r\._field\s*==\s*"([^"]+)"')
LAST_RE = re.compile(r"\|\>\s*last\s*\(")
HISTORICAL_MARKERS = ("v.timeRangeStart", "aggregateWindow", "v.timeRangeStop")

GRAFANA_DS = {"type": "datasource", "uid": "-- Grafana --"}
STREAM_ID = "telemetry"


def is_live_flux(query: str) -> bool:
    if not query or not LAST_RE.search(query):
        return False
    if any(m in query for m in HISTORICAL_MARKERS):
        return False
    # Multi-stream joins (power) and age Flux must stay on Influx.
    if "join." in query or "join(" in query or 'import "join"' in query:
        return False
    if "uint(v: now())" in query or "float(v: uint(v: now()))" in query:
        return False
    return bool(MEASUREMENT_RE.search(query))


def should_skip_panel(panel: dict) -> bool:
    title = panel.get("title") or ""
    if re.search(r"\bage\b", title, re.I) and not re.search(r"Tap Age", title, re.I):
        return True
    if re.search(r"\bPower\b", title, re.I) and not re.search(
        r"setpoint|request|supply|age", title, re.I
    ):
        # Power V×I stats need Influx joins — never convert to Live.
        return True
    return False


def live_target(ref_id: str, measurement: str, field: str | None) -> dict:
    # Channel path is the measurement name from /api/live/push/<streamId>
    channel = f"stream/{STREAM_ID}/{measurement}"
    target = {
        "refId": ref_id,
        "datasource": GRAFANA_DS,
        "queryType": "measurements",
        "channel": channel,
    }
    if field:
        # Prefer the named field when Live publishes multi-field frames.
        target["filter"] = {"fields": [field]}
    return target


def convert_panel(panel: dict) -> int:
    changed = 0
    targets = panel.get("targets")
    if not isinstance(targets, list) or not targets:
        return 0
    if should_skip_panel(panel):
        return 0

    new_targets = []
    converted_any = False
    for t in targets:
        if not isinstance(t, dict):
            new_targets.append(t)
            continue
        query = t.get("query") or ""
        if not is_live_flux(query):
            new_targets.append(t)
            continue
        m = MEASUREMENT_RE.search(query)
        f = FIELD_RE.search(query)
        measurement = m.group(1) if m else None
        field = f.group(1) if f else None
        if not measurement:
            new_targets.append(t)
            continue
        new_targets.append(live_target(t.get("refId") or "A", measurement, field))
        converted_any = True
        changed += 1

    if converted_any:
        panel["targets"] = new_targets
        panel["datasource"] = dict(GRAFANA_DS)
    return changed


def walk_panels(panels: list | None) -> int:
    total = 0
    for panel in panels or []:
        if not isinstance(panel, dict):
            continue
        total += convert_panel(panel)
        # nested in collapsed rows
        total += walk_panels(panel.get("panels"))
    return total


def convert_file(path: Path, dry_run: bool) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    n = walk_panels(data.get("panels"))
    # Influx graphs: 1s is fine on dedicated grafana hostname; drop 500ms storms.
    if data.get("refresh") != "1s":
        data["refresh"] = "1s"
        n += 1
    intervals = (data.get("timepicker") or {}).get("refresh_intervals")
    if isinstance(intervals, list):
        data["timepicker"]["refresh_intervals"] = ["1s", "2s", "5s", "10s", "30s", "1m", "5m"]
    if not dry_run and n:
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="Single HighNoon dashboard filename")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = [DASH_DIR / args.file] if args.file else sorted(DASH_DIR.glob("*.json"))
    grand = 0
    for path in files:
        if not path.exists():
            raise SystemExit(f"missing {path}")
        n = convert_file(path, args.dry_run)
        print(f"{path.name}: {n} changes{' (dry-run)' if args.dry_run else ''}")
        grand += n
    print(f"total: {grand}")


if __name__ == "__main__":
    main()
