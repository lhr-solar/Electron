#!/usr/bin/env python3
"""Fix HighNoon dashboards: Flux joins, OK/NOK labels, Live field selectors."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH_DIR = ROOT / "grafana" / "dashboards" / "HighNoon"

KEEP_TEXT = {
    "open", "closed", "on", "off", "enabled", "disabled",
    "high", "low", "forward", "reverse", "neutral",
}


def fix_simple_join(q: str) -> str:
    if "join(tables:" not in q and 'join.time(method: "inner", tables:' not in q:
        return q
    original = q
    q = re.sub(r'^import "join"\n', "", q)

    def repl(m: re.Match) -> str:
        left, right = m.group("left"), m.group("right")
        body = m.group("map")
        prod = "l._value * r._value"
        prod = body
        # extract _value expression
        pm = re.search(r"_value:\s*([^,}]+)", body)
        if pm:
            prod = pm.group(1).strip()
        prod = prod.replace("r.voltage * r.current", "l.voltage * r.current")
        prod = prod.replace("r.v * r.i", "l.v * r.i")
        prod = prod.replace("r.v * r._value", "l.v * r._value")
        prod = prod.replace("r.bat - r._value", "l.bat - r._value")
        fm = re.search(r'_field:\s*("(?:\\.|[^"])*")', body)
        field = fm.group(1) if fm else '"value"'
        return (
            "join.time(\n"
            '  method: "inner",\n'
            f"  left: {left},\n"
            f"  right: {right},\n"
            f"  as: (l, r) => ({{_time: l._time, _value: {prod}, _field: {field}}})\n"
            ")"
        )

    q = re.sub(
        r'join\(tables:\s*\{[^:]+:\s*(?P<left>\w+),\s*[^:]+:\s*(?P<right>\w+)\},\s*on:\s*\["_time"\]\)\s*\n'
        r"\s*\|>\s*map\(fn:\s*\(r\)\s*=>\s*\((?P<map>[\s\S]*?)\)\)",
        repl,
        q,
    )
    q = re.sub(
        r'join\.time\(method:\s*"inner",\s*tables:\s*\{[^:]+:\s*(?P<left>\w+),\s*[^:]+:\s*(?P<right>\w+)\}\)\s*\n'
        r"\s*\|>\s*map\(fn:\s*\(r\)\s*=>\s*\((?P<map>[\s\S]*?)\)\)",
        repl,
        q,
    )
    if q != original and 'import "join"' not in q:
        q = 'import "join"\n' + q
    return q


def _split_top_level_kv(body: str) -> dict[str, str]:
    items: dict[str, str] = {}
    depth_brace = depth_paren = 0
    start = 0
    chunks: list[str] = []
    for k, ch in enumerate(body):
        if ch == "{":
            depth_brace += 1
        elif ch == "}":
            depth_brace -= 1
        elif ch == "(":
            depth_paren += 1
        elif ch == ")":
            depth_paren -= 1
        elif ch == "," and depth_brace == 0 and depth_paren == 0:
            chunks.append(body[start:k])
            start = k + 1
    chunks.append(body[start:])
    for chunk in chunks:
        chunk = chunk.strip()
        if ":" not in chunk:
            continue
        key, val = chunk.split(":", 1)
        items[key.strip()] = val.strip()
    return items


def fix_nested_joins(q: str) -> str:
    if "join(tables: {" not in q:
        return q
    out: list[str] = []
    i = 0
    while True:
        idx = q.find("join(tables: {", i)
        if idx < 0:
            out.append(q[i:])
            break
        out.append(q[i:idx])
        brace_start = q.find("{", idx)
        depth = 0
        j = brace_start
        while j < len(q):
            if q[j] == "{":
                depth += 1
            elif q[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        else:
            out.append(q[idx:])
            break
        tables_body = q[brace_start + 1 : j]
        rest = q[j + 1 :]
        on_m = re.match(
            r'\s*,\s*on:\s*\["_time"\]\)\s*\n\s*\|>\s*map\(fn:\s*\(r\)\s*=>\s*\(([^)]*)\)\)',
            rest,
            re.DOTALL,
        )
        if not on_m:
            out.append(q[idx : j + 1])
            i = j + 1
            continue
        parts = _split_top_level_kv(tables_body)
        if "v" not in parts or "i" not in parts:
            out.append(q[idx : j + 1 + on_m.end()])
            i = j + 1 + on_m.end()
            continue
        replacement = (
            "join.time(\n"
            '  method: "inner",\n'
            f"  left: {parts['v']},\n"
            f"  right: {parts['i']},\n"
            "  as: (l, r) => ({_time: l._time, _value: l.v * r.i})\n"
            ")"
        )
        out.append(replacement)
        i = j + 1 + on_m.end()
    new = "".join(out)
    if new != q:
        new = re.sub(r'^import "join"\n', "", new)
        new = 'import "join"\n' + new
    return new


def relabel_ok_nok(panel: dict) -> int:
    """Normalize binary OK/NOK with correct polarity: 0=OK green, 1=NOK red.

    Never invert schema polarity. Skip Open/Closed and other KEEP_TEXT labels.
    Idle schema "-" is left alone (cleanup_dashboard_gaps maps it to Off).
    """
    changed = 0
    defaults = ((panel.get("fieldConfig") or {}).get("defaults")) or {}
    mappings = defaults.get("mappings")
    if not isinstance(mappings, list):
        return 0
    for m in mappings:
        if m.get("type") != "value":
            continue
        opts = m.get("options") or {}
        if set(opts.keys()) != {"0", "1"}:
            continue
        t0 = str((opts.get("0") or {}).get("text") or "")
        t1 = str((opts.get("1") or {}).get("text") or "")
        if t0.lower() in KEEP_TEXT or t1.lower() in KEEP_TEXT:
            continue
        if t0.strip() in {"-", "—"} or t1.strip() in {"-", "—"}:
            continue
        # Only touch explicit OK/NOK (including previously inverted ones).
        labels = {t0.upper(), t1.upper()}
        if not labels <= {"OK", "NOK", "NOT OK", "FAULT"} and not (
            "OK" in t0.upper() or "OK" in t1.upper() or "NOK" in t0.upper() or "NOK" in t1.upper()
        ):
            continue
        want0 = {"text": "OK", "color": "green", "index": int((opts.get("0") or {}).get("index") or 0)}
        want1 = {"text": "NOK", "color": "red", "index": int((opts.get("1") or {}).get("index") or 1)}
        cur0, cur1 = opts.get("0") or {}, opts.get("1") or {}
        if cur0.get("text") != "OK" or cur0.get("color") != "green" or cur1.get("text") != "NOK" or cur1.get("color") != "red":
            opts["0"] = {**cur0, **want0}
            opts["1"] = {**cur1, **want1}
            changed += 1
        opts_panel = panel.setdefault("options", {})
        if panel.get("type") in ("stat", "gauge", "bargauge") and opts_panel.get("colorMode") != "background":
            opts_panel["colorMode"] = "background"
            changed += 1
    return changed


def fix_live_reduce(panel: dict) -> int:
    changed = 0
    for t in panel.get("targets") or []:
        if not isinstance(t, dict) or t.get("queryType") != "measurements":
            continue
        fields = ((t.get("filter") or {}).get("fields")) or []
        if not fields:
            continue
        field = fields[0]
        opts = panel.setdefault("options", {})
        reduce = opts.setdefault("reduceOptions", {})
        want = f"/{re.escape(field)}/"
        if reduce.get("fields") != want:
            reduce["fields"] = want
            changed += 1
        if t.get("buffer") != 1:
            t["buffer"] = 1
            changed += 1
    return changed


def walk(panel: dict) -> int:
    n = relabel_ok_nok(panel) + fix_live_reduce(panel)
    for t in panel.get("targets") or []:
        if isinstance(t, dict) and isinstance(t.get("query"), str):
            q = t["query"]
            new_q = fix_nested_joins(fix_simple_join(q))
            if new_q != q:
                t["query"] = new_q
                n += 1
    for child in panel.get("panels") or []:
        if isinstance(child, dict):
            n += walk(child)
    return n


def fix_file(path: Path, dry_run: bool) -> int:
    data = json.loads(path.read_text(encoding="utf-8"))
    n = sum(walk(p) for p in (data.get("panels") or []) if isinstance(p, dict))
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
    left = sum(p.read_text(encoding="utf-8").count("join(tables:") for p in files)
    print("remaining join(tables:", left)


if __name__ == "__main__":
    main()
