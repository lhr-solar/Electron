#!/usr/bin/env python3
"""Tune HighNoon Live value panels + dashboard refresh after Live conversion.

- Set dashboard refresh to 1s (Influx time-series)
- Pin stat/gauge reduceOptions.fields to the Live filter field name
- Cap Live buffer so StreamingDataFrame stays stable
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"
GRAFANA_UID = "-- Grafana --"


def fix_panel(panel: dict) -> int:
    changed = 0
    targets = panel.get("targets") or []
    live_field = None
    for t in targets:
        if not isinstance(t, dict) or t.get("queryType") != "measurements":
            continue
        # Explicit buffer keeps frames from growing forever / mismatching.
        if t.get("buffer") != 1:
            t["buffer"] = 1
            changed += 1
        fields = ((t.get("filter") or {}).get("fields")) or []
        if fields:
            live_field = fields[0]

    if live_field and panel.get("type") in ("stat", "gauge", "bargauge"):
        opts = panel.setdefault("options", {})
        reduce = opts.setdefault("reduceOptions", {})
        # Exact field — empty "" leaves panels blank when Live frame has labels/time first.
        want = f"/^{live_field}$/"
        if reduce.get("fields") != want and reduce.get("fields") != live_field:
            reduce["fields"] = live_field
            changed += 1
        if reduce.get("calcs") != ["lastNotNull"]:
            reduce["calcs"] = ["lastNotNull"]
            changed += 1
        if reduce.get("values") is not False:
            reduce["values"] = False
            changed += 1
    return changed + sum(fix_panel(p) for p in (panel.get("panels") or []) if isinstance(p, dict))


def fix_file(path: Path, dry_run: bool) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    n = sum(fix_panel(p) for p in (data.get("panels") or []) if isinstance(p, dict))
    if data.get("refresh") != "1s":
        data["refresh"] = "1s"
        n += 1
    tp = data.setdefault("timepicker", {})
    intervals = tp.get("refresh_intervals")
    if isinstance(intervals, list):
        desired = ["1s", "2s", "5s", "10s", "30s", "1m", "5m"]
        if intervals != desired:
            tp["refresh_intervals"] = desired
            n += 1
    if not dry_run and n:
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    files = [DASH_DIR / args.file] if args.file else sorted(DASH_DIR.glob("*.json"))
    total = 0
    for path in files:
        n = fix_file(path, args.dry_run)
        print(f"{path.name}: {n}")
        total += n
    print("total", total)


if __name__ == "__main__":
    main()
