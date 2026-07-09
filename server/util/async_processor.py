import asyncio
import logging
import time

from server.util.packet_envelope import PacketEnvelope
from .slcan_to_can_msg import parse_slcan
from server.util.analytics_buffer import analytics_buffer

logger = logging.getLogger(__name__)


def _normalize_frame(item) -> tuple[str, int | None, int | None]:
    if isinstance(item, PacketEnvelope):
        return item.slcan, item.device_time_ns, item.device_batch_ms
    return str(item), None, None


async def process_packets(packet_queue, stop_event, can_manager, live_message_queue=None, event_recorder=None):
    """
    Reads raw CAN packets from the queue, decodes them via CANManager.
    If live_message_queue is set, pushes decoded payloads for Socket.IO.
    """
    logger.info("Async Processor started.")
    while not stop_event.is_set():
        try:
            raw_item = await asyncio.wait_for(packet_queue.get(), timeout=1.0)
            slcan, envelope_ts, device_batch_ms = _normalize_frame(raw_item)
            if not slcan:
                packet_queue.task_done()
                continue

            from server.services.telemetry import telemetry_service
            telemetry_service.note_packet_received()

            device_time_ns = envelope_ts
            if event_recorder:
                computed = event_recorder.note_packet(slcan, device_batch_ms=device_batch_ms)
                if computed is not None:
                    device_time_ns = computed
                can_manager.run_id = event_recorder.current_run_id()
            elif device_batch_ms is not None:
                device_time_ns = int(device_batch_ms * 1_000_000)

            if device_time_ns is None:
                device_time_ns = time.time_ns()

            msg = parse_slcan(slcan)
            if msg:
                try:
                    payload = await asyncio.to_thread(
                        can_manager.process_message, msg, slcan, device_time_ns
                    )
                    if payload:
                        analytics_buffer.record(
                            {"timestamp_ns": device_time_ns, "raw_packet": slcan, **payload}
                        )
                        if live_message_queue is not None:
                            try:
                                live_message_queue.put_nowait(
                                    {"timestamp_ns": device_time_ns, "raw_packet": slcan, **payload}
                                )
                            except asyncio.QueueFull:
                                pass
                except Exception:
                    logger.debug("packet decode / analytics / live queue skipped for one frame", exc_info=True)
            packet_queue.task_done()
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            logger.info("Processor task cancelled.")
            break
        except Exception as e:
            logger.error(f"Error processing packet: {e}", exc_info=True)
    logger.info("Async Processor finished.")
