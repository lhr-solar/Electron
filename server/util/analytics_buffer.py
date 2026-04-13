"""
In-memory ring buffer for analytics (min / max / time series). Fed from live CAN decode only.
InfluxDB is not used — Grafana keeps using Influx independently.

All record/query paths are defensive: failures are logged and processing continues.
"""
from __future__ import annotations

import logging
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

MAX_SAMPLES_PER_MESSAGE = 5000
DEFAULT_SERIES_LIMIT = 5000
MAX_SERIES_LIMIT = 25_000


def _parse_duration_ns(range_value: str) -> int:
    """Relative Flux-style duration to nanoseconds. Default 1h."""
    try:
        r = (range_value or "-1h").strip()
        m = re.match(r"^-(\d+(?:\.\d+)?)([smhdw])$", r, re.I)
        if not m:
            return int(3600 * 1e9)
        n = float(m.group(1))
        u = m.group(2).lower()
        sec = n * {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}.get(u, 3600)
        return int(sec * 1e9)
    except Exception as e:
        logger.debug("analytics _parse_duration_ns: %s", e, exc_info=True)
        return int(3600 * 1e9)


def _iso_ns(ts_ns: int) -> str:
    try:
        return datetime.fromtimestamp(ts_ns / 1e9, tz=timezone.utc).isoformat()
    except Exception:
        return ""


def _frame_id_from_payload(can_id_hex: str) -> int | None:
    h = (can_id_hex or "").strip()
    if not h:
        return None
    try:
        if h.lower().startswith("0x"):
            return int(h, 16)
        return int(h, 16)
    except ValueError:
        return None


def _analytics_signals(signals: dict[str, Any]) -> dict[str, Any]:
    """Values for the ring buffer: numbers and DBC value-table (enum) string labels."""
    out: dict[str, Any] = {}
    for k, v in (signals or {}).items():
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            try:
                out[str(k)] = float(v)
            except (TypeError, ValueError, OverflowError):
                continue
        elif isinstance(v, str):
            s = v.strip()
            if s:
                out[str(k)] = s
    return out


