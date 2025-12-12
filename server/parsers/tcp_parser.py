import asyncio
import logging

logger = logging.getLogger(__name__)

class TCPParser:
    def __init__(self, ip: str, port: int, queue: asyncio.Queue, stop_event: asyncio.Event):
        self.source = (ip, port)
        self.queue = queue
        self.stop_event = stop_event

    async def run(self):
        ip, port = self.source
        buffer = ""

        while not self.stop_event.is_set():
            reader, writer = None, None
            try:
                logger.info(f"Connecting to {ip}:{port}...")
                # Use asyncio's open_connection for non-blocking connect
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(ip, port),
                    timeout=5.0
                )
                logger.info("TCP connection successful!")

                while not self.stop_event.is_set():
                    # Use asyncio's read for non-blocking read
                    data = await asyncio.wait_for(reader.read(4096), timeout=5.0)
                    if not data:
                        logger.warning("Server closed connection.")
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
                # This can happen during connection or read, which is fine.
                # The outer loop will handle reconnection.
                logger.warning("Connection or read timeout. Reconnecting...")
            except asyncio.CancelledError:
                logger.info("TCP parser task cancelled.")
                break
            except Exception as e:
                logger.error(f"TCP Connection Error: {e}. Retrying in 5s...", exc_info=True)
                await asyncio.sleep(5)
            finally:
                if writer:
                    writer.close()
                    await writer.wait_closed()
        
        logger.info("Async TCPParser finished.")
