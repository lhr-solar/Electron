"""Push decoded telemetry to Grafana Live (Influx line protocol HTTP push).

Non-fatal: failures are logged; Influx remains the durable store.
Channels: stream/<stream_id>/<measurement>  (default stream_id=telemetry)

Influx keeps DBC choice *strings* (field type already string). Live only accepts
numerics, so enum labels are remapped to their DBC codes via highnoon_schema.json
(e.g. BPS_Fault "OK"→0, "Undervoltage"→2). Mapping "OK"→1 was wrong and made
fault tiles show Overvoltage / Under-Voltage.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

import httpx
from influxdb_client import Point, WritePrecision

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "scripts" / "highnoon_schema.json"
_CHOICE_MAPS: dict[str, dict[str, float]] | None = None


def _load_choice_maps() -> dict[str, dict[str, float]]:
    """field_name -> {label_lower: code} from HighNoon schema."""
    global _CHOICE_MAPS
    if _CHOICE_MAPS is not None:
        return _CHOICE_MAPS
    maps: dict[str, dict[str, float]] = {}
    try:
        schema = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
        for msgs in schema.values():
            for msg in msgs:
                for sig in msg.get("signals") or []:
                    choices = sig.get("choices")
                    if not choices:
                        continue
                    name = sig.get("name")
                    if not name:
                        continue
                    rev = {str(v).strip().lower(): float(k) for k, v in choices.items()}
                    maps[name] = rev
    except Exception as exc:
        logger.warning("Grafana Live: could not load schema choice maps: %s", exc)
    _CHOICE_MAPS = maps
    logger.info("Grafana Live: loaded %d enum choice maps for Live remapping", len(maps))
    return maps


def live_writer_from_env() -> "GrafanaLiveWriter | None":
    token = (os.environ.get("GRAFANA_LIVE_TOKEN") or "").strip()
    if not token:
        return None
    base = (os.environ.get("GRAFANA_URL") or "http://127.0.0.1:3000").rstrip("/")
    stream_id = (os.environ.get("GRAFANA_LIVE_STREAM_ID") or "telemetry").strip() or "telemetry"
    return GrafanaLiveWriter(base_url=base, token=token, stream_id=stream_id)


class GrafanaLiveWriter:
    def __init__(
        self,
        base_url: str,
        token: str,
        stream_id: str = "telemetry",
        *,
        batch_size: int = 200,
        flush_interval_sec: float = 0.25,
    ):
        self.url = f"{base_url.rstrip('/')}/api/live/push/{stream_id}"
        self.token = token
        self.stream_id = stream_id
        self.batch_size = batch_size
        self.flush_interval_sec = flush_interval_sec
        self._buf: list[str] = []
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._choice_maps = _load_choice_maps()
        self._client = httpx.Client(
            timeout=httpx.Timeout(5.0, connect=2.0),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "text/plain"},
        )
        self._thread = threading.Thread(target=self._flush_loop, name="grafana-live-flush", daemon=True)
        self._thread.start()
        self._last_error_log = 0.0
        logger.info("Grafana Live writer enabled → %s", self.url)

    # Grafana Live's line-protocol parser 500s whole batches on string fields
    # like raw_packet / enum labels. No tags: label sets churn blanks panels
    # and makes field names like `Foo {vehicle=...}` which break reduce filters.
    _SKIP_FIELDS = {"raw_packet"}

    def write_data(self, measurement: str, tags: dict, fields: dict, timestamp: int):
        try:
            point = Point(str(measurement))
            wrote_field = False
            for key, value in (fields or {}).items():
                if value is None or key in self._SKIP_FIELDS:
                    continue
                # Numerics only — string enums break Grafana Live batch parse.
                if isinstance(value, bool):
                    point.field(str(key), 1.0 if value else 0.0)
                    wrote_field = True
                elif isinstance(value, (int, float)) and not isinstance(value, bool):
                    point.field(str(key), float(value))
                    wrote_field = True
                elif isinstance(value, str):
                    mapped = self._enum_to_float(str(key), value)
                    if mapped is None:
                        continue
                    point.field(str(key), mapped)
                    wrote_field = True
            if not wrote_field:
                return
            point.time(int(timestamp), WritePrecision.NS)
            line = point.to_line_protocol()
        except Exception as exc:
            logger.debug("Grafana Live encode failed: %s", exc)
            return

        with self._lock:
            self._buf.append(line)
            overflow = len(self._buf) >= self.batch_size
            batch = self._buf if overflow else None
            if overflow:
                self._buf = []
        if batch:
            self._post(batch)

    def _enum_to_float(self, field: str, value: str) -> float | None:
        """Map DBC choice label → numeric code for this field; else binary status fallback."""
        v = value.strip()
        if not v:
            return None
        # Digits already
        try:
            return float(v)
        except ValueError:
            pass
        field_map = self._choice_maps.get(field)
        if field_map:
            code = field_map.get(v.lower())
            if code is not None:
                return code
        return self._status_to_float(v)

    @staticmethod
    def _status_to_float(value: str) -> float | None:
        """Binary / contactor fallback when schema map misses a label."""
        v = value.strip().lower()
        # 0 = OK / idle / open  — never map "ok" to 1 (fault code 1 = first fault)
        if v in {"0", "false", "ok", "pass", "off", "open", "disabled", "inactive", "no", "-"}:
            return 0.0
        if v in {
            "1", "true", "nok", "not ok", "not_ok", "fail", "on", "closed",
            "enabled", "active", "yes", "selected", "pressed",
        }:
            return 1.0
        return None

    def close(self):
        self._stop.set()
        self._thread.join(timeout=2.0)
        with self._lock:
            batch = self._buf
            self._buf = []
        if batch:
            self._post(batch)
        self._client.close()

    def _flush_loop(self):
        while not self._stop.wait(self.flush_interval_sec):
            with self._lock:
                batch = self._buf
                self._buf = []
            if batch:
                self._post(batch)

    def _post(self, lines: list[str]):
        body = "\n".join(lines) + "\n"
        try:
            resp = self._client.post(self.url, content=body.encode("utf-8"))
            if resp.status_code >= 300:
                self._log_error("HTTP %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            self._log_error("%s", exc)

    def _log_error(self, fmt: str, *args: Any):
        now = time.monotonic()
        if now - self._last_error_log < 10.0:
            return
        self._last_error_log = now
        logger.warning("Grafana Live push failed: " + fmt, *args)


class DualTelemetryWriter:
    """Influx durable write + optional Grafana Live push; same write_data API as InfluxDBWriter."""

    def __init__(self, influx: Any, live: GrafanaLiveWriter | None = None):
        self.influx = influx
        self.live = live
        self.bucket = getattr(influx, "bucket", None)

    def write_data(self, measurement, tags, fields, timestamp):
        self.influx.write_data(measurement, tags, fields, timestamp)
        if self.live:
            self.live.write_data(measurement, tags, fields, timestamp)

    def backup_and_clear_bucket(self):
        return self.influx.backup_and_clear_bucket()

    def check_connection(self):
        return self.influx.check_connection()

    def close(self):
        try:
            self.influx.close()
        finally:
            if self.live:
                self.live.close()
