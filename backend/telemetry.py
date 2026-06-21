"""Telemetry pipeline: pull decoded batches from the engine, update the signal
cache, and fan out to connected WS clients + sinks on a ~100ms cadence (matching
v3 `TelemetryService._emit_live_messages`).

The engine's `poll_batch` is potentially blocking, so it runs in a worker thread;
everything else stays on the event loop.
"""
from __future__ import annotations

import asyncio
import logging

from .engine import make_engine
from .events import events
from .sinks import build_sinks
from .sinks.influx import InfluxSink

logger = logging.getLogger(__name__)

_POLL_TIMEOUT_MS = 100


class TelemetryService:
    def __init__(self):
        self._engine = None
        self._sinks = []
        self._task: asyncio.Task | None = None
        self._running = False
        self._clients: set = set()
        # cache key "vehicle::sender" -> can_id_hex -> message object (mirrors v3)
        self._cache: dict[str, dict] = {}

    @property
    def running(self) -> bool:
        return self._running

    # --- client registry (WS connections) ---
    def add_client(self, send) -> None:
        self._clients.add(send)

    def remove_client(self, send) -> None:
        self._clients.discard(send)

    # --- cache ---
    def get_cache(self) -> dict:
        return self._cache

    def reset_cache(self) -> None:
        self._cache = {}

    def _update_cache(self, msg: dict) -> None:
        key = f"{msg.get('vehicle', 'unknown')}::{msg.get('sender', 'Unknown')}"
        self._cache.setdefault(key, {})[msg.get("can_id_hex", "")] = {
            "message_name": msg.get("message_name"),
            "network": msg.get("network", "not_found"),
            "signals": msg.get("signals", {}),
            "units": msg.get("units", {}),
            "raw_packet": msg.get("raw_packet", ""),
            "timestamp_ns": msg.get("timestamp_ns", 0),
            **({"array_index": msg["array_index"]} if "array_index" in msg else {}),
        }

    # --- lifecycle ---
    async def start(self, config: dict) -> None:
        if self._running:
            return
        self._engine = make_engine(config)
        self._sinks = build_sinks(config.get("sinks", []))
        await asyncio.to_thread(self._engine.start)
        self._running = True
        self._task = asyncio.create_task(self._run())
        await self.broadcast_status()

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None
        if self._engine:
            await asyncio.to_thread(self._engine.stop)
        for sink in self._sinks:
            await sink.close()
        self._sinks = []
        await self.broadcast_status()

    async def _run(self) -> None:
        try:
            while self._running:
                batch = await asyncio.to_thread(self._engine.poll_batch, _POLL_TIMEOUT_MS)
                if not batch:
                    continue
                for msg in batch:
                    self._update_cache(msg)
                await self._fan_out(batch)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("telemetry loop crashed")

    async def _fan_out(self, batch: list[dict]) -> None:
        await self.broadcast({"type": "live_message_batch", "payload": batch})
        for sink in self._sinks:
            await sink.write_batch(batch)

    # --- WS broadcast ---
    async def broadcast(self, envelope: dict) -> None:
        if not self._clients:
            return
        dead = []
        for send in list(self._clients):
            try:
                await send(envelope)
            except Exception:
                logger.debug("ws client send failed, dropping", exc_info=True)
                dead.append(send)
        for send in dead:
            self._clients.discard(send)

    def status_payload(self) -> dict:
        eng = self._engine.status() if self._engine else {}
        influx_connected = any(
            isinstance(s, InfluxSink) and s.healthy() for s in self._sinks
        )
        # ponytail: stub — grafana_url/active are placeholders until server config
        # gains a grafana section; deploy stack uses port 3000 by convention.
        return {
            "service_running": self._running,
            "influx_connected": influx_connected,
            "grafana_active": False,
            "grafana_url": "http://127.0.0.1:3000",
            "parser_status": eng.get("parser_status", "idle"),
            "parser_connection_state": eng.get("parser_connection_state"),
            "error_message": eng.get("error_message"),
            "dbc_errors": eng.get("dbc_errors", []),
            "influx_bucket": self._influx_bucket(),
            "vehicle": eng.get("vehicle", ""),
            "active_event": events.active_event,
        }

    def _influx_bucket(self) -> str:
        return next((getattr(s, "bucket", "") for s in self._sinks if hasattr(s, "bucket")), "")

    async def broadcast_status(self) -> None:
        await self.broadcast({"type": "status", "payload": self.status_payload()})


telemetry = TelemetryService()
