"""Sinks: outputs that consume decoded `live_message_batch` messages.

Adding a sink is a Python-only change: implement the `Sink` protocol and add a
branch in `make_sink`. Writes happen off the request path on the telemetry task.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@runtime_checkable
class Sink(Protocol):
    """One small contract. `write_batch` must be cheap/non-blocking on the event
    loop — buffer internally and flush in the background or via `asyncio.to_thread`."""

    async def write_batch(self, batch: list[dict]) -> None: ...
    async def close(self) -> None: ...
    def healthy(self) -> bool: ...


class _HealthyMixin:
    """Tracks write health; subclasses set `_healthy` on success/failure."""

    _healthy: bool = True

    def healthy(self) -> bool:
        return self._healthy


async def _open_sqlite(path: str | Path, schema: str):
    """Lazy-open SQLite with schema applied once."""
    import aiosqlite

    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(p))
    db.row_factory = aiosqlite.Row
    await db.executescript(schema)
    await db.commit()
    return db


class _MemoryEventMixin:
    """Shared in-memory event bookkeeping for file/influx event stores."""

    _events: dict[str, dict]

    async def _stop_all_active(self, end_ts_ns: int, persist) -> None:
        for eid, ev in list(self._events.items()):
            if ev.get("end_ts_ns") is None:
                stopped = {**ev, "end_ts_ns": end_ts_ns}
                self._events[eid] = stopped
                await persist(stopped)

    def _active_event(self) -> dict | None:
        return next((ev for ev in self._events.values() if ev.get("end_ts_ns") is None), None)


def make_sink(spec: dict) -> Sink | None:
    """Build a sink from a `config.schema.json` sink entry. Returns None on
    unknown/misconfigured type (logged), so one bad sink never kills the pipeline."""
    kind = spec.get("type")
    try:
        if kind == "influx":
            from .influx import InfluxSink

            return InfluxSink(spec)
        if kind == "sqlite":
            from .sqlite import SqliteSink

            return SqliteSink(spec)
        if kind == "file":
            from .file import FileSink

            return FileSink(spec)
    except Exception:
        logger.exception("failed to build sink %r", kind)
        return None
    else:
        logger.warning("unknown sink type %r — skipped", kind)
        return None


def build_sinks(sink_specs: list[dict]) -> list[Sink]:
    return [s for s in (make_sink(spec) for spec in sink_specs) if s is not None]
