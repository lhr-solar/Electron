import time

class CANDevice:
    """
    Represents a single device on the CAN bus, tracking its state and data.
    Timeout is now managed externally.
    """
    def __init__(self, name, send_ids=None, default_data=None, timeout=1):
        if send_ids is None: send_ids = []
        
        self.name = name
        self.send_ids = send_ids
        self.timeout = timeout
        self.is_connected = False
        self.default_data = default_data if default_data else {}
        self.master_data = self.default_data.copy()
        
        self.custom_message_processor = None
        self.reset_function = None
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
