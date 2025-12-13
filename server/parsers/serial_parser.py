import asyncio
import serial
import logging
from .parser_abc import Parser

logger = logging.getLogger(__name__)

class SerialParser(Parser):
    def __init__(self, port: str, serial_baudrate: int, can_bitrate: int, queue: asyncio.Queue, stop_event: asyncio.Event):
        super().__init__(queue, stop_event)
        self.source = port
        self.serial_baudrate = serial_baudrate
        self.can_bitrate = can_bitrate
        self.device = None
        self.connection_state = False

    async def _send_command(self, command: str, timeout: float = 0.5) -> bool:
        if not self.device: return False
        try:
            await asyncio.to_thread(self.device.write, f'{command}\n'.encode())
            start_time = asyncio.get_event_loop().time()
            while asyncio.get_event_loop().time() - start_time < timeout:
                if await asyncio.to_thread(lambda: self.device.in_waiting):
                    response = await asyncio.to_thread(self.device.read, 1)
                    if response == b'\x06':
                        return True
                    else:
                        logger.warning(f"Received unexpected response: {response}")
                        return False
                await asyncio.sleep(0.01)
            logger.error(f"Timeout waiting for ACK on command '{command}'")
            return False
        except Exception as e:
            logger.error(f"Error sending command '{command}': {e}", exc_info=True)
            return False

    async def run(self):
        self.status = "running"
        self.error_message = None
        
        can_bitrate_codes = {
            10000: 'S0', 20000: 'S1', 50000: 'S2', 100000: 'S3',
            125000: 'S4', 250000: 'S5', 500000: 'S6', 800000: 'S7', 1000000: 'S8'
        }

        logger.info(f"Opening serial port {self.source} @ {self.serial_baudrate} bps...")
        
        try:
            # Set timeout=None to make read_until a blocking call that waits forever
            self.device = await asyncio.to_thread(
                serial.Serial, port=self.source, baudrate=self.serial_baudrate, timeout=None
            )
            self.connection_state = True
            
            can_speed_cmd = can_bitrate_codes.get(self.can_bitrate)
            if not can_speed_cmd: raise ValueError(f"Invalid CAN bitrate: {self.can_bitrate}")

            logger.info(f"Setting CAN bus bitrate to {self.can_bitrate} bps...")
            if not await self._send_command(can_speed_cmd):
                raise ConnectionError("Failed to set CAN bitrate. Adapter did not ACK.")

            logger.info("Opening CAN channel...")
            if not await self._send_command('O'):
                raise ConnectionError("Failed to open CAN channel. Adapter did not ACK.")

            logger.info("Serial device configured. Listening for CAN frames...")
            self.error_message = None

            while not self.stop_event.is_set():
                # This is now a blocking call (in a separate thread), waiting for data
                raw_line = await asyncio.to_thread(self.device.read_until, b'\r')
                if raw_line:
                    line_str = raw_line.decode('utf-8', errors='ignore').strip()
                    if line_str and (line_str.startswith('t') or line_str.startswith('T')):
                        await self.queue.put(line_str)
                else:
                    # This part should not be reached if timeout is None, but is safe to keep
                    await asyncio.sleep(0.01)

        except (ValueError, ConnectionError, serial.SerialException) as e:
            logger.error(f"Failed to configure serial port: {e}", exc_info=True)
            self.status = "error"
            self.error_message = str(e)
        except asyncio.CancelledError:
            logger.info("Serial parser task cancelled.")
            self.status = "finished"
        except Exception as e:
            logger.error(f"An unexpected error occurred: {e}", exc_info=True)
            self.status = "error"
            self.error_message = str(e)
        finally:
            if self.device and self.device.is_open:
                logger.info("Closing CAN channel and serial port...")
                await self._send_command('C')
                await asyncio.to_thread(self.device.close)
            self.connection_state = False
            if self.status != "error": self.status = "finished"
            self.stop_event.set()
        
        logger.info(f"Async SerialParser finished with status: {self.status}")
