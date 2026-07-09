"""Time markers: click timestamps stored in a protected Influx bucket."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from influxdb_client import Point
from influxdb_client.client.write_api import SYNCHRONOUS

logger = logging.getLogger(__name__)

TIME_MARKERS_BUCKET = "time_markers"
MEASUREMENT = "time_marker"


def ensure_bucket(influx_client) -> bool:
    """Create the time_markers bucket if missing. Returns True when ready."""
    if not influx_client:
        return False
    try:
        api = influx_client.buckets_api()
        if api.find_bucket_by_name(TIME_MARKERS_BUCKET):
            return True
        api.create_bucket(bucket_name=TIME_MARKERS_BUCKET, org=influx_client.org)
        logger.info("Created Influx bucket '%s'", TIME_MARKERS_BUCKET)
        return True
    except Exception as e:
        # Race: another process created it
        if "already exists" in str(e).lower():
            return True
        logger.warning("Could not ensure time_markers bucket: %s", e)
        return False


def is_protected_bucket(name: str) -> bool:
    return (name or "").strip() == TIME_MARKERS_BUCKET


def create_marker(
    influx_client,
    *,
    name: str = "",
    marked_at_ns: int | None = None,
) -> dict:
    """Write a marker immediately. Returns {id, name, time_ns, time_iso}."""
    if not influx_client:
        raise RuntimeError("InfluxDB is not connected.")
    if not ensure_bucket(influx_client):
        raise RuntimeError("time_markers bucket unavailable.")

    marker_id = uuid.uuid4().hex
    ts_ns = int(marked_at_ns) if marked_at_ns is not None else time_ns_now()
    label = (name or "").strip()
    point = (
        Point(MEASUREMENT)
        .tag("id", marker_id)
        .field("name", label)
        .field("marked", 1)
        .time(ts_ns)
    )
    write_api = influx_client.write_api(write_options=SYNCHRONOUS)
    try:
        write_api.write(bucket=TIME_MARKERS_BUCKET, org=influx_client.org, record=point)
    finally:
        write_api.close()
    return {
        "id": marker_id,
        "name": label,
        "time_ns": ts_ns,
        "time_iso": _iso_ns(ts_ns),
        "bucket": TIME_MARKERS_BUCKET,
    }


def rename_marker(influx_client, marker_id: str, *, name: str, time_ns: int) -> dict:
    """Overwrite the name field for an existing marker (same id + timestamp)."""
    if not influx_client:
        raise RuntimeError("InfluxDB is not connected.")
    mid = (marker_id or "").strip()
    if not mid:
        raise ValueError("marker id required")
    label = (name or "").strip()
    ts_ns = int(time_ns)
    point = (
        Point(MEASUREMENT)
        .tag("id", mid)
        .field("name", label)
        .field("marked", 1)
        .time(ts_ns)
    )
    write_api = influx_client.write_api(write_options=SYNCHRONOUS)
    try:
        write_api.write(bucket=TIME_MARKERS_BUCKET, org=influx_client.org, record=point)
    finally:
        write_api.close()
    return {
        "id": mid,
        "name": label,
        "time_ns": ts_ns,
        "time_iso": _iso_ns(ts_ns),
        "bucket": TIME_MARKERS_BUCKET,
    }


def delete_markers(influx_client, markers: list[dict]) -> list[str]:
    """Delete markers by id + time_ns. Returns deleted ids. Public (no auth)."""
    if not influx_client:
        raise RuntimeError("InfluxDB is not connected.")
    if not ensure_bucket(influx_client):
        raise RuntimeError("time_markers bucket unavailable.")

    deleted: list[str] = []
    delete_api = influx_client.delete_api()
    for item in markers or []:
        mid = str((item or {}).get("id") or "").strip()
        if not mid:
            continue
        try:
            ts_ns = int((item or {}).get("time_ns"))
        except (TypeError, ValueError):
            continue
        # Narrow delete window around the point (±1µs) + id predicate.
        start = _iso_ns(max(0, ts_ns - 1000))
        stop = _iso_ns(ts_ns + 1000)
        predicate = f'_measurement="{MEASUREMENT}" AND id="{mid}"'
        try:
            delete_api.delete(
                start,
                stop,
                predicate,
                bucket=TIME_MARKERS_BUCKET,
                org=influx_client.org,
            )
            deleted.append(mid)
        except Exception as e:
            logger.warning("Failed to delete time marker %s: %s", mid, e)
    return deleted


def list_markers(
    influx_client,
    *,
    range_start: str = "-30d",
    limit: int = 500,
) -> list[dict]:
    """Return markers newest-first: [{id, name, time_ns, time_iso}, ...]."""
    if not influx_client:
        return []
    if not ensure_bucket(influx_client):
        return []
    lim = max(1, min(int(limit or 500), 2000))
    start = (range_start or "-30d").strip() or "-30d"
    # Guard against flux injection in range literal.
    if not start.startswith("-") and not start.startswith("20"):
        start = "-30d"
    flux = f'''
from(bucket: "{TIME_MARKERS_BUCKET}")
  |> range(start: {start})
  |> filter(fn: (r) => r._measurement == "{MEASUREMENT}")
  |> pivot(rowKey: ["_time", "id"], columnKey: ["_field"], valueColumn: "_value")
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: {lim})
'''
    try:
        tables = influx_client.query_api().query(flux, org=influx_client.org)
    except Exception as e:
        logger.warning("list_markers query failed: %s", e)
        return []

    out: list[dict] = []
    seen: set[str] = set()
    for table in tables or []:
        for rec in table.records:
            values = rec.values
            mid = str(values.get("id") or "").strip()
            if not mid or mid in seen:
                continue
            seen.add(mid)
            t = values.get("_time")
            if t is None:
                continue
            if hasattr(t, "timestamp"):
                ts_ns = int(t.timestamp() * 1_000_000_000)
            else:
                continue
            name = values.get("name")
            out.append(
                {
                    "id": mid,
                    "name": str(name).strip() if name is not None else "",
                    "time_ns": ts_ns,
                    "time_iso": _iso_ns(ts_ns),
                    "bucket": TIME_MARKERS_BUCKET,
                }
            )
    out.sort(key=lambda m: m["time_ns"], reverse=True)
    return out


def time_ns_now() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1_000_000_000)


def _iso_ns(ts_ns: int) -> str:
    sec = ts_ns / 1_000_000_000
    return datetime.fromtimestamp(sec, tz=timezone.utc).isoformat(timespec="milliseconds")
