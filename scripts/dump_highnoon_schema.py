"""Dump a canonical InfluxDB-schema reference for all HighNoon DBCs.

The measurement name, tags, and array/idx handling here mirror
server/util/can_manager.py exactly so Grafana dashboards query real series.

Outputs:
  scripts/highnoon_schema.json  (machine reference)
  scripts/highnoon_schema.md    (human/prompt reference)
"""
import json
import os

import cantools

DBC_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "Embedded-Sharepoint", "can", "dbc", "HighNoon",
)
OUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "highnoon_schema.json")
OUT_MD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "highnoon_schema.md")


def index_signal_for(msg):
    """Match can_manager._parse_dbc_for_ecus_and_arrays."""
    for s in msg.signals:
        if "idx" in s.name.lower() or "index" in s.name.lower():
            return s.name
    return None


def cycle_time(msg):
    try:
        return msg.cycle_time
    except Exception:
        return None


def main():
    networks = {}
    files = sorted(f for f in os.listdir(DBC_DIR) if f.lower().endswith(".dbc"))
    for fname in files:
        net = fname[:-4]
        db = cantools.database.load_file(os.path.join(DBC_DIR, fname))
        msgs = []
        for m in sorted(db.messages, key=lambda x: x.frame_id):
            idx_sig = index_signal_for(m)
            sigs = []
            for s in m.signals:
                choices = None
                if s.choices:
                    choices = {int(k): str(v) for k, v in s.choices.items()}
                sigs.append({
                    "name": s.name,
                    "unit": s.unit,
                    "min": s.minimum,
                    "max": s.maximum,
                    "scale": s.scale,
                    "offset": s.offset,
                    "is_float": s.is_float,
                    "is_multiplexer": s.is_multiplexer,
                    "multiplexer_ids": s.multiplexer_ids,
                    "comment": s.comment,
                    "choices": choices,
                    "is_field": not (idx_sig is not None and s.name == idx_sig),
                })
            msgs.append({
                "name": m.name,
                "frame_id_dec": m.frame_id,
                "measurement": f"{m.frame_id:X}",
                "length": m.length,
                "is_extended": m.is_extended_frame,
                "is_multiplexed": m.is_multiplexed(),
                "cycle_time_ms": cycle_time(m),
                "senders": list(m.senders),
                "comment": m.comment,
                "is_array": idx_sig is not None,
                "index_signal": idx_sig,
                "signals": sigs,
            })
        networks[net] = msgs

    with open(OUT_JSON, "w") as f:
        json.dump(networks, f, indent=2)

    lines = ["# HighNoon CAN -> InfluxDB schema reference\n"]
    lines.append("InfluxDB: bucket `telemetry_main`, org `LHRS`, Flux.\n")
    lines.append("Tags on every point: `vehicle`(=HighNoon), `network`, `sender`, `message_name`, and `idx` (array msgs only).\n")
    lines.append("Fields = signal names below + always `raw_packet`. measurement = uppercase hex CAN id (no 0x).\n")
    total_msgs = 0
    total_sigs = 0
    for net, msgs in networks.items():
        lines.append(f"\n## network = `{net}`  ({len(msgs)} messages)\n")
        for m in msgs:
            total_msgs += 1
            arr = ""
            if m["is_array"]:
                arr = f"  [ARRAY idx tag=`{m['index_signal']}`]"
            mux = "  [MULTIPLEXED]" if m["is_multiplexed"] else ""
            ct = f" cycle={m['cycle_time_ms']}ms" if m["cycle_time_ms"] else ""
            lines.append(
                f"\n- **{m['name']}** measurement=`{m['measurement']}` "
                f"(dec {m['frame_id_dec']}, len {m['length']}{ct}){arr}{mux}"
            )
            if m["comment"]:
                lines.append(f"    - _msg_: {m['comment']}")
            for s in m["signals"]:
                total_sigs += 1
                if not s["is_field"]:
                    continue
                u = f" [{s['unit']}]" if s["unit"] else ""
                rng = ""
                if s["min"] is not None or s["max"] is not None:
                    rng = f" range[{s['min']}..{s['max']}]"
                ch = ""
                if s["choices"]:
                    ch = "  choices=" + json.dumps(s["choices"], ensure_ascii=False)
                mx = ""
                if s["multiplexer_ids"]:
                    mx = f" muxPage={s['multiplexer_ids']}"
                lines.append(f"    - `{s['name']}`{u}{rng}{mx}{ch}")
    lines.insert(1, f"Totals: {len(networks)} networks, {total_msgs} messages.\n")
    with open(OUT_MD, "w") as f:
        f.write("\n".join(lines))

    print(f"Wrote {OUT_JSON} and {OUT_MD}")
    print(f"networks={list(networks)} messages={total_msgs}")


if __name__ == "__main__":
    main()
