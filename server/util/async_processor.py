import asyncio
import logging
from .slcan_to_can_msg import parse_slcan

logger = logging.getLogger(__name__)

async def process_packets(packet_queue: asyncio.Queue, stop_event: asyncio.Event, can_manager):
    """
    Async task that reads raw CAN packets from the queue, decodes them,
    and passes them to the CANManager.
    """
    logger.info("Async Processor started.")
    while not stop_event.is_set():
        try:
            # Wait for a packet from the queue
            # wait_for allows us to check the stop_event periodically if the queue is empty
            raw_frame = await asyncio.wait_for(packet_queue.get(), timeout=1.0)
            
            msg = parse_slcan(raw_frame)
            if msg:
                # process_message is synchronous (CPU bound), which is fine.
                # If it becomes too slow, we can wrap it in asyncio.to_thread()
                can_manager.process_message(msg, raw_frame)
            
            packet_queue.task_done()
            
        except asyncio.TimeoutError:
            # Queue was empty for 1 second, check stop_event and continue
            continue
        except asyncio.CancelledError:
            logger.info("Processor task cancelled.")
            break
        except Exception as e:
            logger.error(f"Error processing packet: {e}", exc_info=True)
    
    logger.info("Async Processor finished.")
