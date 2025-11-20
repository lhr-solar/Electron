import asyncio
import threading

class CANDevice:
    """
    Represents a single device on the CAN bus, tracking its state and data.
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

        self._timer_event = asyncio.Event()
        self._timer_thread = threading.Thread(target=self._run_async_timer, daemon=True)
        self._timer_thread.start()

    def _run_async_timer(self):
        """Runs the asyncio event loop for the timer in a separate thread."""
        asyncio.run(self.async_timer())

    async def async_timer(self):
        """Waits for a message event, timing out if none is received."""
        while True:
            try:
                await asyncio.wait_for(self._timer_event.wait(), timeout=self.timeout)
                self._timer_event.clear()
            except asyncio.TimeoutError:
                self.is_connected = False

    def received_message(self):
        """
        Called when a message for this device is received. Marks the device as
        connected and resets its timeout timer.
        """
        if not self.is_connected:
            self.is_connected = True
            if self.reset_function:
                self.reset_function()
        self._timer_event.set()

    def reset(self):
        """Executes the custom reset logic for the device, if defined."""
        if self.reset_function:
            self.reset_function()
