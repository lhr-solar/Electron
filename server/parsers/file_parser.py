import asyncio
import logging
from ._parser_abc import _Parser

logger = logging.getLogger(__name__)

class FileParser(_Parser):
    def __init__(self, file_path: str, queue: asyncio.Queue, stop_event: asyncio.Event):
        super().__init__(queue, stop_event)
        self.file_path = file_path
        # Connection state is not applicable for file parsing
        self.connection_state = None

    async def run(self):
        logger.info(f"Starting async replay from file: {self.file_path}")
        self.status = "running"
        self.error_message = None
        completed_normally = False
        
        try:
            with open(self.file_path, 'r') as f:
                lines = f.readlines()
            
            logger.info(f"Replaying {len(lines)} lines...")

            for line in lines:
                if self.stop_event.is_set():
                    logger.info("Replay stopped by user.")
                    self.status = "finished"
                    break
                line = line.strip()
                if line:
                    await self.queue.put(line)
                    await asyncio.sleep(0.001)
            
            if not self.stop_event.is_set():
                logger.info("End of file reached.")
                self.status = "finished"
                completed_normally = True

        except FileNotFoundError:
            logger.error(f"Replay file not found at {self.file_path}")
            self.status = "error"
            self.error_message = f"File not found: {self.file_path}"
        except asyncio.CancelledError:
            logger.info("File parser task cancelled.")
            self.status = "finished"
        except Exception as e:
            logger.error(f"Error during replay: {e}", exc_info=True)
            self.status = "error"
            self.error_message = str(e)
        finally:
            if not completed_normally:
                self.stop_event.set()
        
        logger.info(f"Async FileParser finished with status: {self.status}")
