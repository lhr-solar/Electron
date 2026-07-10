#!/usr/bin/env python3
"""Fix HighNoon graphs/timelines: clean legends, 5m window, OK/limit/fault colors.

- Collapse Influx tag sets (run_id/sender/vehicle/…) so one series per field
  (or per field+idx for arrays) — stops legend explosion across runs.
- Legend/displayName = field name only (M{idx} for module arrays).
- Dashboard time stays now-5m → now (newest on the right; empty left if sparse).
- Timelines: 0/OK=green; LIMIT bits=yellow; FAULT/nonzero=red; value-table text.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"
SCHEMA_PATH = ROOT / "scripts" / "highnoon_schema.json"

GROUP_FIELD = '|> group(columns: ["_field"])'
GROUP_FIELD_IDX = '|> group(columns: ["_field", "idx"])'
KEEP_SIMPLE = '|> keep(columns: ["_time", "_value", "_field"])'
KEEP_IDX = '|> keep(columns: ["_time", "_value", "_field", "idx"])'

TAG_DROP_RE = re.compile(
    r'\|\>\s*drop\(columns:\s*\[[^\]]*\]\)\s*\n?',
    re.MULTILINE,
)


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


def load_schema_choices() -> dict[str, dict[str, str]]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    out: dict[str, dict[str, str]] = {}
    for msgs in schema.values():
        for msg in msgs:
            for sig in msg.get("signals") or []:
                ch = sig.get("choices")
                if ch and sig.get("name"):
                    out[sig["name"]] = {str(k): str(v) for k, v in ch.items()}
    return out


def panel_fields(panel: dict) -> list[str]:
    fields: list[str] = []
    for t in panel.get("targets") or []:
        if not isinstance(t, dict):
            continue
        fields.extend(((t.get("filter") or {}).get("fields")) or [])
        q = t.get("query") or ""
        fields.extend(re.findall(r'_field == "([^"]+)"', q))
        # pivot / map output field names
        fields.extend(re.findall(r'_field:\s*"([^"]+)"', q))
    # unique preserve order
    seen = set()
    out = []
    for f in fields:
        if f not in seen and f not in ("v", "i", "bat", "mot", "p0", "p1", "p2"):
            seen.add(f)
            out.append(f)
    return out


def color_for_timeline(field: str, code: str, text: str) -> str:
    t = text.strip().lower()
    fname = field.upper()
    if code == "0" or t in {"ok", "pass", "closed", "enabled", "on", "selected", "pressed", "active"}:
        # Contactor closed / enabled = good green; Open handled below
        if t == "open":
            return "red"
        if t in {"not ok", "nok", "disabled", "off", "fault"} and code == "0":
            # inverted polarity signals like BPS_Charge_OK 0=NOT OK
            return "red"
        return "green"
    if "LIMIT" in fname or "limit" in t:
        return "yellow"
    if t in {"open"}:
        return "red"
    if t in {"closed", "enabled"}:
        return "green"
    # Fault / nonzero
    return "red"


def timeline_mappings(field: str, choices: dict[str, str] | None) -> list[dict]:
    """Build value mappings keyed by both numeric codes and string labels (Influx stores strings)."""
    opts: dict[str, dict] = {}
    fname = field.upper()

    if choices:
        for i, (code, text) in enumerate(sorted(choices.items(), key=lambda kv: int(kv[0]) if kv[0].lstrip("-").isdigit() else kv[0])):
            color = color_for_timeline(field, code, text)
            # Binary LIMIT: force yellow on active
            if "LIMIT" in fname and code != "0":
                color = "yellow"
                if text.upper() in {"OK", "1", "FAULT", "NOK", "NOT OK"}:
                    text = "Limit"
            if "FAULT" in fname and code != "0" and text.upper() in {"1", "FAULT", "NOK", "NOT OK"}:
                text = "Fault"
                color = "red"
            if code == "0" and text.upper() in {"OK", "0"}:
                text = "OK"
                color = "green"
            # Inverted OK bits (0=NOT OK, 1=OK)
            if text.upper() in {"NOT OK", "NOK"} and code == "0":
                color = "red"
            if text.upper() == "OK" and code == "1" and set(choices.keys()) == {"0", "1"}:
                color = "green"
            entry = {"text": text, "color": color, "index": i}
            opts[code] = entry
            # Also map string label as stored in Influx
            opts[text] = {"text": text, "color": color, "index": i}
            opts[text.upper()] = {"text": text, "color": color, "index": i}
    else:
        # Bitmap fallback: 0=OK, 1=Fault or Limit
        if "LIMIT" in fname:
            opts = {
                "0": {"text": "OK", "color": "green", "index": 0},
                "1": {"text": "Limit", "color": "yellow", "index": 1},
                "OK": {"text": "OK", "color": "green", "index": 0},
                "Limit": {"text": "Limit", "color": "yellow", "index": 1},
            }
        else:
            opts = {
                "0": {"text": "OK", "color": "green", "index": 0},
                "1": {"text": "Fault", "color": "red", "index": 1},
                "OK": {"text": "OK", "color": "green", "index": 0},
                "Fault": {"text": "Fault", "color": "red", "index": 1},
                "FAULT": {"text": "Fault", "color": "red", "index": 1},
            }
    return [{"type": "value", "options": opts}]


def ensure_group_collapse(query: str) -> str:
    """Insert group(columns:[_field]) or [_field,idx] before aggregateWindow / last / pivot map."""
    if "v.timeRangeStart" not in query and "aggregateWindow" not in query:
        return query
    # Already collapsed cleanly
    if 'group(columns: ["_field"' in query or "group(columns: ['_field'" in query:
        # Still ensure keep at end for simple pipelines
        return ensure_keep(query)

    uses_idx = 'group(columns: ["idx"])' in query or "group(columns: ['idx'])" in query
    group_line = GROUP_FIELD_IDX if uses_idx else GROUP_FIELD

    # Replace bare group(columns: ["idx"]) with field+idx
    if uses_idx:
        query = query.replace('|> group(columns: ["idx"])', group_line)
        query = query.replace("|> group(columns: ['idx'])", group_line)

    # Insert group before first aggregateWindow if missing
    if 'group(columns: ["_field"' not in query:
        if "|> aggregateWindow(" in query:
            query = query.replace(
                "|> aggregateWindow(",
                f"{group_line}\n  |> aggregateWindow(",
                1,
            )
        elif "|> last()" in query and "uint(v: now())" not in query:
            # historical last without aggregate — rare
            query = query.replace("|> last()", f"{group_line}\n  |> last()", 1)

    return ensure_keep(query)


def ensure_keep(query: str) -> str:
    """Append keep() so Grafana only sees _time/_value/_field(+idx). Skip pivot/union builders mid-query."""
    if "keep(columns:" in query:
        return query
    # Pivot / multi-stage: only keep on the final map result if it's a single pipeline ending in aggregate
    if "union(tables:" in query or "pivot(" in query:
        # Final map already sets _field; append keep after last map if ends with map(...)
        if query.rstrip().endswith(")") and "|> map(" in query and not query.rstrip().endswith("keep(columns:"):
            uses_idx = "idx" in query and 'group(columns: ["_field", "idx"])' in query
            keep = KEEP_IDX if uses_idx else KEEP_SIMPLE
            # Only if query doesn't already end with keep
            if "keep(columns:" not in query.split("\n")[-3:]:
                query = query.rstrip() + "\n  " + keep
        return query

    uses_idx = 'group(columns: ["_field", "idx"])' in query
    keep = KEEP_IDX if uses_idx else KEEP_SIMPLE
    # Append after aggregateWindow / last line
    lines = query.rstrip().split("\n")
    # Don't double-insert
    if any("keep(columns:" in ln for ln in lines):
        return query
    lines.append(f"  {keep}")
    return "\n".join(lines)


def fix_flux_query(query: str) -> str:
    if not query or "from(bucket:" not in query:
        return query
    # Live / age / short lookback stats — leave alone
    if "queryType" in query:
        return query
    if "uint(v: now())" in query and "aggregateWindow" not in query:
        return query
    if "range(start: -" in query and "v.timeRangeStart" not in query and "aggregateWindow" not in query:
        # last() power stats etc.
        return query
    return ensure_group_collapse(query)


def set_display_name(panel: dict, has_idx: bool) -> int:
    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})
    want = 'M${__field.labels.idx}' if has_idx else "${__field.name}"
    changed = 0
    if defaults.get("displayName") != want:
        defaults["displayName"] = want
        changed += 1
    return changed


def fix_legend(panel: dict) -> int:
    changed = 0
    opts = panel.setdefault("options", {})
    legend = opts.setdefault("legend", {})
    want = {"displayMode": "list", "placement": "bottom", "showLegend": True, "calcs": []}
    for k, v in want.items():
        if legend.get(k) != v:
            legend[k] = v
            changed += 1
    # Tooltip: show field names cleanly
    tooltip = opts.setdefault("tooltip", {})
    if panel.get("type") == "timeseries":
        if tooltip.get("mode") != "multi":
            tooltip["mode"] = "multi"
            changed += 1
    return changed


def fix_timeline_panel(panel: dict, schema_choices: dict) -> int:
    changed = 0
    fields = panel_fields(panel)
    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})

    # Per-field overrides when multiple different signals share a timeline
    if len(fields) <= 1:
        field = fields[0] if fields else ""
        choices = schema_choices.get(field)
        new_maps = timeline_mappings(field, choices)
        if defaults.get("mappings") != new_maps:
            defaults["mappings"] = new_maps
            changed += 1
    else:
        # defaults: generic 0/1; overrides per field name
        defaults["mappings"] = timeline_mappings(fields[0], schema_choices.get(fields[0]))
        overrides = []
        for field in fields:
            overrides.append(
                {
                    "matcher": {"id": "byName", "options": field},
                    "properties": [
                        {
                            "id": "mappings",
                            "value": timeline_mappings(field, schema_choices.get(field)),
                        },
                        {"id": "displayName", "value": field},
                    ],
                }
            )
        if panel.setdefault("fieldConfig", {}).get("overrides") != overrides:
            panel["fieldConfig"]["overrides"] = overrides
            changed += 1

    defaults.setdefault("custom", {})
    if defaults["custom"].get("fillOpacity") is None:
        defaults["custom"]["fillOpacity"] = 80
        changed += 1
    defaults["color"] = {"mode": "thresholds"}
    # Thresholds unused when mappings supply colors; keep harmless default
    defaults.setdefault(
        "thresholds",
        {"mode": "absolute", "steps": [{"color": "green", "value": None}]},
    )

    opts = panel.setdefault("options", {})
    # Newest toward the right edge of each state; dashboard range handles axis
    if opts.get("alignValue") != "right":
        opts["alignValue"] = "right"
        changed += 1
    if opts.get("mergeValues") is not True:
        opts["mergeValues"] = True
        changed += 1
    return changed + fix_legend(panel) + set_display_name(panel, False)


def fix_timeseries_panel(panel: dict) -> int:
    changed = 0
    has_idx = False
    for t in panel.get("targets") or []:
        q = t.get("query") or ""
        if 'group(columns: ["_field", "idx"])' in q or 'group(columns: ["idx"])' in q:
            has_idx = True
    changed += set_display_name(panel, has_idx)
    changed += fix_legend(panel)
    # Ensure spanNulls so gaps don't invent lines across runs
    custom = panel.setdefault("fieldConfig", {}).setdefault("defaults", {}).setdefault("custom", {})
    if custom.get("spanNulls") is not True and custom.get("spanNulls") != 3600000:
        # True = connect nulls within window; for run gaps prefer false so old run doesn't connect
        if custom.get("spanNulls") is not False:
            custom["spanNulls"] = False
            changed += 1
    return changed


def fix_dashboard_time(data: dict) -> int:
    changed = 0
    want = {"from": "now-5m", "to": "now"}
    if data.get("time") != want:
        data["time"] = want
        changed += 1
    # Fixed window: newest at right. Soft min/max off at dashboard level N/A.
    if data.get("graphTooltip") != 1:
        data["graphTooltip"] = 1
        changed += 1
    return changed


def fix_panel(panel: dict, schema_choices: dict) -> int:
    if panel.get("type") == "row":
        return 0
    n = 0
    for t in panel.get("targets") or []:
        if not isinstance(t, dict) or not isinstance(t.get("query"), str):
            continue
        # Only historical Influx panels
        if t.get("queryType") == "measurements" or t.get("channel"):
            continue
        new_q = fix_flux_query(t["query"])
        if new_q != t["query"]:
            t["query"] = new_q
            n += 1

    ptype = panel.get("type")
    if ptype == "state-timeline":
        n += fix_timeline_panel(panel, schema_choices)
    elif ptype == "timeseries":
        n += fix_timeseries_panel(panel)
    return n


def fix_file(path: Path, schema_choices: dict, dry_run: bool) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    counts = {"time": 0, "panels": 0}
    counts["time"] = fix_dashboard_time(data)
    for panel in walk_panels(data):
        counts["panels"] += fix_panel(panel, schema_choices)
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
    totals = {"time": 0, "panels": 0}
    for path in files:
        c = fix_file(path, schema_choices, args.dry_run)
        print(f"{path.name}: {c}")
        for k, v in c.items():
            totals[k] += v
    print("totals", totals)


if __name__ == "__main__":
    main()
