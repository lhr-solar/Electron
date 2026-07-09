"""Event metadata: run registry stored in a protected Influx bucket."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

EVENTS_BUCKET = "events"
MEASUREMENT = "event_meta"


def ensure_bucket(influx_client) -> bool:
    """Create the events bucket if missing. Returns True when ready."""
    if not influx_client:
        return False
    try:
        api = influx_client.buckets_api()
        if api.find_bucket_by_name(EVENTS_BUCKET):
            return True
        api.create_bucket(bucket_name=EVENTS_BUCKET, org=influx_client.org)
        logger.info("Created Influx bucket '%s'", EVENTS_BUCKET)
        return True
    except Exception as e:
        if "already exists" in str(e).lower():
            return True
        logger.warning("Could not ensure events bucket: %s", e)
        return False


def is_protected_bucket(name: str) -> bool:
    return (name or "").strip() == EVENTS_BUCKET
