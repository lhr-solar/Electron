import time

class CANDevice:
    """
    Represents a single device on the CAN bus, tracking its state and data.
    """
    def __init__(self, name, send_ids=None, initial_data=None, timeout=1):
        if send_ids is None: send_ids = []
        
        self.name = name
        self.send_ids = send_ids
        self.timeout = timeout
        self.is_connected = False
        self.data = initial_data if initial_data else {}
        self.last_message_time = 0

    def received_message(self):
        """
        Called when a message for this device is received. Marks the device as
        connected and updates its message timestamp.
        """
        if not self.is_connected:
            self.is_connected = True
        self.last_message_time = time.time()

    def check_connection_status(self):
        """
        Checks if the device has timed out based on its last message time.
        """
        if self.is_connected and (time.time() - self.last_message_time > self.timeout):
            self.is_connected = False
