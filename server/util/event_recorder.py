"""Event detection (30s gap), raw network capture, and event metadata registry."""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

EVENT_GAP_SEC = 30.0
EVENTS_SUBDIR = "events"
INDEX_NAME = "index.json"


def _utc_iso(ts: float | None = None) -> str:
    dt = datetime.fromtimestamp(ts or time.time(), tz=timezone.utc).astimezone()
    return dt.isoformat(timespec="milliseconds")


def _display_run_name(start_ts: float, run_number: int) -> str:
    dt = datetime.fromtimestamp(start_ts, tz=timezone.utc).astimezone()
    return f"{dt.strftime('%B')} {dt.day}, {dt.year} - Run {run_number}"


def _safe_bucket_name(display_name: str) -> str:
    """Legacy label kept on event records for UI / matching old mistaken buckets.

    Event metadata goes to the protected `events` bucket; CAN telemetry goes to
    telemetry_main tagged with run_id. We never create an Influx bucket from this name.
    """
    cleaned = re.sub(r"[^\w\s,.-]", "", display_name).strip()
    return cleaned[:128] or "event-run"


class EventRecorder:
    def __init__(self, log_dir: str, input_mode: str, vehicle: str = ""):
        self.log_dir = log_dir
        self.input_mode = input_mode
        self.vehicle = vehicle or "unknown"
        self.gap_sec = EVENT_GAP_SEC
        self.events_dir = os.path.join(log_dir, EVENTS_SUBDIR)
        os.makedirs(self.events_dir, exist_ok=True)
        self._lock = threading.RLock()
        self._index_path = os.path.join(self.events_dir, INDEX_NAME)
        self._events: list[dict] = self._load_index()
        if self._ensure_uuids():
            self._save_index()
        self._run_counter = self._next_run_number()
        self._current: dict | None = None
        self._current_file = None
        self._last_packet_at: float | None = None
        self._canp_event_start_device_ms: int | None = None
        self._canp_event_host_start_ns: int | None = None
        self._influx_client = None

    def set_influx_client(self, client) -> None:
        self._influx_client = client

    def _load_index(self) -> list[dict]:
        if not os.path.isfile(self._index_path):
            return []
        try:
            with open(self._index_path, encoding="utf-8") as f:
                data = json.load(f)
            return list(data.get("events") or [])
        except Exception as e:
            logger.warning("Failed to load events index: %s", e)
            return []

    def _save_index(self) -> None:
        try:
            with open(self._index_path, "w", encoding="utf-8") as f:
                json.dump({"events": self._events}, f, indent=2)
        except Exception as e:
            logger.error("Failed to save events index: %s", e)

    def _ensure_uuids(self) -> bool:
        """Backfill a stable uuid on any event that predates the uuid field."""
        changed = False
        for evt in self._events:
            if not evt.get("uuid"):
                evt["uuid"] = uuid.uuid4().hex
                changed = True
        return changed

    def reload_index(self) -> None:
        """Re-read the on-disk index (used after another recorder instance mutated it)."""
        with self._lock:
            self._events = self._load_index()
            if self._ensure_uuids():
                self._save_index()

    @staticmethod
    def _event_matches(evt: dict, identifier: str) -> bool:
        ident = str(identifier or "")
        if not ident:
            return False
        return ident in {
            str(evt.get("uuid") or ""),
            str(evt.get("id") or ""),
            str(evt.get("bucket_name") or ""),
        }

    def _next_run_number(self) -> int:
        today = datetime.now().date().isoformat()
        count = 0
        for evt in self._events:
            if str(evt.get("start_time_iso", "")).startswith(today):
                count += 1
        return count + 1

    def list_events(self) -> list[dict]:
        with self._lock:
            return list(reversed(self._events))

    def get_current_event(self) -> dict | None:
        with self._lock:
            return dict(self._current) if self._current else None

    def current_run_id(self) -> str | None:
        """Stable run id (uuid) for Influx tags on the in-progress event."""
        with self._lock:
            if not self._current:
                return None
            return str(self._current.get("uuid") or self._current.get("id") or "") or None

    def delete_events(self, event_ids: list[str]) -> list[str]:
        """Remove local events by id. Deletes capture files when present. Returns deleted ids."""
        wanted = {str(x) for x in (event_ids or []) if x}
        if not wanted:
            return []
        deleted: list[str] = []
        with self._lock:
            keep: list[dict] = []
            for evt in self._events:
                eid = str(evt.get("id") or "")
                if not any(self._event_matches(evt, w) for w in wanted):
                    keep.append(evt)
                    continue
                dump_path = evt.get("dump_path") or ""
                if dump_path and os.path.isfile(dump_path):
                    try:
                        os.remove(dump_path)
                    except OSError as e:
                        logger.warning("Could not delete capture %s: %s", dump_path, e)
                deleted.append(eid)
            if deleted:
                self._events = keep
                self._save_index()
        return deleted

    def rename_current(self, identifier: str, new_name: str) -> dict | None:
        """Rename the in-progress event if it matches. Returns updated event or None."""
        name = str(new_name or "").strip()[:200]
        if not name:
            return None
        with self._lock:
            if self._current and self._event_matches(self._current, identifier):
                self._current["display_name"] = name
                self._current["renamed"] = True
                return dict(self._current)
        return None

    def rename_event(self, identifier: str, new_name: str) -> dict | None:
        """Rename a stored (closed) event in the on-disk index. Returns updated event or None."""
        name = str(new_name or "").strip()[:200]
        if not name:
            return None
        updated: dict | None = None
        with self._lock:
            for evt in self._events:
                if self._event_matches(evt, identifier):
                    evt["display_name"] = name
                    evt["renamed"] = True
                    updated = dict(evt)
                    break
            if updated is not None:
                self._save_index()
        if updated is not None and self._influx_client:
            try:
                self.write_event_metadata(self._influx_client, updated)
            except Exception as e:
                logger.warning("Failed to sync renamed event metadata to Influx: %s", e)
        return updated

    def _extension(self) -> str:
        return ".canp" if self.input_mode == "canp_tcp" else ".txt"

    def _open_new_event(self, start_ts: float, device_start_ms: int | None = None) -> None:
        self._close_current_event(end_ts=None, reason="rotate")
        run_number = self._run_counter
        self._run_counter += 1
        stamp = datetime.fromtimestamp(start_ts).strftime("%Y%m%d_%H%M%S")
        ext = self._extension()
        safe_vehicle = re.sub(r"[^\w.-]+", "_", self.vehicle).strip("_") or "vehicle"
        filename = f"{safe_vehicle}_{stamp}_run{run_number}{ext}"
        path = os.path.join(self.events_dir, filename)
        display_name = _display_run_name(start_ts, run_number)
        # Label only (UI / legacy matching). Not an Influx bucket name.
        bucket_name = _safe_bucket_name(display_name)
        event = {
            "id": f"evt_{stamp}_{run_number}",
            "uuid": uuid.uuid4().hex,
            "display_name": display_name,
            "renamed": False,
            "bucket_name": bucket_name,
            "run_number": run_number,
            "input_mode": self.input_mode,
            "vehicle": self.vehicle,
            "start_time_iso": _utc_iso(start_ts),
            "end_time_iso": None,
            "device_start_ms": device_start_ms,
            "dump_file": filename,
            "dump_path": path,
        }
        self._current = event
        self._current_file = open(path, "ab" if ext == ".canp" else "a", encoding=None if ext == ".canp" else "utf-8")
        self._canp_event_start_device_ms = device_start_ms
        self._canp_event_host_start_ns = time.time_ns() if device_start_ms is not None else None
        if self._influx_client:
            try:
                self.write_event_metadata(self._influx_client, event)
            except Exception as e:
                logger.warning("Failed to write start event_meta: %s", e)
        logger.info("Started event capture: %s -> %s (run_id=%s)", display_name, path, event.get("uuid"))

    def _close_current_event(self, end_ts: float | None, reason: str = "gap") -> None:
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
        with self._lock:
            self._events.append(dict(self._current))
            self._save_index()
        closed = dict(self._current)
        if self._influx_client:
            self.write_event_metadata(self._influx_client, closed)
        logger.info("Closed event %s (%s)", closed.get("display_name"), reason)
        self._current = None
        self._canp_event_start_device_ms = None
        self._canp_event_host_start_ns = None

    def close_all(self) -> None:
        with self._lock:
            self._close_current_event(time.time(), reason="stop")

    def note_canp_chunk(self, chunk: bytes, *, device_batch_ms: int | None = None) -> None:
        """Append raw CANP TCP bytes to the current .canp capture immediately.

        Independent of Influx connectivity / write enable / DBC decode success.
        """
        if self.input_mode != "canp_tcp" or not chunk:
            return
        now = time.time()
        with self._lock:
            if self._last_packet_at is not None and (now - self._last_packet_at) >= self.gap_sec:
                self._close_current_event(self._last_packet_at, reason="gap")
            if self._current is None:
                self._open_new_event(now, device_start_ms=device_batch_ms)
            self._last_packet_at = now
            self._write_canp_chunk(chunk)

    def note_packet(
        self,
        slcan: str,
        *,
        device_batch_ms: int | None = None,
    ) -> int | None:
        """Record packet; returns device_time_ns for Influx when available.

        For canp_tcp, wire bytes are already written in note_canp_chunk(); this
        only maintains run timing / gap rotation for decode-side timestamps.
        """
        now = time.time()
        with self._lock:
            if self.input_mode == "canp_tcp":
                # Capture already handled on the TCP read path.
                if self._current is None:
                    self._open_new_event(now, device_start_ms=device_batch_ms)
                self._last_packet_at = now
                return self._device_time_ns(device_batch_ms)

            if self._last_packet_at is not None and (now - self._last_packet_at) >= self.gap_sec:
                self._close_current_event(self._last_packet_at, reason="gap")
            if self._current is None:
                self._open_new_event(now, device_start_ms=device_batch_ms)
            self._last_packet_at = now
            self._write_slcan(slcan)
        return self._device_time_ns(device_batch_ms)

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

    def _device_time_ns(self, device_batch_ms: int | None) -> int | None:
        if self.input_mode != "canp_tcp" or device_batch_ms is None:
            return None
        if self._canp_event_start_device_ms is None or self._canp_event_host_start_ns is None:
            return int(device_batch_ms * 1_000_000)
        delta_ms = device_batch_ms - self._canp_event_start_device_ms
        return int(self._canp_event_host_start_ns + delta_ms * 1_000_000)

    def write_event_metadata(self, influx_client, event: dict) -> None:
        """Write event_meta into the protected `events` bucket, tagged with run_id."""
        if not influx_client or not event:
            return
        run_id = str(event.get("uuid") or event.get("id") or "").strip()
        if not run_id:
            return
        try:
            from server.util.events_bucket import EVENTS_BUCKET, MEASUREMENT, ensure_bucket
            from server.util.influx_writer import InfluxDBWriter

            if not ensure_bucket(influx_client):
                logger.warning("events bucket unavailable; skipping event_meta write")
                return
            writer = InfluxDBWriter(influx_client, EVENTS_BUCKET)
            start_ns = int(datetime.fromisoformat(event["start_time_iso"]).timestamp() * 1e9)
            writer.write_data(
                MEASUREMENT,
                {
                    "run_id": run_id,
                    "event_id": event.get("id", ""),
                    "vehicle": event.get("vehicle", ""),
                },
                {
                    "display_name": event.get("display_name", ""),
                    "start_time_iso": event.get("start_time_iso", ""),
                    "end_time_iso": event.get("end_time_iso") or "",
                    "dump_file": event.get("dump_file", ""),
                    "input_mode": event.get("input_mode", ""),
                    "device_start_ms": event.get("device_start_ms") or 0,
                },
                start_ns,
            )
            writer.close()
        except Exception as e:
            logger.warning("Failed to write event metadata to Influx: %s", e)

    def finalize_with_influx(self, influx_client) -> None:
        self.set_influx_client(influx_client)
        self.close_all()
