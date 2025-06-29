from abc import ABC, abstractmethod

import can


class BaseAdapter(ABC):

    def __init__(self):
        self._connected = False
        self.nickname = "Unknown"

    @abstractmethod
    def connect(self):
        pass

    @abstractmethod
    def read(self) -> can.Message:
        pass

    @abstractmethod
    def close(self):
        pass

    def is_connected(self) -> bool:
        return self._connected

    def set_connected(self, connected):
        self._connected = connected
