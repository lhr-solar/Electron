"""Photon CANP wire format (see lhr-solar/Photon photon/network/canp.h)."""

from __future__ import annotations

import struct
from dataclasses import dataclass

# photon/network/canp.h
CANP_MAGIC = 0x43414E31  # "CAN1"
CANP_VERSION = 3
CANP_MAX_BATCH = 64
HEADER_FMT = ">IHHI"
HEADER_SIZE = 20
PACKET_FMT = ">IB8s16s"
PACKET_SIZE = struct.calcsize(PACKET_FMT)
MAGIC_BYTES = struct.pack(">I", CANP_MAGIC)

YEAR_2000_MS = 946_684_800_000
YEAR_2100_MS = 4_102_444_800_000


def canp_ntoh64(value: int) -> int:
    """photon/network/canp.c — ntohl each 32-bit half, swap positions."""

    def ntohl(x: int) -> int:
        return int.from_bytes((x & 0xFFFFFFFF).to_bytes(4, "big"), "little")

    lo32 = value & 0xFFFFFFFF
    hi32 = (value >> 32) & 0xFFFFFFFF
    return (ntohl(lo32) << 32) | ntohl(hi32)


@dataclass(frozen=True)
class CanpBatch:
    seq: int
    timestamp_ms: int
    packets: list[tuple[int, int, bytes]]


def parse_batch(buf: bytes, off: int) -> CanpBatch | None:
    if off + HEADER_SIZE > len(buf):
        return None
    magic, version, count, seq = struct.unpack_from(HEADER_FMT, buf, off)
    if magic != CANP_MAGIC or version != CANP_VERSION or count == 0 or count > CANP_MAX_BATCH:
        return None
    ts_ms = canp_ntoh64(struct.unpack_from("<Q", buf, off + 12)[0])
    if not (YEAR_2000_MS <= ts_ms <= YEAR_2100_MS):
        return None
    end = off + HEADER_SIZE + count * PACKET_SIZE
    if end > len(buf):
        return None
    packets: list[tuple[int, int, bytes]] = []
    poff = off + HEADER_SIZE
    for _ in range(count):
        can_id, dlc, data, _delta_t = struct.unpack_from(PACKET_FMT, buf, poff)
        if dlc > 8:
            return None
        packets.append((can_id, dlc, data[:dlc]))
        poff += PACKET_SIZE
    return CanpBatch(seq=seq, timestamp_ms=ts_ms, packets=packets)


class CanpStreamParser:
    """Incrementally parse CANP batches from a TCP byte stream."""

    def __init__(self) -> None:
        self._buf = bytearray()

    def feed(self, chunk: bytes) -> list[tuple[int, int, bytes]]:
        return [p[:3] for p in self.feed_packets(chunk)]

    def feed_packets(
        self, chunk: bytes
    ) -> list[tuple[int, int, bytes, int]]:
        """Returns (can_id, dlc, data, batch_timestamp_ms) per packet."""
        self._buf.extend(chunk)
        packets: list[tuple[int, int, bytes, int]] = []
        off = 0
        while off + HEADER_SIZE <= len(self._buf):
            batch = parse_batch(self._buf, off)
            if batch is None:
                nxt = self._buf.find(MAGIC_BYTES, off + 1)
                if nxt < 0:
                    break
                off = nxt
                continue
            for can_id, dlc, data in batch.packets:
                packets.append((can_id, dlc, data, batch.timestamp_ms))
            off += HEADER_SIZE + len(batch.packets) * PACKET_SIZE
        if off > 0:
            del self._buf[:off]
        return packets


def pack_batch(seq: int, timestamp_ms: int, packets: list[tuple[int, int, bytes]]) -> bytes:
    """Serialize one CANP batch (big-endian header + packets)."""
    count = len(packets)
    if count <= 0 or count > CANP_MAX_BATCH:
        raise ValueError(f"invalid CANP packet count: {count}")
    # Mirror canp_ntoh64: store timestamp as two little-endian 32-bit halves swapped.
    def htonl(x: int) -> int:
        return int.from_bytes((x & 0xFFFFFFFF).to_bytes(4, "little"), "big")

    lo = timestamp_ms & 0xFFFFFFFF
    hi = (timestamp_ms >> 32) & 0xFFFFFFFF
    wire_ts = ((htonl(lo) & 0xFFFFFFFF) << 32) | (htonl(hi) & 0xFFFFFFFF)
    out = bytearray()
    out += struct.pack(HEADER_FMT, CANP_MAGIC, CANP_VERSION, count, seq & 0xFFFFFFFF)
    out += struct.pack("<Q", wire_ts)
    for can_id, dlc, data in packets:
        d = bytes(data[:8]).ljust(8, b"\x00")
        out += struct.pack(PACKET_FMT, int(can_id) & 0xFFFFFFFF, int(dlc) & 0xFF, d, b"\x00" * 16)
    return bytes(out)


def iter_canp_batches(buf: bytes):
    off = 0
    while off + HEADER_SIZE <= len(buf):
        batch = parse_batch(buf, off)
        if batch is None:
            nxt = buf.find(MAGIC_BYTES, off + 1)
            if nxt < 0:
                break
            off = nxt
            continue
        yield batch
        off += HEADER_SIZE + len(batch.packets) * PACKET_SIZE
