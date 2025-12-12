import asyncio
import logging

logger = logging.getLogger(__name__)

class FileParser:
    def __init__(self, file_path: str, queue: asyncio.Queue, stop_event: asyncio.Event):
        self.file_path = file_path
        self.queue = queue
        self.stop_event = stop_event

    async def run(self):
        logger.info(f"Starting async replay from file: {self.file_path}")
        
        try:
            with open(self.file_path, 'r') as f:
                lines = f.readlines()
            
            logger.info(f"Replaying {len(lines)} lines...")

            for line in lines:
                if self.stop_event.is_set():
                    logger.info("Replay stopped by user.")
                    break
                line = line.strip()
                if line:
                    await self.queue.put(line)
                    # Use asyncio.sleep for non-blocking delays
                    await asyncio.sleep(0.001)
            
            if not self.stop_event.is_set():
                logger.info("End of file reached.")

        except FileNotFoundError:
            logger.error(f"Replay file not found at {self.file_path}")
        except asyncio.CancelledError:
            logger.info("File parser task cancelled.")
        except Exception as e:
            logger.error(f"Error during replay: {e}", exc_info=True)
        finally:
            # Signal that this parser is done so the session can clean up
            self.stop_event.set()
        
        logger.info("Async FileParser finished.")
