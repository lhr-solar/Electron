"""CANP run events + raw capture files.

Source of truth: logs/canp/canp_manifest.json (no Influx events bucket).

CANP:
  - always write logs/canp/mm-dd-yy-HHMMSS.<uuid>.canp
  - new event on first chunk and after 30s idle
  - uuid tags telemetry_main points as run_id when Influx writes are on

Other modes:
  - logs/slcan/mm-dd-yy-HHMMSS.<uuid>.txt only when CAPTURE_RAW is truthy
  - no events
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_TRUTHY = {"1", "true", "yes", "on"}
CANP_SUBDIR = "canp"
SLCAN_SUBDIR = "slcan"
MANIFEST_NAME = "canp_manifest.json"
EVENT_GAP_SEC = 30.0
DEFAULT_NAME = "Untitled run"
_RUN_NAME_RE = re.compile(r"^Run\s+(\d+)$", re.IGNORECASE)


def _utc_iso(ts: float | None = None) -> str:
    dt = datetime.fromtimestamp(ts or time.time(), tz=timezone.utc).astimezone()
    return dt.isoformat(timespec="milliseconds")


def _file_stamp(ts: float) -> str:
    """Human-readable local stamp: mm-dd-yy-HHMMSS."""
    return datetime.fromtimestamp(ts).strftime("%m-%d-%y-%H%M%S")


def _local_day_key(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")


def _next_daily_run_number(log_dir: str, start_ts: float) -> int:
    """Next Run N for the local calendar day (resets to 1 each day)."""
    day = _local_day_key(start_ts)
    max_n = 0
    for e in _read_manifest_raw(log_dir):
        if not isinstance(e, dict):
            continue
        start_iso = e.get("start_time_iso") or ""
        try:
            evt_ts = datetime.fromisoformat(start_iso).timestamp()
        except Exception:
            continue
        if _local_day_key(evt_ts) != day:
            continue
        n = e.get("run_number")
        try:
            if n is not None:
                max_n = max(max_n, int(n))
                continue
        except (TypeError, ValueError):
            pass
        for label in (e.get("name"), e.get("display_name")):
            m = _RUN_NAME_RE.match(str(label or "").strip())
            if m:
                max_n = max(max_n, int(m.group(1)))
                break
    return max_n + 1


def capture_raw_enabled(input_mode: str) -> bool:
    """canp always captures; other modes need CAPTURE_RAW=1 (or true/yes/on)."""
    if input_mode == "canp_tcp":
        return True
    return (os.environ.get("CAPTURE_RAW") or "").strip().lower() in _TRUTHY


def canp_log_dir(log_dir: str) -> str:
    return os.path.join(log_dir, CANP_SUBDIR)


def slcan_log_dir(log_dir: str) -> str:
    return os.path.join(log_dir, SLCAN_SUBDIR)


def manifest_path(log_dir: str) -> str:
    return os.path.join(canp_log_dir(log_dir), MANIFEST_NAME)


def resolve_dump_path(log_dir: str, dump_file: str, input_mode: str = "") -> str:
    if not dump_file:
        return ""
    if os.path.isabs(dump_file):
        return dump_file
    name = os.path.basename(dump_file)
    if name.endswith(".canp") or input_mode == "canp_tcp":
        return os.path.join(canp_log_dir(log_dir), name)
    return os.path.join(slcan_log_dir(log_dir), name)


def _read_manifest_raw(log_dir: str) -> list[dict]:
    path = manifest_path(log_dir)
    if not os.path.isfile(path):
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        events = data.get("events") if isinstance(data, dict) else data
        return list(events) if isinstance(events, list) else []
    except Exception as e:
        logger.warning("Failed to read %s: %s", path, e)
        return []


def _write_manifest(log_dir: str, events: list[dict]) -> None:
    path = manifest_path(log_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"events": events}, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def upsert_manifest_event(log_dir: str, event: dict) -> None:
    run_id = str(event.get("uuid") or event.get("id") or "").strip()
    if not run_id:
        return
    events = _read_manifest_raw(log_dir)
    stored = {
        "uuid": run_id,
        "id": run_id,
        "name": event.get("name") or "",
        "display_name": event.get("display_name") or "",
        "renamed": bool(event.get("renamed")),
        "run_number": event.get("run_number"),
        "start_time_iso": event.get("start_time_iso") or "",
        "end_time_iso": event.get("end_time_iso") or "",
        "dump_file": event.get("dump_file") or "",
        "vehicle": event.get("vehicle") or "",
        "input_mode": "canp_tcp",
        "device_start_ms": event.get("device_start_ms"),
    }
    for i, e in enumerate(events):
        if str(e.get("uuid") or e.get("id") or "") == run_id:
            events[i] = {**e, **stored}
            _write_manifest(log_dir, events)
            return
    events.append(stored)
    _write_manifest(log_dir, events)


def list_manifest_events(log_dir: str) -> list[dict]:
    out = []
    for evt in _read_manifest_raw(log_dir):
        if not isinstance(evt, dict):
            continue
        item = dict(evt)
        run_id = str(item.get("uuid") or item.get("id") or "")
        if not run_id:
            continue
        item["id"] = run_id
        item["uuid"] = run_id
        dump_file = item.get("dump_file") or ""
        path = resolve_dump_path(log_dir, dump_file, "canp_tcp") if dump_file else ""
        if dump_file and not os.path.isfile(path):
            canp_dir = canp_log_dir(log_dir)
            if os.path.isdir(canp_dir):
                for name in os.listdir(canp_dir):
                    if run_id in name and name.endswith(".canp"):
                        path = os.path.join(canp_dir, name)
                        dump_file = name
                        break
        item["dump_path"] = path
        item["dump_file"] = os.path.basename(path) if path else dump_file
        item["dump_exists"] = bool(path and os.path.isfile(path))
        given = (item.get("name") or "").strip()
        if given:
            item["display_name"] = given
        elif not (item.get("display_name") or "").strip():
            n = item.get("run_number")
            item["display_name"] = f"Run {n}" if n else DEFAULT_NAME
        item["source"] = "local"
        out.append(item)
    out.sort(key=lambda e: e.get("start_time_iso") or "", reverse=True)
    return out


class EventRecorder:
    def __init__(self, log_dir: str, input_mode: str, vehicle: str = ""):
        self.log_dir = log_dir
        self.input_mode = input_mode
        self.vehicle = vehicle or "unknown"
        self.canp_dir = canp_log_dir(log_dir)
        self.slcan_dir = slcan_log_dir(log_dir)
        os.makedirs(self.canp_dir, exist_ok=True)
        os.makedirs(self.slcan_dir, exist_ok=True)
        self.gap_sec = EVENT_GAP_SEC
        self._lock = threading.RLock()
        self._current: dict | None = None
        self._current_file = None
        self._last_packet_at: float | None = None
        self._canp_event_start_device_ms: int | None = None
        self._canp_event_host_start_ns: int | None = None
        self._last_emit_ns: int | None = None
        self._capture_enabled = capture_raw_enabled(input_mode)

    @staticmethod
    def _event_matches(evt: dict, identifier: str) -> bool:
        ident = str(identifier or "")
        if not ident:
            return False
        return ident in {
            str(evt.get("uuid") or ""),
            str(evt.get("id") or ""),
        }

    def get_current_event(self) -> dict | None:
        with self._lock:
            return dict(self._current) if self._current else None

    def current_run_id(self) -> str | None:
        """CANP event uuid for telemetry_main run_id tags."""
        with self._lock:
            if self.input_mode != "canp_tcp" or not self._current:
                return None
            return str(self._current.get("uuid") or "") or None

    def begin_run(self) -> dict | None:
        with self._lock:
            self._close_current_event(end_ts=None, reason="rotate")
            self._last_packet_at = None
            if self.input_mode == "canp_tcp":
                return None  # open on first chunk
            if self._capture_enabled:
                return self._open_slcan_capture(time.time())
            return None

    def list_events(self) -> list[dict]:
        return list_manifest_events(self.log_dir)

    def rename_current(self, identifier: str, new_name: str) -> dict | None:
        name = str(new_name or "").strip()[:200]
        if not name:
            return None
        with self._lock:
            if self._current and self._event_matches(self._current, identifier):
                self._current["name"] = name
                self._current["display_name"] = name
                self._current["renamed"] = True
                updated = dict(self._current)
            else:
                return None
        self._persist(updated)
        return updated

    def rename_event(self, identifier: str, new_name: str) -> dict | None:
        name = str(new_name or "").strip()[:200]
        if not name:
            return None
        with self._lock:
            if self._current and self._event_matches(self._current, identifier):
                return None
        events = _read_manifest_raw(self.log_dir)
        updated = None
        for e in events:
            if self._event_matches(e, identifier):
                e["name"] = name
                e["display_name"] = name
                e["renamed"] = True
                updated = dict(e)
                break
        if not updated:
            return None
        _write_manifest(self.log_dir, events)
        return updated

    def delete_events(self, event_ids: list[str]) -> list[str]:
        """Remove runs from canp_manifest.json and delete .canp files."""
        deleted: list[str] = []
        events = _read_manifest_raw(self.log_dir)
        wanted = {str(i) for i in (event_ids or [])}
        kept: list[dict] = []
        for e in events:
            run_id = str(e.get("uuid") or e.get("id") or "")
            if run_id not in wanted:
                kept.append(e)
                continue
            with self._lock:
                if self._current and self._event_matches(self._current, run_id):
                    kept.append(e)
                    continue
            dump_file = e.get("dump_file") or ""
            dump_path = resolve_dump_path(self.log_dir, dump_file, "canp_tcp") if dump_file else ""
            if dump_path and os.path.isfile(dump_path):
                try:
                    os.remove(dump_path)
                except OSError as err:
                    logger.warning("Could not delete capture %s: %s", dump_path, err)
            deleted.append(run_id)
        if deleted:
            _write_manifest(self.log_dir, kept)
        return deleted

    def _persist(self, event: dict) -> None:
        if (event.get("input_mode") or self.input_mode) != "canp_tcp":
            return
        try:
            upsert_manifest_event(self.log_dir, event)
        except Exception as e:
            logger.warning("Failed to update canp_manifest.json: %s", e)

    def _open_canp_run(self, start_ts: float, device_start_ms: int | None = None) -> dict:
        event_uuid = uuid.uuid4().hex
        stamp = _file_stamp(start_ts)
        filename = f"{stamp}.{event_uuid}.canp"
        path = os.path.join(self.canp_dir, filename)
        run_number = _next_daily_run_number(self.log_dir, start_ts)
        default_name = f"Run {run_number}"

        event = {
            "id": event_uuid,
            "uuid": event_uuid,
            "name": default_name,
            "display_name": default_name,
            "renamed": False,
            "run_number": run_number,
            "input_mode": "canp_tcp",
            "vehicle": self.vehicle,
            "start_time_iso": _utc_iso(start_ts),
            "end_time_iso": None,
            "device_start_ms": device_start_ms,
            "dump_file": filename,
            "dump_path": path,
        }

        self._current = event
        self._current_file = open(path, "ab")
        self._canp_event_start_device_ms = device_start_ms
        self._canp_event_host_start_ns = time.time_ns() if device_start_ms is not None else None
        self._persist(event)
        logger.info("Started canp run uuid=%s file=%s", event_uuid, path)
        return dict(event)

    def _open_slcan_capture(self, start_ts: float) -> dict:
        event_uuid = uuid.uuid4().hex
        stamp = _file_stamp(start_ts)
        filename = f"{stamp}.{event_uuid}.txt"
        path = os.path.join(self.slcan_dir, filename)
        label = datetime.fromtimestamp(start_ts).strftime("%b %d, %Y %H:%M:%S")
        event = {
            "id": event_uuid,
            "uuid": event_uuid,
            "name": "",
            "display_name": label,
            "renamed": False,
            "input_mode": self.input_mode,
            "vehicle": self.vehicle,
            "start_time_iso": _utc_iso(start_ts),
            "end_time_iso": None,
            "device_start_ms": None,
            "dump_file": filename,
            "dump_path": path,
        }
        self._current = event
        self._current_file = open(path, "a", encoding="utf-8")
        logger.info("Started slcan capture: %s", path)
        return dict(event)

    def _close_current_event(self, end_ts: float | None, reason: str = "stop") -> None:
        if not self._current:
            return
        end = end_ts or time.time()
        self._current["end_time_iso"] = _utc_iso(end)
        self._current["close_reason"] = reason
        if self._current_file:
            try:
                self._current_file.close()
            except Exception:
                pass
            self._current_file = None
        closed = dict(self._current)
        if closed.get("input_mode") == "canp_tcp":
            self._persist(closed)
        logger.info("Closed run %s (%s)", closed.get("uuid"), reason)
        self._current = None
        self._canp_event_start_device_ms = None
        self._canp_event_host_start_ns = None
        self._last_emit_ns = None

    def close_all(self) -> None:
        with self._lock:
            self._close_current_event(time.time(), reason="stop")
            self._last_packet_at = None

    def note_canp_chunk(self, chunk: bytes, *, device_batch_ms: int | None = None) -> None:
        if self.input_mode != "canp_tcp" or not chunk:
            return
        now = time.time()
        with self._lock:
            if self._last_packet_at is not None and (now - self._last_packet_at) >= self.gap_sec:
                self._close_current_event(self._last_packet_at, reason="gap")
            if self._current is None:
                self._open_canp_run(now, device_start_ms=device_batch_ms)
            elif device_batch_ms is not None and self._canp_event_start_device_ms is None:
                self._canp_event_start_device_ms = device_batch_ms
                self._canp_event_host_start_ns = time.time_ns()
                self._current["device_start_ms"] = device_batch_ms
                self._persist(self._current)
            self._last_packet_at = now
            self._write_canp_chunk(chunk)

    def note_packet(
        self,
        slcan: str,
        *,
        device_batch_ms: int | None = None,
    ) -> int | None:
        with self._lock:
            if self.input_mode == "canp_tcp":
                return self._device_time_ns(device_batch_ms)

            if not self._capture_enabled or not slcan:
                return None
            if self._current is None:
                self._open_slcan_capture(time.time())
            self._write_slcan(slcan)
        return None

    def _write_canp_chunk(self, chunk: bytes) -> None:
        if not self._current_file:
            return
        self._current_file.write(chunk)
        try:
            self._current_file.flush()
        except Exception:
            pass

    def _write_slcan(self, slcan: str) -> None:
        if not self._current_file:
            return
        line = slcan if slcan.endswith("\r") else slcan + "\r"
        self._current_file.write(line + "\n")

    def _reanchor_device_clock(self, device_batch_ms: int) -> int:
        """Map the next device sample to wall clock (host now).

        Used on first sample and whenever the Photon/replay device clock jumps
        backward (capture loop). Without this, Influx points rewrite past times
        and Grafana graphs look stuck / 'editing' old x-coordinates.
        """
        now_ns = time.time_ns()
        # Never emit earlier than the last point (fast rewind / clock skew).
        if self._last_emit_ns is not None and now_ns <= self._last_emit_ns:
            now_ns = self._last_emit_ns + 1_000_000
        self._canp_event_start_device_ms = device_batch_ms
        self._canp_event_host_start_ns = now_ns
        self._last_emit_ns = now_ns
        if self._current is not None:
            self._current["device_start_ms"] = device_batch_ms
        return now_ns

    def _device_time_ns(self, device_batch_ms: int | None) -> int | None:
        if self.input_mode != "canp_tcp" or device_batch_ms is None:
            return None
        if self._canp_event_start_device_ms is None or self._canp_event_host_start_ns is None:
            return self._reanchor_device_clock(device_batch_ms)
        delta_ms = device_batch_ms - self._canp_event_start_device_ms
        # Replay --loop (or device reboot) rewinds batch timestamps; re-anchor
        # so telemetry keeps appending at "now" instead of overwriting history.
        if delta_ms < 0:
            logger.info(
                "CANP device clock rewound (%s → %s ms); re-anchoring Influx timestamps to wall clock",
                self._canp_event_start_device_ms,
                device_batch_ms,
            )
            return self._reanchor_device_clock(device_batch_ms)
        ts = int(self._canp_event_host_start_ns + delta_ms * 1_000_000)
        self._last_emit_ns = ts
        return ts
