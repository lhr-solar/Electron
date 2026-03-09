import asyncio
import logging
import time
from .slcan_to_can_msg import parse_slcan

logger = logging.getLogger(__name__)


async def process_packets(packet_queue: asyncio.Queue, stop_event: asyncio.Event, can_manager, live_message_queue: asyncio.Queue | None = None):
    """
    Reads raw CAN packets from the queue, decodes them via CANManager.
    If live_message_queue is set, pushes { timestamp_ns, can_id_hex, message_name, signals } for each message.
    """
    logger.info("Async Processor started.")
    while not stop_event.is_set():
        try:
            raw_frame = await asyncio.wait_for(packet_queue.get(), timeout=1.0)
            msg = parse_slcan(raw_frame)
            if msg:
                timestamp_ns = time.time_ns()
                payload = await asyncio.to_thread(can_manager.process_message, msg, raw_frame)
                if payload and live_message_queue is not None:
                    try:
                        live_message_queue.put_nowait({"timestamp_ns": timestamp_ns, **payload})
                    except asyncio.QueueFull:
                        pass
            packet_queue.task_done()
        except asyncio.TimeoutError:
            continue
        except asyncio.CancelledError:
            logger.info("Processor task cancelled.")
            break
        except Exception as e:
            logger.error(f"Error processing packet: {e}", exc_info=True)
    logger.info("Async Processor finished.")
