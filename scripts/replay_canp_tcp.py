#!/usr/bin/env python3
"""Replay a tcp-read CANP capture as a time-accurate TCP server.

Capture format (from Data Sandbox scripts/tcp-read.py -o):
  For each socket.recv() chunk the file stores:
    [ISO-8601 timestamp] <raw binary bytes>
  Markers use the exact pattern:
    [YYYY-MM-DDTHH:MM:SS.mmm±HH:MM]

Example end-to-end test with Electron:
  1. Terminal A:
       python3 scripts/replay_canp_tcp.py
  2. Terminal B:
       source .venv/bin/activate && npm run dev
  3. In the UI: Input source -> CANP (Photon), IP 127.0.0.1, port 6500, vehicle HighNoon, start telemetry.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

# Same strict marker regex as Data Sandbox scripts/decode-canp.py
TS_RE = re.compile(rb"\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}\] ")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CAPTURE = ROOT / ".test_data" / "hn-2026-07-07.canp.txt"


@dataclass(frozen=True)
class CaptureChunk:
    wall_ts: float  # epoch seconds from tcp-read marker
    data: bytes


def _marker_epoch(marker: bytes) -> float:
    text = marker.decode("ascii").strip("[] ")
    return datetime.fromisoformat(text).timestamp()


def load_capture_chunks(path: Path) -> list[CaptureChunk]:
    raw = path.read_bytes()
    matches = list(TS_RE.finditer(raw))
    if not matches:
        if not raw:
            return []
        return [CaptureChunk(wall_ts=0.0, data=raw)]

    chunks: list[CaptureChunk] = []
    for i, match in enumerate(matches):
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(raw)
        data = raw[start:end]
        if data:
            chunks.append(CaptureChunk(wall_ts=_marker_epoch(match.group(0)), data=data))
    return chunks


async def _replay_to_client(
    writer: asyncio.StreamWriter,
    chunks: list[CaptureChunk],
    *,
    speed: float,
    max_delay: float,
    skip_gap: float,
    loop_capture: bool,
) -> None:
    loops = 0
    while True:
        loops += 1
        prev_ts: float | None = None
        sent_bytes = 0
        for chunk in chunks:
            if prev_ts is not None:
                delay = (chunk.wall_ts - prev_ts) / speed
                if skip_gap > 0 and delay > skip_gap:
                    delay = 0.0
                elif max_delay > 0:
                    delay = min(delay, max_delay)
                if delay > 0:
                    await asyncio.sleep(delay)
            writer.write(chunk.data)
            await writer.drain()
            sent_bytes += len(chunk.data)
            prev_ts = chunk.wall_ts
        print(
            f"[replay] pass {loops}: sent {sent_bytes:,} bytes in {len(chunks):,} tcp chunks",
            file=sys.stderr,
            flush=True,
        )
        if not loop_capture:
            break


async def _wait_after_connect(start_delay: float) -> None:
    """Delay starts only after a client connects (not from server listen time)."""
    wait = max(0.0, float(start_delay or 0))
    if wait > 0:
        print(f"[server] stream starts in {wait:.0f}s after connect", file=sys.stderr, flush=True)
        await asyncio.sleep(wait)


async def _handle_client(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    chunks: list[CaptureChunk],
    options: argparse.Namespace,
) -> None:
    peer = writer.get_extra_info("peername")
    print(f"[server] client connected: {peer}", file=sys.stderr, flush=True)
    try:
        await _wait_after_connect(options.start_delay)
        await _replay_to_client(
            writer,
            chunks,
            speed=options.speed,
            max_delay=options.max_delay,
            skip_gap=options.skip_gap,
            loop_capture=options.loop,
        )
    except (ConnectionResetError, BrokenPipeError, asyncio.IncompleteReadError):
        print(f"[server] client disconnected: {peer}", file=sys.stderr, flush=True)
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


async def _run_server(options: argparse.Namespace) -> None:
    capture_path = Path(options.file)
    if not capture_path.is_file():
        raise SystemExit(f"Capture not found: {capture_path}")

    chunks = load_capture_chunks(capture_path)
    if not chunks:
        raise SystemExit(f"No replay chunks in capture: {capture_path}")

    wire_bytes = sum(len(c.data) for c in chunks)
    span_sec = chunks[-1].wall_ts - chunks[0].wall_ts
    print(f"[load] {capture_path.name}", file=sys.stderr)
    print(f"[load] {len(chunks):,} tcp chunks, {wire_bytes:,} wire bytes, span {span_sec:.1f}s", file=sys.stderr)

    async def handler(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        await _handle_client(reader, writer, chunks, options)

    server = await asyncio.start_server(handler, options.host, options.port)
    addrs = ", ".join(str(sock.getsockname()) for sock in server.sockets or [])
    print(f"[server] listening on {addrs}", file=sys.stderr)
    print(
        f"[server] after each connect, wait {options.start_delay:.0f}s then replay at {options.speed}x",
        file=sys.stderr,
    )

    async with server:
        await server.serve_forever()


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay tcp-read CANP capture over TCP.")
    parser.add_argument("--file", default=str(DEFAULT_CAPTURE), help="tcp-read capture (.canp.txt)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=6500)
    parser.add_argument(
        "--start-delay",
        type=float,
        default=5.0,
        help="seconds to wait after client connects before sending data (default: 5)",
    )
    parser.add_argument("--speed", type=float, default=1.0, help="playback speed multiplier")
    parser.add_argument(
        "--max-delay",
        type=float,
        default=2.0,
        help="cap per-chunk sleep seconds (0 = no cap)",
    )
    parser.add_argument(
        "--skip-gap",
        type=float,
        default=5.0,
        help="skip sleeps longer than this (power-cycle gaps); 0 = never skip",
    )
    parser.add_argument("--loop", action="store_true", help="loop capture for each connected client")
    args = parser.parse_args()

    try:
        asyncio.run(_run_server(args))
    except KeyboardInterrupt:
        print("\n[server] stopped", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
