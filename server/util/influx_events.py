"""Load recent event metadata from Influx event buckets."""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

_EVENT_BUCKET_RE = re.compile(r" - Run \d+$", re.IGNORECASE)


def _is_event_bucket(name: str) -> bool:
    return bool(name and _EVENT_BUCKET_RE.search(name.strip()))


def _record_to_event(bucket_name: str, records: list) -> dict | None:
    if not records:
        return None
    first = records[0]
    values = first.values
    event_id = values.get("event_id") or values.get("id") or f"influx_{bucket_name}"
    merged: dict = {
        "id": str(event_id),
        "bucket_name": bucket_name,
        "display_name": bucket_name,
        "vehicle": values.get("vehicle") or "",
        "source": "influx",
        "dump_file": "",
        "dump_path": "",
    }
    for rec in records:
        field = rec.get_field()
        val = rec.get_value()
        if field in ("display_name", "start_time_iso", "end_time_iso", "dump_file", "input_mode"):
            merged[field] = str(val) if val is not None else ""
        elif field == "device_start_ms":
            try:
                merged["device_start_ms"] = int(val)
            except (TypeError, ValueError):
                pass
    if merged.get("display_name"):
        merged["display_name"] = str(merged["display_name"])
    return merged


def list_recent_influx_events(influx_client, org: str, *, limit: int = 100) -> list[dict]:
    if not influx_client:
        return []
    try:
        buckets = influx_client.buckets_api().find_buckets().buckets or []
    except Exception as e:
        logger.warning("Failed to list Influx buckets for events: %s", e)
        return []

    event_buckets = [b.name for b in buckets if _is_event_bucket(b.name)]
    if not event_buckets:
        return []

    query_api = influx_client.query_api()
    events: list[dict] = []
    for bucket_name in sorted(event_buckets):
        try:
            flux = f'''
from(bucket: "{bucket_name}")
  |> range(start: -365d)
  |> filter(fn: (r) => r._measurement == "event_meta")
  |> last()
'''
            tables = query_api.query(flux, org=org)
            bucket_records: list = []
            for table in tables:
                bucket_records.extend(table.records)
            evt = _record_to_event(bucket_name, bucket_records)
            if evt:
                events.append(evt)
        except Exception as e:
            logger.debug("Skip event bucket %s: %s", bucket_name, e)

    def sort_key(evt: dict) -> str:
        return evt.get("start_time_iso") or evt.get("display_name") or ""

    events.sort(key=sort_key, reverse=True)
    return events[:limit]


def merge_local_and_influx_events(local: list[dict], influx: list[dict]) -> list[dict]:
    by_id: dict[str, dict] = {}
    by_bucket: dict[str, dict] = {}

    for evt in local:
        item = dict(evt)
        item.setdefault("source", "local")
        by_id[item.get("id", "")] = item
        if item.get("bucket_name"):
            by_bucket[item["bucket_name"]] = item

    for evt in influx:
        existing = by_id.get(evt.get("id", "")) or by_bucket.get(evt.get("bucket_name", ""))
        if existing:
            for key, val in evt.items():
                if key in ("dump_file", "dump_path") and existing.get(key):
                    continue
                if val and not existing.get(key):
                    existing[key] = val
            if existing.get("source") == "local":
                existing["influx_synced"] = True
            continue
        by_id[evt.get("id", f"influx_{evt.get('bucket_name')}")] = dict(evt)

    merged = list(by_id.values())
    merged.sort(key=lambda e: e.get("start_time_iso") or "", reverse=True)
    return merged
