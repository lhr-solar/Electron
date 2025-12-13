from abc import ABC, abstractmethod
import asyncio

class Parser(ABC):
    """Abstract base class for all async parsers."""
    def __init__(self, queue: asyncio.Queue, stop_event: asyncio.Event):
        self.queue = queue
        self.stop_event = stop_event
        
        # --- New Status Indicators ---
        # Overall status of the parser task
        self.status: str = "idle" 
        # Connection status of the underlying device/socket (can be None if not applicable)
        self.connection_state: bool | None = None
        # Holds the latest error message
        self.error_message: str | None = None
        # -----------------------------

    @abstractmethod
    async def run(self):
        """The main async method to run the parser."""
        pass

    def get_status(self):
        """Returns a dictionary of the current status."""
        return {
            "status": self.status,
            "connection_state": self.connection_state,
            "error_message": self.error_message,
        }