def _float_for_stat(raw: Any) -> float | None:
    """Min/max stats are numeric only (skip enums / strings)."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, str):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError, OverflowError):
        return None


def _pivot_scalar(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, str):
        return v
    try:
        return float(v)
    except (TypeError, ValueError, OverflowError):
        return str(v) if v is not None else None


@dataclass
class StatResult:
    value: float | None
    at_index: int | None
    at_time: str | None
    samples_in_aggregate: int


class AnalyticsBuffer:
    """
    Per (vehicle, frame_id) deque of decoded frames: {ts_ns, array_index, signals}.

    Array min/max uses latest value per index per field, updated only when new frames arrive
    (not ring rescan). all_indices and single_index both read from that map.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._buffers: dict[tuple[str, int], deque[dict[str, Any]]] = {}
        # (vehicle, message_id, field) -> array_index -> (value, ts_ns) — last sample per slot
        self._array_field_latest: dict[tuple[str, int, str], dict[int, tuple[float, int]]] = {}

    def clear(self) -> None:
        try:
            with self._lock:
                self._buffers.clear()
                self._array_field_latest.clear()
        except Exception as e:
            logger.debug("analytics_buffer.clear: %s", e, exc_info=True)

    def record(self, payload: dict[str, Any]) -> None:
        """Call for each decoded live message. Never raises."""
        try:
            vehicle = (payload.get("vehicle") or "").strip()
            if not vehicle:
                return
            fid = _frame_id_from_payload(payload.get("can_id_hex") or "")
            if fid is None:
                return
            ts = payload.get("timestamp_ns")
            try:
                ts_ns = int(ts) if ts is not None else time.time_ns()
            except (TypeError, ValueError, OverflowError):
                ts_ns = time.time_ns()
            sigs = _analytics_signals(payload.get("signals") or {})
            if not sigs:
                return
            arr = payload.get("array_index")
            if arr is not None:
                try:
                    arr = int(arr)
                except (TypeError, ValueError, OverflowError):
                    arr = None
            row = {"ts_ns": ts_ns, "array_index": arr, "signals": sigs}
            key = (vehicle, fid)
            with self._lock:
                dq = self._buffers.setdefault(key, deque(maxlen=MAX_SAMPLES_PER_MESSAGE))
                dq.append(row)
                if arr is not None:
                    for fname, raw in sigs.items():
                        fv = _float_for_stat(raw)
                        if fv is None:
                            continue
                        fn = str(fname)
                        latest = self._array_field_latest.setdefault((vehicle, fid, fn), {})
                        latest[int(arr)] = (fv, ts_ns)
        except Exception as e:
            logger.debug("analytics_buffer.record skipped: %s", e, exc_info=True)

    def _cutoff_ns(self, range_value: str) -> int:
        try:
            return time.time_ns() - _parse_duration_ns(range_value)
        except Exception:
            return time.time_ns() - int(3600 * 1e9)

    def _rows_in_window(
        self, vehicle: str, message_id: int, range_value: str
    ) -> list[dict[str, Any]]:
        try:
            key = (vehicle.strip(), int(message_id))
        except (TypeError, ValueError, OverflowError):
            return []
        cutoff = self._cutoff_ns(range_value)
        try:
            with self._lock:
                dq = self._buffers.get(key)
                if not dq:
                    return []
                return [r for r in dq if int(r.get("ts_ns") or 0) >= cutoff]
        except Exception as e:
            logger.debug("analytics_buffer._rows_in_window: %s", e, exc_info=True)
            return []

    def query_stat(
        self,
        *,
        range_value: str,
        vehicle: str,
        message_id: int,
        field: str,
        stat: str,
        array_mode: str | None,
        array_index: int | None,
    ) -> StatResult:
        try:
            if stat not in ("min", "max"):
                return StatResult(None, None, None, 0)
            want_max = stat == "max"
            veh = (vehicle or "").strip()
            try:
                mid = int(message_id)
            except (TypeError, ValueError, OverflowError):
                return StatResult(None, None, None, 0)
            fn = str(field)
            cutoff = self._cutoff_ns(range_value)

            def consider(r: dict[str, Any]) -> tuple[float, int | None, int] | None:
                try:
                    sigs = r.get("signals") or {}
                    if field not in sigs:
                        return None
                    v = float(sigs[field])
                    ts = int(r["ts_ns"])
                    idx = r.get("array_index")
                    return (v, idx, ts)
                except Exception:
                    return None

            if array_mode is None:
                rows = self._rows_in_window(vehicle, message_id, range_value)
                candidates: list[tuple[float, int | None, int]] = []
                for r in rows:
                    if r.get("array_index") is not None:
                        continue
                    c = consider(r)
                    if c:
                        candidates.append(c)
                return self._reduce_stat(candidates, want_max)

            # Array: latest value per index from record(); single_index picks one slot.
            if array_mode == "single_index":
                try:
                    ix = int(array_index) if array_index is not None else 0
                except (TypeError, ValueError, OverflowError):
                    ix = 0
                with self._lock:
                    latest = self._array_field_latest.get((veh, mid, fn))
                    if not latest or ix not in latest:
                        return StatResult(None, None, None, 0)
                    v, ts = latest[ix]
                    if int(ts) < cutoff:
                        return StatResult(None, None, None, 0)
                    candidates = [(v, ix, ts)]
                return self._reduce_stat(candidates, want_max)

            # all_indices: min/max across each slot's latest value (stale slots excluded by cutoff).
            with self._lock:
                latest = self._array_field_latest.get((veh, mid, fn))
                if not latest:
                    return StatResult(None, None, None, 0)
                candidates = [
                    (v, idx, ts)
                    for idx, (v, ts) in latest.items()
                    if int(ts) >= cutoff
                ]
            return self._reduce_stat(candidates, want_max)
        except Exception as e:
            logger.debug("analytics_buffer.query_stat: %s", e, exc_info=True)
            return StatResult(None, None, None, 0)

    def _reduce_stat(
        self, candidates: list[tuple[float, int | None, int]], want_max: bool
    ) -> StatResult:
        try:
            if not candidates:
                return StatResult(None, None, None, 0)
            if want_max:
                best = max(
                    candidates,
                    key=lambda x: (x[0], x[1] if x[1] is not None else -1),
                )
            else:
                best = min(
                    candidates,
                    key=lambda x: (x[0], x[1] if x[1] is not None else float("inf")),
                )
            val, idx, ts_ns = best
            return StatResult(
                value=val,
                at_index=idx,
                at_time=_iso_ns(ts_ns),
                samples_in_aggregate=len(candidates),
            )
        except Exception as e:
            logger.debug("analytics_buffer._reduce_stat: %s", e, exc_info=True)
            return StatResult(None, None, None, 0)

    def query_series(
        self,
        *,
        range_value: str,
        vehicle: str,
        message_id: int,
        field: str,
        array_index: int | None,
        limit: int = DEFAULT_SERIES_LIMIT,
    ) -> tuple[list[dict[str, Any]], bool]:
        try:
            lim = max(1, min(int(limit or DEFAULT_SERIES_LIMIT), MAX_SERIES_LIMIT))
            rows = self._rows_in_window(vehicle, message_id, range_value)
            points: list[dict[str, Any]] = []
            for r in sorted(rows, key=lambda x: int(x.get("ts_ns") or 0)):
                if array_index is not None:
                    if r.get("array_index") != array_index:
                        continue
                else:
                    if r.get("array_index") is not None:
                        continue
                sigs = r.get("signals") or {}
                if field not in sigs:
                    continue
                try:
                    ts_i = int(r["ts_ns"])
                    raw = sigs[field]
                    if isinstance(raw, str):
                        points.append({"t": _iso_ns(ts_i), "v": raw})
                    else:
                        fv = float(raw)
                        points.append({"t": _iso_ns(ts_i), "v": fv})
                except Exception:
                    continue
            truncated = len(points) > lim
            points = points[-lim:]
            return points, truncated
        except Exception as e:
            logger.debug("analytics_buffer.query_series: %s", e, exc_info=True)
            return [], False

    def query_pivot_fields(
        self,
        *,
        range_value: str,
        vehicle: str,
        message_id: int,
        fields: list[str],
        array_index: int | None,
        limit: int = 3000,
    ) -> tuple[list[dict[str, Any]], bool]:
        try:
            if not fields:
                return [], False
            lim = max(1, min(int(limit), MAX_SERIES_LIMIT))
            rows = self._rows_in_window(vehicle, message_id, range_value)
            out: list[dict[str, Any]] = []
            for r in sorted(rows, key=lambda x: int(x.get("ts_ns") or 0)):
                if array_index is not None:
                    if r.get("array_index") != array_index:
                        continue
                else:
                    if r.get("array_index") is not None:
                        continue
                sigs = r.get("signals") or {}
                if not all(f in sigs for f in fields):
                    continue
                try:
                    ts_i = int(r["ts_ns"])
                    row: dict[str, Any] = {"t": _iso_ns(ts_i)}
                    for f in fields:
                        row[f] = _pivot_scalar(sigs.get(f))
                    out.append(row)
                except Exception:
                    continue
            truncated = len(out) > lim
            out = out[-lim:]
            return out, truncated
        except Exception as e:
            logger.debug("analytics_buffer.query_pivot_fields: %s", e, exc_info=True)
            return [], False


analytics_buffer = AnalyticsBuffer()
