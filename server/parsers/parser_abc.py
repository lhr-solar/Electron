from abc import ABC, abstractmethod
import queue
import threading

class Parser(ABC):
    def __init__(self):
        self.queue = queue.Queue()
        self.stop_event = threading.Event()
        self.connected = False

    @abstractmethod
    def run(self):
        pass
