import can
from server.adapter.base_candapter import BaseCandapter


class XBeeRFAdapter(BaseCandapter):
    def __init__(self, com_port="COM4", bitrate=125000):
        super().__init__()
        self._com_port = com_port
        self._bitrate = bitrate
        self._bus = None
        self.nickname = "XBee"

    def connect(self):
        try:
            # Use the 'slcan' bustype to connect to the serial CAN device
            self._bus = can.interface.Bus(
                bustype='slcan',
                channel=self._com_port,
                bitrate=self._bitrate
            )
            self._connected = True
            print(f"Connected to XBee SLCan device on {self._com_port} at {self._bitrate} baud")
        except Exception as e:
            print(f"Failed to connect to SLCan device: {e}")
            self._connected = False

    def read(self) -> can.Message | None:
        if not self._connected or self._bus is None:
            return None
        try:
            msg = self._bus.recv(timeout=0.1)  # Timeout so it doesn't block indefinitely
            return msg
        except Exception as e:
            if not type(e) == ValueError:
                self._connected = False
                print(f"Error reading CAN message: {e}")
            else:
                print("received non-can message - ignoring")
            return None

    def close(self):
        if self._bus:
            self._bus.shutdown()
            self._bus = None
        self._connected = False
        print("Wireless CAN adapter closed.")
