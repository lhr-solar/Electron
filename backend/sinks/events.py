"""EventStore — named time-range markers persisted alongside telemetry sinks.

Backend is chosen from `config.sinks[]` (sqlite / influx / file); with no sinks we
use a local SQLite file under the backend data dir.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Protocol, runtime_checkable

from . import _MemoryEventMixin, _open_sqlite

logger = logging.getLogger(__name__)

_MEASUREMENT = "telemetry_events"


def _data_dir() -> Path:
    return Path(os.environ.get("BACKEND_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    start_ts_ns  INTEGER NOT NULL,
    end_ts_ns    INTEGER,
    tags         TEXT NOT NULL DEFAULT '[]',
    note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_ts_ns);
"""


def _now_ns() -> int:
    return time.time_ns()


def _overlap_clause(from_ns: int | None, to_ns: int | None) -> tuple[str, list]:
    """SQL WHERE fragment: events overlapping [from_ns, to_ns] (open-ended when null)."""
    parts, args = [], []
    if from_ns is not None:
        parts.append("(end_ts_ns IS NULL OR end_ts_ns >= ?)")
        args.append(from_ns)
    if to_ns is not None:
        parts.append("start_ts_ns <= ?")
        args.append(to_ns)
    where = f"WHERE {' AND '.join(parts)}" if parts else ""
    return where, args


def _row_to_event(row) -> dict:
    tags = json.loads(row["tags"] or "[]")
    note = row["note"]
    return {
        "id": row["id"],
        "name": row["name"],
        "start_ts_ns": row["start_ts_ns"],
        "end_ts_ns": row["end_ts_ns"],
        "tags": tags,
        **({"note": note} if note else {}),
    }


def _filter_overlap(events: list[dict], from_ns: int | None, to_ns: int | None) -> list[dict]:
    out = []
    for ev in events:
        start, end = ev["start_ts_ns"], ev.get("end_ts_ns")
        if from_ns is not None and end is not None and end < from_ns:
            continue
        if to_ns is not None and start > to_ns:
            continue
        out.append(ev)
    return sorted(out, key=lambda e: e["start_ts_ns"])


@runtime_checkable
class EventStore(Protocol):
    async def start_event(self, name: str, tags: list[str], note: str | None) -> dict: ...
    async def stop_event(self, event_id: str) -> dict: ...
    async def list_events(self, from_ns: int | None, to_ns: int | None) -> list[dict]: ...
    async def active_event(self) -> dict | None: ...
    async def close(self) -> None: ...


class SqliteEventStore:
    def __init__(self, path: str | Path):
        self._path = str(path)
        self._db = None

    async def _conn(self):
        if self._db is None:
            self._db = await _open_sqlite(self._path, _SCHEMA)
        return self._db

    async def _stop_active(self, end_ts_ns: int) -> None:
        db = await self._conn()
        await db.execute(
            "UPDATE events SET end_ts_ns = ? WHERE end_ts_ns IS NULL", (end_ts_ns,)
        )
        await db.commit()

    async def start_event(self, name: str, tags: list[str], note: str | None) -> dict:
        now = _now_ns()
        await self._stop_active(now)
        ev = {
            "id": uuid.uuid4().hex,
            "name": name,
            "start_ts_ns": now,
            "end_ts_ns": None,
            "tags": tags,
            **({"note": note} if note else {}),
        }
        db = await self._conn()
        await db.execute(
            "INSERT INTO events (id, name, start_ts_ns, end_ts_ns, tags, note) VALUES (?,?,?,?,?,?)",
            (ev["id"], ev["name"], ev["start_ts_ns"], None, json.dumps(tags), note),
        )
        await db.commit()
        return ev

    async def stop_event(self, event_id: str) -> dict:
        db = await self._conn()
        async with db.execute(
            "SELECT id, name, start_ts_ns, end_ts_ns, tags, note FROM events WHERE id = ?",
            (event_id,),
        ) as cur:
            row = await cur.fetchone()
        if not row:
            raise KeyError(event_id)
        if row["end_ts_ns"] is not None:
            return _row_to_event(row)
        end = _now_ns()
        await db.execute("UPDATE events SET end_ts_ns = ? WHERE id = ?", (end, event_id))
        await db.commit()
        row = dict(row)
        row["end_ts_ns"] = end
        return _row_to_event(row)

    async def list_events(self, from_ns: int | None, to_ns: int | None) -> list[dict]:
        where, args = _overlap_clause(from_ns, to_ns)
        db = await self._conn()
        async with db.execute(
            f"SELECT id, name, start_ts_ns, end_ts_ns, tags, note FROM events {where} ORDER BY start_ts_ns",
            args,
        ) as cur:
            rows = await cur.fetchall()
        return [_row_to_event(r) for r in rows]

    async def active_event(self) -> dict | None:
        db = await self._conn()
        async with db.execute(
            "SELECT id, name, start_ts_ns, end_ts_ns, tags, note FROM events WHERE end_ts_ns IS NULL LIMIT 1"
        ) as cur:
            row = await cur.fetchone()
        return _row_to_event(row) if row else None

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None


