"""
Parser for a direct UART serial connection that already outputs SLCAN-format
messages (e.g. from a USB device). No CAN adapter initialization — just open
the port at the given baud rate and read lines.
"""
import asyncio
import serial
import logging
from ._parser_abc import _Parser

logger = logging.getLogger(__name__)


class SerialUartParser(_Parser):
    """Reads SLCAN frames from a serial port. No bitrate/init commands."""

    def __init__(
        self,
        port: str,
        serial_baudrate: int,
        queue: asyncio.Queue,
        stop_event: asyncio.Event,
    ):
        super().__init__(queue, stop_event)
        self.source = port
        self.serial_baudrate = serial_baudrate
        self.device = None
        self.connection_state = False

    async def run(self):
        self.status = "running"
        self.error_message = None

        logger.info(
            f"Opening UART serial port {self.source} @ {self.serial_baudrate} bps (no CAN init)..."
        )

        try:
            self.device = await asyncio.to_thread(
                serial.Serial,
                port=self.source,
                baudrate=self.serial_baudrate,
                timeout=None,
            )
            self.connection_state = True
            logger.info("Serial port open. Reading SLCAN frames...")

            while not self.stop_event.is_set():
                raw_line = await asyncio.to_thread(self.device.read_until, b"\r")
                if raw_line:
                    line_str = raw_line.decode("utf-8", errors="ignore").strip()
                    if line_str and (
                        line_str.startswith("t") or line_str.startswith("T")
                    ):
                        await self.queue.put(line_str)
                else:
                    await asyncio.sleep(0.01)

        except serial.SerialException as e:
            logger.error(f"Serial port error: {e}", exc_info=True)
            self.status = "error"
            self.error_message = str(e)
        except asyncio.CancelledError:
            logger.info("Serial UART parser task cancelled.")
            self.status = "finished"
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            self.status = "error"
            self.error_message = str(e)
        finally:
            if self.device and self.device.is_open:
                logger.info("Closing serial port...")
                await asyncio.to_thread(self.device.close)
            self.connection_state = False
            if self.status != "error":
                self.status = "finished"
            self.stop_event.set()

        logger.info(f"SerialUartParser finished with status: {self.status}")
