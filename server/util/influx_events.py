"""Load recent event metadata from the protected `events` bucket (+ legacy leftovers)."""

from __future__ import annotations

import logging
import re

from server.util.events_bucket import EVENTS_BUCKET, MEASUREMENT, ensure_bucket

logger = logging.getLogger(__name__)

_LEGACY_RUN_BUCKET_RE = re.compile(r" - Run \d+$", re.IGNORECASE)


def _is_legacy_run_bucket(name: str) -> bool:
    return bool(name and _LEGACY_RUN_BUCKET_RE.search(name.strip()))


def _records_to_events(records: list, *, default_bucket: str) -> list[dict]:
    """Group event_meta field rows by run_id / event_id into event dicts."""
    by_key: dict[str, dict] = {}
    for rec in records:
        values = rec.values
        run_id = str(values.get("run_id") or "").strip()
        event_id = str(values.get("event_id") or values.get("id") or "").strip()
        key = run_id or event_id or default_bucket
        if key not in by_key:
            by_key[key] = {
                "id": event_id or key,
                "uuid": run_id or "",
                "bucket_name": default_bucket,
                "display_name": default_bucket if _is_legacy_run_bucket(default_bucket) else "",
                "vehicle": values.get("vehicle") or "",
                "source": "influx",
                "dump_file": "",
                "dump_path": "",
            }
            if run_id:
                by_key[key]["uuid"] = run_id
        merged = by_key[key]
        field = rec.get_field()
        val = rec.get_value()
        if field in ("display_name", "start_time_iso", "end_time_iso", "dump_file", "input_mode"):
            if val is not None and str(val):
                merged[field] = str(val)
        elif field == "device_start_ms":
            try:
                merged["device_start_ms"] = int(val)
            except (TypeError, ValueError):
                pass
    return list(by_key.values())


def _query_event_meta(query_api, org: str, bucket_name: str) -> list:
    flux = f'''
from(bucket: "{bucket_name}")
  |> range(start: -365d)
  |> filter(fn: (r) => r._measurement == "{MEASUREMENT}")
  |> group(columns: ["run_id", "event_id", "_field"])
  |> last()
'''
    tables = query_api.query(flux, org=org)
    records: list = []
    for table in tables:
        records.extend(table.records)
    return records


def list_recent_influx_events(influx_client, org: str, *, limit: int = 100) -> list[dict]:
    if not influx_client:
        return []
    try:
        buckets = influx_client.buckets_api().find_buckets().buckets or []
    except Exception as e:
        logger.warning("Failed to list Influx buckets for events: %s", e)
        return []

    bucket_names = {b.name for b in (buckets or []) if b and b.name}
    query_api = influx_client.query_api()
    events: list[dict] = []

    if ensure_bucket(influx_client) or EVENTS_BUCKET in bucket_names:
        try:
            records = _query_event_meta(query_api, org, EVENTS_BUCKET)
            events.extend(_records_to_events(records, default_bucket=EVENTS_BUCKET))
        except Exception as e:
            logger.debug("Skip events bucket event_meta: %s", e)

    # Legacy mistaken per-run buckets (read-only; no longer created).
    for bucket_name in sorted(n for n in bucket_names if _is_legacy_run_bucket(n)):
        try:
            records = _query_event_meta(query_api, org, bucket_name)
            legacy = _records_to_events(records, default_bucket=bucket_name)
            if not legacy:
                legacy = [{
                    "id": f"influx_{bucket_name}",
                    "bucket_name": bucket_name,
                    "display_name": bucket_name,
                    "vehicle": "",
                    "source": "influx",
                    "dump_file": "",
                    "dump_path": "",
                }]
            events.extend(legacy)
        except Exception as e:
            logger.debug("Skip legacy event bucket %s: %s", bucket_name, e)

    def sort_key(evt: dict) -> str:
        return evt.get("start_time_iso") or evt.get("display_name") or ""

    events.sort(key=sort_key, reverse=True)
    return events[:limit]


def merge_local_and_influx_events(local: list[dict], influx: list[dict]) -> list[dict]:
    by_id: dict[str, dict] = {}
    by_bucket: dict[str, dict] = {}
    by_uuid: dict[str, dict] = {}

    for evt in local:
        item = dict(evt)
        item.setdefault("source", "local")
        by_id[item.get("id", "")] = item
        if item.get("bucket_name"):
            by_bucket[item["bucket_name"]] = item
        if item.get("uuid"):
            by_uuid[item["uuid"]] = item

    for evt in influx:
        existing = (
            by_uuid.get(evt.get("uuid", ""))
            or by_id.get(evt.get("id", ""))
            or by_bucket.get(evt.get("bucket_name", ""))
        )
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
