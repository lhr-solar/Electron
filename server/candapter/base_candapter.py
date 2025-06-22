from abc import ABC, abstractmethod

import can


class BaseCandapter:

    def __init__(self):
        self._connected = False
        self._adapter = None
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

