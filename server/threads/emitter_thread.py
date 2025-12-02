from flask_socketio import emit
from collections import defaultdict

class EmitterThread:
    def __init__(self, socketio, stop_event, parser_thread, device_manager):
        self.socketio = socketio
        self.stop_event = stop_event
        self.parser_thread = parser_thread
        self.device_manager = device_manager
        self.last_connection_states = {}

    def _get_current_connection_states(self):
        """Builds a dictionary of the current connection states for all devices."""
        states = {name: dev.is_connected for name, dev in self.device_manager.devices.items()}
        states["parser"] = self.parser_thread.connected if self.parser_thread else False
        return states

    def get_full_state_snapshot(self):
        """
        Gathers and returns a complete snapshot of the current application state.
        This method does NOT emit.
        """
        full_data = self.device_manager.get_all_device_data()
        connection_states = self._get_current_connection_states()
        return {
            "full_data_state": full_data,
            "connection_states": connection_states
        }

    def run(self):
        """
        Periodically checks for changes and broadcasts delta updates for both
        CAN data and connection states.
        """
        while not self.stop_event.is_set():
            self.socketio.sleep(0.1)
            
            for device in self.device_manager.devices.values():
                device.check_connection_status()

            changes = self.device_manager.get_and_clear_changes()
            if changes:
                delta_update = defaultdict(dict)
                for device_name, signal_key, value in changes:
                    if isinstance(value, dict) and 'index' in value:
                        if signal_key not in delta_update[device_name]:
                            delta_update[device_name][signal_key] = []
                        delta_update[device_name][signal_key].append({'idx': value['index'], 'value': value['value']})
                    else:
                        delta_update[device_name][signal_key] = value
                
                if delta_update:
                    self.socketio.emit('can_update', dict(delta_update))

            current_connection_states = self._get_current_connection_states()
            connection_delta = {name: status for name, status in current_connection_states.items() if self.last_connection_states.get(name) != status}
            
            if connection_delta:
                self.socketio.emit('connection_state', connection_delta)
                self.last_connection_states.update(connection_delta)
            
        print(f"[{self.__class__.__name__}] Thread finished.")
