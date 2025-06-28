import can

from server.candapter.base_candapter import BaseCandapter
from server.candapter.pyCandapter import pyCandapter


class EwertCandapter(BaseCandapter):
    def __init__(self, com_port="COM4", serial_baudrate=9600, can_baudrate=125000):
        super().__init__()
        self._com_port = com_port
        self._serial_baudrate = serial_baudrate
        self._can_baudrate = can_baudrate
        self._adapter = None
        self.nickname = "CANdapter"

    def connect(self):
        try:
            print(f"Connecting to Ewert CAN adapter on {self._com_port} at {self._serial_baudrate} baud...")
            self._adapter = pyCandapter(self._com_port, self._serial_baudrate)
            if self._adapter.openCANBus(self._can_baudrate):
                print(f"Ewert CAN bus opened at {self._can_baudrate} bps.")
                self._connected = True
        except:
            self._connected = False
            print("Could not find device")

    def read(self) -> can.Message | None:
        if not self._connected:
            return None

        try:
            message: can.Message = self._adapter.readCANMessage()
            # print(hex(message.arbitration_id))
            if message is None:
                return None
            return message
        except Exception as e:
            print(f"Error reading CAN message: {e}")
            self._connected = False
            return None

    def close(self):
        self._connected = False
        if self._adapter is not None:
            self._adapter.closeCANBus()
            self._adapter.closeDevice()
            print("Ewert CAN adapter closed.")
