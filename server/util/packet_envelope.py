from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PacketEnvelope:
    slcan: str
    raw_bytes: bytes | None = None
    device_time_ns: int | None = None
    device_batch_ms: int | None = None
