#!/usr/bin/env python3
"""Space out state-timelines and merge same-measurement fault-bit queries.

- Lower rowHeight so rows aren't glued together; grow panel height with #series.
- Collapse N Flux targets on the same measurement into one or-filter query
  (one panel element for a whole fault/limit bitmap group).
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"
INFLUX_DS = {"type": "influxdb", "uid": "influxdb_main"}

MEASUREMENT_RE = re.compile(r'r\._measurement\s*==\s*"([^"]+)"')
FIELD_RE = re.compile(r'r\._field\s*==\s*"([^"]+)"')


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


def parse_target(t: dict) -> tuple[str | None, str | None, str]:
    q = t.get("query") or ""
    m = MEASUREMENT_RE.search(q)
    f = FIELD_RE.search(q)
    return (m.group(1) if m else None, f.group(1) if f else None, q)


def merged_timeline_query(measurement: str, fields: list[str]) -> str:
    if len(fields) == 1:
        field_filter = f'  |> filter(fn: (r) => r._field == "{fields[0]}")\n'
    else:
        ors = " or ".join(f'r._field == "{f}"' for f in fields)
        field_filter = f"  |> filter(fn: (r) => {ors})\n"
    return (
        f'from(bucket: "telemetry_main")\n'
        f"  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n"
        f'  |> filter(fn: (r) => r._measurement == "{measurement}")\n'
        f"{field_filter}"
        f'  |> filter(fn: (r) => r.vehicle == "HighNoon")\n'
        f'  |> group(columns: ["_field"])\n'
        f"  |> aggregateWindow(every: v.windowPeriod, fn: last, createEmpty: false)\n"
        f'  |> keep(columns: ["_time", "_value", "_field"])'
    )


def merge_timeline_targets(panel: dict) -> int:
    targets = panel.get("targets") or []
    if len(targets) < 2:
        # Still normalize single-target keep/group if missing
        if len(targets) == 1 and isinstance(targets[0], dict) and targets[0].get("query"):
            meas, field, q = parse_target(targets[0])
            if meas and field and 'keep(columns: ["_time"' not in q:
                panel["targets"] = [
                    {
                        "datasource": dict(INFLUX_DS),
                        "refId": "A",
                        "query": merged_timeline_query(meas, [field]),
                    }
                ]
                return 1
        return 0

    # Group by measurement; only merge groups that share one measurement and all have fields
    by_meas: dict[str, list[str]] = {}
    other: list[dict] = []
    for t in targets:
        if not isinstance(t, dict) or t.get("channel") or t.get("queryType") == "measurements":
            other.append(t)
            continue
        meas, field, q = parse_target(t)
        if not meas or not field:
            other.append(t)
            continue
        # Skip already-complex queries (pivot/union)
        if "pivot(" in q or "union(" in q or "join." in q:
            other.append(t)
            continue
        by_meas.setdefault(meas, []).append(field)

    if not by_meas:
        return 0

    new_targets: list[dict] = []
    ref = 0
    for meas, fields in by_meas.items():
        # de-dupe preserve order
        seen = set()
        uniq = []
        for f in fields:
            if f not in seen:
                seen.add(f)
                uniq.append(f)
        letter = chr(ord("A") + ref)
        ref += 1
        new_targets.append(
            {
                "datasource": dict(INFLUX_DS),
                "refId": letter,
                "query": merged_timeline_query(meas, uniq),
            }
        )
    new_targets.extend(other)
    if new_targets != targets:
        panel["targets"] = new_targets
        return 1
    return 0


def series_count(panel: dict) -> int:
    n = 0
    for t in panel.get("targets") or []:
        q = t.get("query") or ""
        fields = FIELD_RE.findall(q)
        if fields:
            n += len(fields)
        elif t.get("channel"):
            n += 1
        else:
            n += 1
    return max(n, 1)


def space_timeline(panel: dict) -> int:
    changed = 0
    opts = panel.setdefault("options", {})
    # Lower rowHeight → more gap between rows (Grafana: 1=fill, <1 leaves space)
    if opts.get("rowHeight") != 0.6:
        opts["rowHeight"] = 0.6
        changed += 1
    if opts.get("mergeValues") is not True:
        opts["mergeValues"] = True
        changed += 1
    if opts.get("showValue") != "never":
        # Values on segments clutter dense bitmaps; color+legend is enough
        opts["showValue"] = "never"
        changed += 1

    n = series_count(panel)
    g = panel.setdefault("gridPos", {})
    # ~0.7–1 grid unit per series + header/legend padding; keep readable
    want_h = min(28, max(8, int(round(n * 0.85)) + 4))
    if g.get("h") != want_h:
        g["h"] = want_h
        changed += 1

    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
    if defaults.get("displayName") != "${__field.name}":
        defaults["displayName"] = "${__field.name}"
        changed += 1
    return changed


def reflow_dashboard(data: dict) -> int:
    """After growing timeline heights, push panels down so they don't overlap."""
    panels = [p for p in (data.get("panels") or []) if isinstance(p, dict)]
    if not panels:
        return 0
    # Only top-level panels participate in grid (nested in rows are rare here)
    items = []
    for p in panels:
        g = p.get("gridPos")
        if not isinstance(g, dict):
            continue
        items.append(p)
    items.sort(key=lambda p: (int((p.get("gridPos") or {}).get("y") or 0), int((p.get("gridPos") or {}).get("x") or 0)))

    # Track occupied bottom per column strip — simple: sequential by y order
    # Rebuild y: walk in original y order, place each at max(current_y, previous bottom in overlapping x)
    changed = 0
    bottoms: list[tuple[int, int, int]] = []  # (x0, x1, bottom_y)

    for p in items:
        g = p["gridPos"]
        x = int(g.get("x") or 0)
        w = int(g.get("w") or 24)
        h = int(g.get("h") or 1)
        x1 = x + w
        y = int(g.get("y") or 0)
        # Find lowest bottom among overlapping columns
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
    counts = {"merge": 0, "space": 0, "reflow": 0}
    for panel in walk_panels(data):
        if panel.get("type") != "state-timeline":
            continue
        counts["merge"] += merge_timeline_targets(panel)
        counts["space"] += space_timeline(panel)
    counts["reflow"] = reflow_dashboard(data)
    if not dry_run:
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    files = [DASH_DIR / args.file] if args.file else sorted(DASH_DIR.glob("*.json"))
    totals = {"merge": 0, "space": 0, "reflow": 0}
    for path in files:
        c = fix_file(path, args.dry_run)
        print(f"{path.name}: {c}")
        for k, v in c.items():
            totals[k] += v
    print("totals", totals)


if __name__ == "__main__":
    main()
