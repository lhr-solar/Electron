import can
import threading
import queue
import time
from pyCandapter import pyCandapter


class CandapterReader:
    def __init__(self, com_port = "COM4", serial_baudrate=9600, can_baudrate=125000):
        self.candapter_connected = False
        self.com_port = com_port
        self.serial_baudrate = serial_baudrate
        self.can_baudrate = can_baudrate
        self.adapter = None

    def connect(self):
        print(f"Connecting to CAN adapter on {self.com_port} at {self.serial_baudrate} baud...")
        self.adapter = pyCandapter(self.com_port, self.serial_baudrate)
        if self.adapter.openCANBus(self.can_baudrate):
            print(f"CAN bus opened at {self.can_baudrate} bps.")
            self.candapter_connected = True

    def read(self):
        if not self.candapter_connected:
            return None

        try:
            message: can.Message = self.adapter.readCANMessage()
            if message is None:
                return None
            return message
        except Exception as e:
            print(f"Error reading CAN message: {e}")
            self.candapter_connected = False
            return None

    def close(self):
        self.candapter_connected = False
        if self.adapter is not None:
            self.adapter.closeCANBus()
            self.adapter.closeDevice()
            print("CAN adapter closed.")
