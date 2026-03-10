"""
Parser for PEAK PCAN-USB adapters using python-can's PcanBus.
Requires PCAN-Basic API: Windows (PEAK drivers), macOS (MacCAN/PCBUSB), Linux (PEAK driver or SocketCAN).
"""
import asyncio
import logging
from ._parser_abc import _Parser
from server.util.can_to_slcan import message_to_slcan

logger = logging.getLogger(__name__)

# Standard CAN bitrates supported by PcanBus
PCAN_BITRATES = [10000, 20000, 50000, 100000, 125000, 250000, 500000, 800000, 1000000]


class PcanParser(_Parser):
    """Reads CAN frames from a PEAK PCAN-USB device via python-can PcanBus."""

    def __init__(
        self,
        channel: str,
        can_bitrate: int,
        queue: asyncio.Queue,
        stop_event: asyncio.Event,
        device_id: int | None = None,
    ):
        super().__init__(queue, stop_event)
        self.channel = channel
        self.can_bitrate = can_bitrate
        self.device_id = device_id
        self.bus = None
        self.source = channel

    async def run(self):
        self.status = "running"
        self.error_message = None

        logger.info(f"Opening PCAN {self.channel} @ {self.can_bitrate} bps...")

        try:
            import can
            from can.interfaces.pcan import PcanBus

            kwargs = {
                "channel": self.channel,
                "bitrate": self.can_bitrate,
                "state": can.BusState.ACTIVE,
            }
            if self.device_id is not None:
                kwargs["device_id"] = self.device_id

            self.bus = await asyncio.to_thread(PcanBus, **kwargs)
            self.connection_state = True
            self.error_message = None

            logger.info("PCAN bus opened. Listening for frames...")

            while not self.stop_event.is_set():
                msg = await asyncio.to_thread(self.bus.recv, timeout=0.1)
                if msg is not None:
                    slcan_str = message_to_slcan(msg)
                    await self.queue.put(slcan_str)

        except ImportError as e:
            logger.error(f"PCAN support not available: {e}", exc_info=True)
            self.status = "error"
            self.error_message = "python-can PCAN interface not available. Install PEAK drivers (Windows), MacCAN (macOS), or PEAK Linux driver."
        except Exception as e:
            logger.error(f"PCAN error: {e}", exc_info=True)
            self.status = "error"
            self.error_message = str(e)
        except asyncio.CancelledError:
            logger.info("PCAN parser task cancelled.")
            self.status = "finished"
        finally:
            if self.bus is not None:
                try:
                    await asyncio.to_thread(self.bus.shutdown)
                except Exception:
                    pass
            self.connection_state = False
            if self.status != "error":
                self.status = "finished"
            self.stop_event.set()

        logger.info(f"PcanParser finished with status: {self.status}")
