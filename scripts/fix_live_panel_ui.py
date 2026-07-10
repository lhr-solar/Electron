#!/usr/bin/env python3
"""Tune HighNoon Live/stat panel UI: small titles, noValue, drop age mappings."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"


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


def fix_panel(panel: dict) -> int:
    if panel.get("type") not in ("stat", "gauge", "bargauge"):
        return 0
    changed = 0
    title = panel.get("title") or ""
    g = panel.get("gridPos") or {}
    w, h = int(g.get("w") or 24), int(g.get("h") or 8)
    opts = panel.setdefault("options", {})
    defaults = panel.setdefault("fieldConfig", {}).setdefault("defaults", {})

    # Age panels: show seconds only — strip leftover fault value mappings
    if re.search(r"\bage\b", title, re.I) and not re.search(r"Tap Age", title, re.I):
        if defaults.get("mappings"):
            defaults["mappings"] = []
            changed += 1
        if defaults.get("noValue") != "stale":
            defaults["noValue"] = "stale"
            changed += 1
        if opts.get("textMode") != "value":
            opts["textMode"] = "value"
            changed += 1
        if opts.get("graphMode") not in (None, "none"):
            opts["graphMode"] = "none"
            changed += 1

    # Missing data: em dash (Grafana still may spin on Live until first frame)
    if defaults.get("noValue") in (None, "", "-"):
        defaults["noValue"] = "—"
        changed += 1

    # Small tiles: shrink title/value so labels fit; hide sparkline
    if w <= 4 or h <= 3:
        text = opts.setdefault("text", {})
        want_title = 11 if w <= 3 or h <= 3 else 12
        want_value = 18 if h <= 3 else 22
        if text.get("titleSize") != want_title:
            text["titleSize"] = want_title
            changed += 1
        if text.get("valueSize") != want_value:
            text["valueSize"] = want_value
            changed += 1
        if opts.get("graphMode") not in (None, "none"):
            opts["graphMode"] = "none"
            changed += 1
        # Prefer value-only in tiny tiles (title is in panel chrome)
        if w <= 3 and h <= 3 and opts.get("textMode") not in ("value", "name"):
            opts["textMode"] = "value"
            changed += 1

    # Status/fault background tiles: keep value readable
    if opts.get("colorMode") == "background" and opts.get("textMode") == "auto":
        # auto is fine; ensure wideLayout off so name stacks if shown
        if opts.get("wideLayout") is not False and (w <= 4):
            opts["wideLayout"] = False
            changed += 1

    return changed


def fix_file(path: Path, dry_run: bool) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    n = sum(fix_panel(p) for p in walk_panels(data) if p.get("type") != "row")
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
