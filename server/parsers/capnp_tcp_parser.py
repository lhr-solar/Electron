"""
TCP client that reads length-prefixed Cap'n Proto `CanFrame` messages and pushes
SLCAN strings onto the async queue (same contract as TCPParser / SLCAN).

Wire format (repeated on the stream):
  - 4 bytes: big-endian uint32 payload length N
  - N bytes: Cap'n Proto serialized `Can_frame.capnp` root struct `CanFrame`
"""
from __future__ import annotations

import asyncio
import logging
import os
import struct

import can

from server.config import settings
from server.util.can_to_slcan import message_to_slcan
from ._parser_abc import _Parser

logger = logging.getLogger(__name__)

_MAX_FRAME_BYTES = 4 * 1024 * 1024  # guard against corrupt length fields


def _load_can_frame_schema():
    try:
        import capnp  # noqa: F401
    except ImportError as e:
        raise RuntimeError(
            "Cap'n Proto input requires the 'pycapnp' package. "
            "Install with: pip install pycapnp"
        ) from e
    import capnp as capnp_mod

    schema_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "util",
        "capnp_schemas",
        "can_frame.capnp",
    )
    schema_path = os.path.normpath(schema_path)
    return capnp_mod.load(schema_path)


class CapnpTcpParser(_Parser):
    """TCP stream of length-prefixed Cap'n Proto CAN frames → SLCAN lines for process_packets."""

    def __init__(self, ip: str, port: int, queue: asyncio.Queue, stop_event: asyncio.Event):
        super().__init__(queue, stop_event)
        self.source = (ip, port)
        self.connection_state = False
        self.connection_timeout = settings.TCP_CONFIG.get("CONNECTION_TIMEOUT", 5.0)
        self._schema = None

    def _ensure_schema(self):
        if self._schema is None:
            self._schema = _load_can_frame_schema()

    def _capnp_to_slcan(self, payload: bytes) -> str | None:
        self._ensure_schema()
        try:
            with self._schema.CanFrame.from_bytes(payload) as frame:
                raw = frame.data
                dlc = min(len(raw), 8)
                data = bytes(raw[:dlc])
                msg = can.Message(
                    arbitration_id=int(frame.arbitrationId),
                    data=data,
                    is_extended_id=bool(frame.isExtended),
                )
                return message_to_slcan(msg) + "\r"
        except Exception as e:
            logger.warning("Cap'n Proto decode failed (%s bytes): %s", len(payload), e)
            return None

    async def run(self):
        ip, port = self.source
        self.status = "running"

        try:
            self._ensure_schema()
        except RuntimeError as e:
            self.error_message = str(e)
            self.status = "error"
            logger.error("%s", e)
            return

        while not self.stop_event.is_set():
            reader, writer = None, None
            try:
                self.error_message = None
                logger.info("Cap'n Proto TCP: connecting to %s:%s...", ip, port)
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(ip, port),
                    timeout=self.connection_timeout,
                )
                self.connection_state = True
                logger.info("Cap'n Proto TCP: connected.")

                buf = bytearray()
                while not self.stop_event.is_set():
                    chunk = await reader.read(65536)
                    if not chunk:
                        logger.warning("Cap'n Proto TCP: peer closed connection.")
                        self.connection_state = False
                        break
                    buf.extend(chunk)

                    while len(buf) >= 4:
                        (n,) = struct.unpack_from("!I", buf, 0)
                        if n > _MAX_FRAME_BYTES:
                            logger.error("Cap'n Proto TCP: invalid frame length %s; dropping buffer.", n)
                            buf.clear()
                            break
                        if len(buf) < 4 + n:
                            break
                        payload = bytes(buf[4 : 4 + n])
                        del buf[: 4 + n]
                        line = self._capnp_to_slcan(payload)
                        if line:
                            await self.queue.put(line)

            except asyncio.TimeoutError:
                logger.warning("Cap'n Proto TCP: connection timed out; retrying...")
                self.connection_state = False
                self.error_message = "Connection timed out."
                await asyncio.sleep(3)
            except asyncio.CancelledError:
                logger.info("CapnpTcpParser cancelled.")
                self.status = "finished"
                break
            except Exception as e:
                logger.error("Cap'n Proto TCP error: %s", e, exc_info=True)
                self.connection_state = False
                self.error_message = str(e)
                await asyncio.sleep(5)
            finally:
                if writer:
                    writer.close()
                    try:
                        await writer.wait_closed()
                    except Exception:
                        pass
                self.connection_state = False

        self.status = "finished"
        logger.info("CapnpTcpParser finished.")
