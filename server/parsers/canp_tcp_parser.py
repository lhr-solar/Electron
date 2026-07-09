"""TCP client for Photon CANP batched frames → SLCAN lines for process_packets."""

from __future__ import annotations

import asyncio
import logging

import can

from server.config import settings
from server.util.can_to_slcan import message_to_slcan
from server.util.canp import CanpStreamParser
from server.util.packet_envelope import PacketEnvelope
from ._parser_abc import _Parser

logger = logging.getLogger(__name__)


class CanpTcpParser(_Parser):
    def __init__(self, ip: str, port: int, queue: asyncio.Queue, stop_event: asyncio.Event):
        super().__init__(queue, stop_event)
        self.source = (ip, port)
        self.connection_state = False
        self.connection_timeout = settings.TCP_CONFIG.get("CONNECTION_TIMEOUT", 5.0)

    @staticmethod
    def _packet_to_slcan(can_id: int, dlc: int, data: bytes) -> str | None:
        try:
            msg = can.Message(
                arbitration_id=int(can_id),
                data=bytes(data[: min(dlc, 8)]),
                is_extended_id=can_id > 0x7FF,
            )
            return message_to_slcan(msg) + "\r"
        except Exception as e:
            logger.warning("CANP packet to SLCAN failed (id=0x%X dlc=%s): %s", can_id, dlc, e)
            return None

    async def run(self):
        ip, port = self.source
        self.status = "running"
        stream = CanpStreamParser()

        while not self.stop_event.is_set():
            reader, writer = None, None
            try:
                self.error_message = None
                logger.info("CANP TCP: connecting to %s:%s...", ip, port)
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(ip, port),
                    timeout=self.connection_timeout,
                )
                self.connection_state = True
                logger.info("CANP TCP: connected.")

                while not self.stop_event.is_set():
                    chunk = await reader.read(65536)
                    if not chunk:
                        logger.warning("CANP TCP: peer closed connection.")
                        self.connection_state = False
                        break
                    from server.services.telemetry import telemetry_service
                    if telemetry_service.event_recorder:
                        telemetry_service.event_recorder.note_canp_chunk(chunk)
                    for can_id, dlc, data, batch_ts_ms in stream.feed_packets(chunk):
                        line = self._packet_to_slcan(can_id, dlc, data)
                        if line:
                            await self.queue.put(
                                PacketEnvelope(slcan=line, device_batch_ms=batch_ts_ms)
                            )

            except asyncio.TimeoutError:
                logger.warning("CANP TCP: connection timed out; retrying...")
                self.connection_state = False
                self.error_message = "Connection timed out."
                await asyncio.sleep(3)
            except asyncio.CancelledError:
                logger.info("CanpTcpParser cancelled.")
                self.status = "finished"
                break
            except Exception as e:
                logger.error("CANP TCP error: %s", e, exc_info=True)
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
        logger.info("CanpTcpParser finished.")
