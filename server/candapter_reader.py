import can

from pyCandapter import pyCandapter


class CandapterReader:
    def __init__(self, com_port = "COM4", serial_baudrate=9600, can_baudrate=125000):
        self.com_port = com_port
        self.serial_baudrate = serial_baudrate
        self.can_baudrate = can_baudrate
        self.adapter = None
        self.message_queue = []

    def connect(self):
        print(f"Connecting to CAN adapter on {self.com_port} at {self.serial_baudrate} baud...")
        self.adapter = pyCandapter(self.com_port, self.serial_baudrate)
        if self.adapter.openCANBus(self.can_baudrate):
            print(f"CAN bus opened at {self.can_baudrate} bps.")
            self.candapter_connected = True

    def start_reading(self):
        try:
            while self.candapter_connected:
                message: can.Message = self.adapter.readCANMessage()
                if message is not None:
                    self.message_queue.append(message)
                else:
                    print("No CAN message received.")

        except KeyboardInterrupt:
            print("1Stopping CAN message reading.")
        finally:
            self.close()

    def read_from_queue(self):
        if len(self.message_queue) > 0:
            return self.message_queue.pop(0)
        else:
            return None

    def close(self):
        if self.adapter is not None:
            self.adapter.closeCANBus()
            self.adapter.closeDevice()
            print("CAN adapter closed.")
