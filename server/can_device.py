class CANDevice:
    send_ids = []

    def __init__(self, send_ids):
        self.send_ids = send_ids
        self.device = None

    def send_message(self, message):
        # Code to send a message over the CAN bus
        pass

    def receive_message(self):
        # Code to receive a message from the CAN bus
        pass

    def close(self):
        # Code to close the CAN device connection
        pass