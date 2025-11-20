import threading
from abc import ABC, abstractmethod

class Parser(ABC, threading.Thread):
    def __init__(self, packet_queue, stop_event):
        super().__init__()
        self.packet_queue = packet_queue
        self.stop_event = stop_event
        self.connected = False

    @abstractmethod
    def run(self):
        pass