class FileEventStore(_MemoryEventMixin):
    def __init__(self, spec: dict):
        base = spec["path"]
        # Accept pre-suffixed paths so callers can pass either the base path or the full filename.
        self._path = base if base.endswith(".events.jsonl") else f"{base}.events.jsonl"
        self._events: dict[str, dict] = {}
        self._load_sync()

    def _load_sync(self) -> None:
        p = Path(self._path)
        if not p.exists():
            return
        for line in p.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                ev = json.loads(line)
                self._events[ev["id"]] = ev
            except (json.JSONDecodeError, KeyError):
                logger.debug("skipping bad events jsonl line", exc_info=True)

    def _append(self, ev: dict) -> None:
        Path(self._path).parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "a", encoding="utf-8") as f:
            f.write(json.dumps(ev) + "\n")

    async def start_event(self, name: str, tags: list[str], note: str | None) -> dict:
        now = _now_ns()
        await self._stop_all_active(now, lambda ev: asyncio.to_thread(self._append, ev))
        ev = {
            "id": uuid.uuid4().hex,
            "name": name,
            "start_ts_ns": now,
            "end_ts_ns": None,
            "tags": tags,
            **({"note": note} if note else {}),
        }
        self._events[ev["id"]] = ev
        await asyncio.to_thread(self._append, ev)
        return ev

    async def stop_event(self, event_id: str) -> dict:
        ev = self._events.get(event_id)
        if ev is None:
            raise KeyError(event_id)
        if ev.get("end_ts_ns") is not None:
            return ev
        ev = {**ev, "end_ts_ns": _now_ns()}
        self._events[event_id] = ev
        await asyncio.to_thread(self._append, ev)
        return ev

    async def list_events(self, from_ns: int | None, to_ns: int | None) -> list[dict]:
        return _filter_overlap(list(self._events.values()), from_ns, to_ns)

    async def active_event(self) -> dict | None:
        return self._active_event()

    async def close(self) -> None:
        return None


class InfluxEventStore(_MemoryEventMixin):
    """Influx annotation points; in-memory index for reads (ponytail: restart reloads empty until queried)."""

    def __init__(self, spec: dict):
        from influxdb_client import InfluxDBClient
        from influxdb_client.client.write_api import SYNCHRONOUS

        self.bucket = spec["bucket"]
        self.org = spec["org"]
        self._client = InfluxDBClient(url=spec["url"], token=spec["token"], org=self.org)
        self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
        self._events: dict[str, dict] = {}

    def _write(self, ev: dict) -> None:
        tags = {"id": ev["id"], "name": ev["name"], "tags": ",".join(ev.get("tags", []))}
        fields = {
            "note": ev.get("note") or "",
            "end_ts_ns": ev.get("end_ts_ns") or 0,
        }
        self._write_api.write(
            bucket=self.bucket,
            org=self.org,
            record={
                "measurement": _MEASUREMENT,
                "tags": tags,
                "fields": fields,
                "time": ev["start_ts_ns"],
            },
        )

    async def start_event(self, name: str, tags: list[str], note: str | None) -> dict:
        now = _now_ns()
        await self._stop_all_active(now, lambda ev: asyncio.to_thread(self._write, ev))
        ev = {
            "id": uuid.uuid4().hex,
            "name": name,
            "start_ts_ns": now,
            "end_ts_ns": None,
            "tags": tags,
            **({"note": note} if note else {}),
        }
        self._events[ev["id"]] = ev
        await asyncio.to_thread(self._write, ev)
        return ev

    async def stop_event(self, event_id: str) -> dict:
        ev = self._events.get(event_id)
        if ev is None:
            raise KeyError(event_id)
        if ev.get("end_ts_ns") is not None:
            return ev
        ev = {**ev, "end_ts_ns": _now_ns()}
        self._events[event_id] = ev
        await asyncio.to_thread(self._write, ev)
        return ev

    async def list_events(self, from_ns: int | None, to_ns: int | None) -> list[dict]:
        return _filter_overlap(list(self._events.values()), from_ns, to_ns)

    async def active_event(self) -> dict | None:
        return self._active_event()

    async def close(self) -> None:
        self._write_api.close()
        self._client.close()


def build_event_store(config: dict) -> EventStore:
    for spec in config.get("sinks", []):
        kind = spec.get("type")
        if kind == "sqlite":
            return SqliteEventStore(spec["path"])
        if kind == "influx":
            return InfluxEventStore(spec)
        if kind == "file":
            return FileEventStore(spec)
    _data_dir().mkdir(parents=True, exist_ok=True)
    return SqliteEventStore(_data_dir() / "events.db")
