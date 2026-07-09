"""Decode event captures to per-message CSVs (Data Sandbox decoded-clean format)."""

from __future__ import annotations

import csv
from collections.abc import Callable
import io
import re
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import cantools

from server.util.canp import MAGIC_BYTES, iter_canp_batches
from server.util.slcan_to_can_msg import parse_slcan

TS_RE = re.compile(rb"\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}\] ")


def _iso_to_ms(iso: str | None) -> int | None:
    if not iso or not str(iso).strip():
        return None
    try:
        return int(datetime.fromisoformat(str(iso).strip()).timestamp() * 1000)
    except ValueError:
        return None


def _ms_to_iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).astimezone().isoformat(
        timespec="milliseconds"
    )


def _sanitize(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "msg"


def load_dbc_index(dbc_paths: list[str]) -> dict[int, list[tuple[str, cantools.database.can.message.Message]]]:
    index: dict[int, list[tuple[str, cantools.database.can.message.Message]]] = defaultdict(list)
    for dbc_path in sorted(dbc_paths):
        path = Path(dbc_path)
        if not path.is_file():
            continue
        db = cantools.database.load_file(str(path))
        net = path.stem
        for msg in db.messages:
            index[msg.frame_id].append((net, msg))
    return index


def _clip_range(
    requested_start_ms: int | None,
    requested_end_ms: int | None,
    data_min_ms: int | None,
    data_max_ms: int | None,
) -> tuple[int | None, int | None]:
    if data_min_ms is None or data_max_ms is None:
        return None, None
    start = requested_start_ms if requested_start_ms is not None else data_min_ms
    end = requested_end_ms if requested_end_ms is not None else data_max_ms
    start = max(start, data_min_ms)
    end = min(end, data_max_ms)
    if start > end:
        return None, None
    return start, end


def _event_overlaps_range(event: dict, start_ms: int | None, end_ms: int | None) -> bool:
    if start_ms is None and end_ms is None:
        return True
    ev_start = _iso_to_ms(event.get("start_time_iso"))
    ev_end = _iso_to_ms(event.get("end_time_iso")) or ev_start
    if ev_start is None:
        return True
    range_start = start_ms if start_ms is not None else ev_start
    range_end = end_ms if end_ms is not None else ev_end
    return ev_start <= range_end and (ev_end or ev_start) >= range_start


class _CsvBundle:
    def __init__(self) -> None:
        self._writers: dict[str, tuple[csv.DictWriter, io.StringIO, list[str]]] = {}

    def write_row(self, key: str, net: str, msg_name: str, fieldnames: list[str], row: dict) -> None:
        if key not in self._writers:
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            self._writers[key] = (writer, buf, fieldnames)
        self._writers[key][0].writerow(row)

    def to_zip_bytes(self, prefix: str = "decoded-clean") -> bytes:
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for key, (writer, buf, _) in self._writers.items():
                filename = f"{prefix}/{key}.csv"
                zf.writestr(filename, buf.getvalue())
        return out.getvalue()


def _event_wall_to_device_ms(event: dict, wall_ms: int | None) -> int | None:
    if wall_ms is None:
        return None
    ev_start = _iso_to_ms(event.get("start_time_iso"))
    device_start = event.get("device_start_ms")
    if ev_start is None or device_start is None:
        return wall_ms
    return int(device_start + (wall_ms - ev_start))


def _canp_clip_ms(
    event: dict,
    start_ms: int | None,
    end_ms: int | None,
) -> tuple[int | None, int | None]:
    return _event_wall_to_device_ms(event, start_ms), _event_wall_to_device_ms(event, end_ms)


def _is_canp_capture(capture: Path, event: dict) -> bool:
    if event.get("input_mode") == "canp_tcp":
        return True
    name = capture.name.lower()
    if name.endswith(".canp") or name.endswith(".canp.txt"):
        return True
    try:
        sample = capture.read_bytes()[:8192]
    except OSError:
        return False
    return MAGIC_BYTES in sample


def _decode_canp_capture(
    capture_path: Path,
    dbc_index: dict,
    bundle: _CsvBundle,
    clip_start_ms: int | None,
    clip_end_ms: int | None,
) -> tuple[int, int | None, int | None]:
    raw = capture_path.read_bytes()
    wire = raw
    if TS_RE.search(raw[:4096] if len(raw) > 4096 else raw):
        out = bytearray()
        pos = 0
        for m in TS_RE.finditer(raw):
            out.extend(raw[pos : m.start()])
            pos = m.end()
        out.extend(raw[pos:])
        wire = bytes(out)

    batch_ts: list[int] = []
    batches = list(iter_canp_batches(wire))
    for b in batches:
        batch_ts.append(b.timestamp_ms)

    if not batches:
        return 0, None, None

    data_min, data_max = min(batch_ts), max(batch_ts)
    eff_start, eff_end = _clip_range(clip_start_ms, clip_end_ms, data_min, data_max)
    if eff_start is None:
        return 0, data_min, data_max

    rows = 0
    for batch in batches:
        if not (eff_start <= batch.timestamp_ms <= eff_end):
            continue
        ts_iso = _ms_to_iso(batch.timestamp_ms)
        for can_id, dlc, data in batch.packets:
            if can_id not in dbc_index:
                continue
            payload = data[: min(dlc, 8)]
            for net, msg in dbc_index[can_id]:
                try:
                    decoded = msg.decode(payload, decode_choices=False, scaling=True)
                except Exception:
                    continue
                key = f"{_sanitize(net)}__{_sanitize(msg.name)}"
                fields = [
                    "timestamp_ms",
                    "timestamp_iso",
                    "seq",
                    "network",
                    "message",
                    "frame_id",
                    "dlc",
                    *decoded.keys(),
                ]
                bundle.write_row(
                    key,
                    net,
                    msg.name,
                    fields,
                    {
                        "timestamp_ms": batch.timestamp_ms,
                        "timestamp_iso": ts_iso,
                        "seq": batch.seq,
                        "network": net,
                        "message": msg.name,
                        "frame_id": f"0x{can_id:X}",
                        "dlc": dlc,
                        **decoded,
                    },
                )
                rows += 1
    return rows, data_min, data_max


def _decode_txt_capture(
    capture_path: Path,
    dbc_index: dict,
    bundle: _CsvBundle,
    event: dict,
    clip_start_ms: int | None,
    clip_end_ms: int | None,
) -> int:
    ev_start_ms = _iso_to_ms(event.get("start_time_iso")) or int(datetime.now().timestamp() * 1000)
    ev_end_ms = _iso_to_ms(event.get("end_time_iso")) or ev_start_ms
    eff_start, eff_end = _clip_range(clip_start_ms, clip_end_ms, ev_start_ms, ev_end_ms)
    if eff_start is None:
        return 0

    text = capture_path.read_text(encoding="utf-8", errors="ignore")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return 0

    span = max(eff_end - eff_start, 1)
    step = span / max(len(lines), 1)
    rows = 0
    for i, line in enumerate(lines):
        slcan = line if line.endswith("\r") else line + "\r"
        msg = parse_slcan(slcan)
        if not msg:
            continue
        ts_ms = int(eff_start + i * step)
        if ts_ms > eff_end:
            break
        can_id = msg.arbitration_id
        if can_id not in dbc_index:
            continue
        payload = bytes(msg.data[: min(len(msg.data), 8)])
        dlc = len(payload)
        for net, dbc_msg in dbc_index[can_id]:
            try:
                decoded = dbc_msg.decode(payload, decode_choices=False, scaling=True)
            except Exception:
                continue
            key = f"{_sanitize(net)}__{_sanitize(dbc_msg.name)}"
            fields = [
                "timestamp_ms",
                "timestamp_iso",
                "seq",
                "network",
                "message",
                "frame_id",
                "dlc",
                *decoded.keys(),
            ]
            bundle.write_row(
                key,
                net,
                dbc_msg.name,
                fields,
                {
                    "timestamp_ms": ts_ms,
                    "timestamp_iso": _ms_to_iso(ts_ms),
                    "seq": i,
                    "network": net,
                    "message": dbc_msg.name,
                    "frame_id": f"0x{can_id:X}",
                    "dlc": dlc,
                    **decoded,
                },
            )
            rows += 1
    return rows


def generate_decoded_csv_zip(
    events: list[dict],
    dbc_paths_for_vehicle: Callable[[str], list[str]],
    *,
    event_ids: list[str] | None = None,
    start_iso: str | None = None,
    end_iso: str | None = None,
) -> tuple[bytes, dict]:
    if not event_ids and not start_iso and not end_iso:
        raise ValueError("Select one or more events, or specify a start/end time range.")

    selected = events
    if event_ids:
        wanted = set(event_ids)
        selected = [e for e in events if e.get("id") in wanted]
        if not selected:
            raise ValueError("No matching events for the selected IDs.")
    start_ms = _iso_to_ms(start_iso)
    end_ms = _iso_to_ms(end_iso)
    if start_ms is not None or end_ms is not None:
        selected = [e for e in selected if _event_overlaps_range(e, start_ms, end_ms)]
        if not selected:
            raise ValueError("No events overlap the requested time range.")

    dbc_cache: dict[str, dict] = {}
    bundle = _CsvBundle()
    total_rows = 0
    files_used = []

    for event in selected:
        vehicle = (event.get("vehicle") or "").strip() or "unknown"
        if vehicle not in dbc_cache:
            paths = dbc_paths_for_vehicle(vehicle)
            dbc_cache[vehicle] = load_dbc_index(paths) if paths else {}
        dbc_index = dbc_cache[vehicle]
        if not dbc_index:
            continue
        path = event.get("dump_path") or ""
        if not path or not Path(path).is_file():
            continue
        capture = Path(path)
        files_used.append(capture.name)
        if _is_canp_capture(capture, event):
            clip_start, clip_end = _canp_clip_ms(event, start_ms, end_ms)
            rows, _, _ = _decode_canp_capture(capture, dbc_index, bundle, clip_start, clip_end)
        else:
            rows = _decode_txt_capture(capture, dbc_index, bundle, event, start_ms, end_ms)
        total_rows += rows

    if total_rows == 0:
        raise ValueError("No decoded rows in the selected range. Try a different event or time window.")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_bytes = bundle.to_zip_bytes(prefix=f"decoded-clean_{stamp}")
    return zip_bytes, {"rows": total_rows, "files": files_used, "csv_count": len(bundle._writers)}
