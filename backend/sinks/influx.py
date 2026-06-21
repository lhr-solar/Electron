"""InfluxDB sink — the default. Point shape mirrors v3 `can_manager._write_to_influx`:
measurement = CAN id hex (sans 0x), tags = vehicle/network/sender/message_name[/idx],
fields = raw_packet + decoded signals. Batching is handled by the influx client's
own WriteOptions; the synchronous write is offloaded with `asyncio.to_thread`.
"""
from __future__ import annotations

import asyncio
import functools
import logging

from influxdb_client import InfluxDBClient
from influxdb_client.client.write_api import WriteOptions

logger = logging.getLogger(__name__)


@functools.lru_cache(maxsize=4096)
def _measurement(can_id_hex: str) -> str:
    return can_id_hex[2:].upper() if can_id_hex.lower().startswith("0x") else can_id_hex


def _field_value(value):
    return float(value) if isinstance(value, (int, float)) else str(value)


class InfluxSink:
    def __init__(self, spec: dict):
        self.bucket = spec["bucket"]
        self.org = spec["org"]
        self._client = InfluxDBClient(url=spec["url"], token=spec["token"], org=self.org)
        self._write_api = self._client.write_api(
            write_options=WriteOptions(batch_size=500, flush_interval=1000, jitter_interval=200)
        )
        self._connected = False
        try:
            self._connected = bool(self._client.ping())
        except Exception:
            logger.warning("InfluxSink: initial ping failed for %s", spec["url"])

    def _points(self, batch: list[dict]) -> list[dict]:
        points = []
        for msg in batch:
            fields = {"raw_packet": msg.get("raw_packet", "")}
            for name, value in msg.get("signals", {}).items():
                fields[name] = _field_value(value)
            if len(fields) <= 1:
                continue
            tags = {
                "vehicle": msg.get("vehicle", "unknown"),
                "network": msg.get("network", "not_found"),
                "sender": msg.get("sender", "Unknown"),
                "message_name": msg.get("message_name") or "not_found",
            }
            if (idx := msg.get("array_index")) is not None:
                tags["idx"] = str(idx)
            points.append(
                {
                    "measurement": _measurement(msg.get("can_id_hex", "")),
                    "tags": tags,
                    "fields": fields,
                    "time": msg.get("timestamp_ns", 0),
                }
            )
        return points

    async def write_batch(self, batch: list[dict]) -> None:
        points = self._points(batch)
        if not points:
            return
        try:
            await asyncio.to_thread(
                self._write_api.write, bucket=self.bucket, org=self.org, record=points
            )
            self._connected = True
        except Exception:
            self._connected = False
            logger.debug("InfluxSink write failed", exc_info=True)

    async def close(self) -> None:
        await asyncio.to_thread(self._write_api.close)
        self._client.close()

    def healthy(self) -> bool:
        return self._connected