"""SQLite sink — one row per decoded message, signals stored as a JSON blob.
Writes are batched per `write_batch` call inside a single transaction.
"""
from __future__ import annotations

import json
import logging

from . import _HealthyMixin, _open_sqlite

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    timestamp_ns INTEGER,
    can_id_hex   TEXT,
    message_name TEXT,
    sender       TEXT,
    network      TEXT,
    vehicle      TEXT,
    array_index  INTEGER,
    signals      TEXT,
    raw_packet   TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(timestamp_ns);
"""


class SqliteSink(_HealthyMixin):
    def __init__(self, spec: dict):
        self._path = spec["path"]
        self._db = None

    async def _conn(self):
        if self._db is None:
            self._db = await _open_sqlite(self._path, _SCHEMA)
        return self._db

    async def write_batch(self, batch: list[dict]) -> None:
        if not batch:
            return
        rows = [
            (
                m.get("timestamp_ns", 0),
                m.get("can_id_hex", ""),
                m.get("message_name"),
                m.get("sender", "Unknown"),
                m.get("network", "not_found"),
                m.get("vehicle", "unknown"),
                m.get("array_index"),
                json.dumps(m.get("signals", {})),
                m.get("raw_packet", ""),
            )
            for m in batch
        ]
        try:
            db = await self._conn()
            await db.executemany(
                "INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?)", rows
            )
            await db.commit()
            self._healthy = True
        except Exception:
            self._healthy = False
            logger.debug("SqliteSink write failed", exc_info=True)

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None
