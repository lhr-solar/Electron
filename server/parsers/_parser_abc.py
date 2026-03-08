from abc import ABC, abstractmethod
import asyncio


class _Parser(ABC):
    """Abstract base class for all async parsers (not a concrete parser)."""
    def __init__(self, queue: asyncio.Queue, stop_event: asyncio.Event):
        self.queue = queue
        self.stop_event = stop_event

        self.status: str = "idle"
        self.connection_state: bool | None = None
        self.error_message: str | None = None

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
