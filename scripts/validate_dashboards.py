"""Validate provisioned HighNoon Grafana dashboards.

Checks: valid JSON, required top-level keys, datasource uid influxdb_main everywhere,
unique dashboard uids, unique panel ids, no import-only artifacts, queries reference
real measurements/fields from highnoon_schema.json.

Usage: .venv/bin/python scripts/validate_dashboards.py
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DASH_DIR = os.path.join(os.path.dirname(HERE), "grafana", "dashboards", "HighNoon")
SCHEMA = os.path.join(HERE, "highnoon_schema.json")


def load_schema():
    with open(SCHEMA) as f:
        nets = json.load(f)
    measurements = set()
    fields = set()
    meas_fields = {}
    for msgs in nets.values():
        for m in msgs:
            measurements.add(m["measurement"])
            mf = meas_fields.setdefault(m["measurement"], set())
            for s in m["signals"]:
                fields.add(s["name"])
                mf.add(s["name"])
    return measurements, fields, meas_fields


def walk_panels(panels):
    for p in panels or []:
        yield p
        if p.get("type") == "row" and p.get("panels"):
            yield from walk_panels(p["panels"])


def main():
    measurements, fields, meas_fields = load_schema()
    files = sorted(f for f in os.listdir(DASH_DIR) if f.endswith(".json"))
    if not files:
        print("No dashboard JSON files found in", DASH_DIR)
        return 1
    errors = []
    warnings = []
    uids = {}
    for fn in files:
        path = os.path.join(DASH_DIR, fn)
        try:
            with open(path) as f:
                d = json.load(f)
        except Exception as e:
            errors.append(f"{fn}: INVALID JSON: {e}")
            continue
        for k in ("__inputs", "__requires", "__elements"):
            if k in d:
                errors.append(f"{fn}: must not contain '{k}' (provisioned, not import)")
        uid = d.get("uid")
        if not uid:
            errors.append(f"{fn}: missing dashboard uid")
        elif uid in uids:
            errors.append(f"{fn}: duplicate uid '{uid}' (also in {uids[uid]})")
        else:
            uids[uid] = fn
        if d.get("id") not in (None,):
            warnings.append(f"{fn}: top-level 'id' should be null")
        if d.get("refresh") not in ("500ms", "1s", "2s", "5s"):
            warnings.append(f"{fn}: refresh is {d.get('refresh')!r} (expected realtime <=1s)")

        panels = list(walk_panels(d.get("panels", [])))
        pids = [p.get("id") for p in panels if p.get("type") != "row"]
        dupe = {i for i in pids if pids.count(i) > 1}
        if dupe:
            errors.append(f"{fn}: duplicate panel ids {sorted(dupe)}")
        npanels = 0
        for p in panels:
            if p.get("type") == "row":
                continue
            npanels += 1
            ds = p.get("datasource") or {}
            if ds.get("uid") != "influxdb_main":
                errors.append(f"{fn}: panel {p.get('id')} '{p.get('title')}' datasource uid != influxdb_main ({ds})")
            for t in p.get("targets", []):
                q = t.get("query", "")
                tds = t.get("datasource") or {}
                if tds and tds.get("uid") not in (None, "influxdb_main"):
                    errors.append(f"{fn}: panel {p.get('id')} target datasource uid != influxdb_main")
                for meas in re.findall(r'_measurement\s*==\s*"([^"]+)"', q):
                    if meas not in measurements:
                        errors.append(f"{fn}: panel {p.get('id')} unknown measurement '{meas}'")
                for fld in re.findall(r'_field\s*==\s*"([^"]+)"', q):
                    if fld not in fields and fld != "raw_packet":
                        errors.append(f"{fn}: panel {p.get('id')} unknown field '{fld}'")
        if npanels == 0:
            errors.append(f"{fn}: no non-row panels")
        print(f"{fn}: uid={uid!r} panels={npanels}")

    print("\n--- RESULT ---")
    for w in warnings:
        print("WARN:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"\n{len(files)} dashboards, {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
