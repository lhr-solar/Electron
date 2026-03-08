import asyncio
import logging

from server.config import settings
from ._parser_abc import _Parser

logger = logging.getLogger(__name__)

class TCPParser(_Parser):
    def __init__(self, ip: str, port: int, queue: asyncio.Queue, stop_event: asyncio.Event):
        super().__init__(queue, stop_event)
        self.source = (ip, port)
        self.connection_state = False
        # Get connection timeout from config, with a default
        self.connection_timeout = settings.TCP_CONFIG.get("CONNECTION_TIMEOUT", 5.0)

    async def run(self):
        ip, port = self.source
        buffer = ""
        self.status = "running"

        while not self.stop_event.is_set():
            reader, writer = None, None
            try:
                self.error_message = None
                logger.info(f"Connecting to {ip}:{port}...")
                
                # Use asyncio's open_connection with a timeout for the initial connection
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(ip, port),
                    timeout=self.connection_timeout
                )
                logger.info("TCP connection successful!")
                self.connection_state = True

                while not self.stop_event.is_set():
                    # Read without a timeout - this will wait indefinitely for data
                    data = await reader.read(4096)
                    if not data:
                        logger.warning("Server closed connection.")
                        self.connection_state = False
                        break

                    buffer += data.decode('ascii', errors='ignore')

                    while '\r' in buffer:
                        end_index = buffer.index('\r')
                        potential_frame = buffer[:end_index + 1]
                        t_index = potential_frame.rfind('t')
                        T_index = potential_frame.rfind('T')
                        start_index = max(t_index, T_index)

                        if start_index != -1:
                            valid_frame = potential_frame[start_index:].strip()
                            if valid_frame:
                                await self.queue.put(valid_frame)
                        
                        buffer = buffer[end_index + 1:]

            except asyncio.TimeoutError:
                logger.warning(f"Connection timed out after {self.connection_timeout}s. Reconnecting...")
                self.connection_state = False
                self.error_message = "Connection timed out."
                await asyncio.sleep(3)
            except asyncio.CancelledError:
                logger.info("TCP parser task cancelled.")
                self.status = "finished"
                break
            except Exception as e:
                logger.error(f"TCP Connection Error: {e}. Retrying in 5s...", exc_info=True)
                self.connection_state = False
                self.error_message = str(e)
                await asyncio.sleep(5)
            finally:
                if writer:
                    writer.close()
                    await writer.wait_closed()
                self.connection_state = False
        
        self.status = "finished"
        logger.info("Async TCPParser finished.")
