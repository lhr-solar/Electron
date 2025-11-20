import threading

class EmitterThread(threading.Thread):
    def __init__(self, socketio, stop_event, parser_thread, device_manager):
        super().__init__()
        self.socketio = socketio
        self.stop_event = stop_event
        self.parser_thread = parser_thread
        self.device_manager = device_manager

    def run(self):
        """Periodically emits device data and connection states to clients."""
        while not self.stop_event.is_set():
            self.socketio.sleep(0.1)
            
            all_device_data = {name: dev.master_data for name, dev in self.device_manager.devices.items()}
            self.socketio.emit('can_update', all_device_data)

            connection_states = {name: dev.is_connected for name, dev in self.device_manager.devices.items()}
            connection_states["CANDAPTER"] = self.parser_thread.connected if self.parser_thread else False
            self.socketio.emit('connection_state', connection_states)
            
        print(f"[{self.__class__.__name__}] Thread finished.")
