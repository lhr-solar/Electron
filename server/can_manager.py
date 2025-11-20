import can

from server.can_decoder import CANDecoder
from server.can_device import CANDevice
import server.dbc_structure as dbc

class DeviceManager:
    def __init__(self, can_decoder: CANDecoder, config=None):
        self.devices = {}
        self.id_map = {}
        self.can_decoder = can_decoder
        self.config = config if config else {}
        self.print_can_info = self.config.get("PRINT_CAN_INFO", False)
        
        self._init_devices_from_dbc()
        self._apply_custom_logic()

    def _init_devices_from_dbc(self):
        """Dynamically create devices and their data structures from the DBC."""
        for ecu_name in dir(dbc):
            ecu_class = getattr(dbc, ecu_name)
            if not isinstance(ecu_class, type) or not hasattr(ecu_class, 'SEND_IDS'):
                continue

            default_data = {}
            for msg_name in dir(ecu_class):
                msg_class = getattr(ecu_class, msg_name)
                if isinstance(msg_class, type) and hasattr(msg_class, 'Signals'):
                    for sig_name in dir(msg_class.Signals):
                        if not sig_name.startswith('__'):
                            original_sig_name = getattr(msg_class.Signals, sig_name)
                            default_data[original_sig_name] = 0

            self._create_device(ecu_name, ecu_class.SEND_IDS, default_data)

    def _apply_custom_logic(self):
        """Apply device-specific logic after dynamic initialization."""
        battery = self.get_device("BPS_Leader")
        if battery:
            battery.master_data["Voltage_Array"] = [0] * 32
            battery.master_data["Temperature_Array"] = [0] * 32
            
            def process_battery(msg):
                if "Voltage_idx" in msg:
                    idx = int(msg["Voltage_idx"])
                    if 0 <= idx < 32:
                        battery.master_data["Voltage_Array"][idx] = msg.get("Voltage_Value", 0)
                if "Temperature_idx" in msg:
                    idx = int(msg["Temperature_idx"])
                    if 0 <= idx < 32:
                        battery.master_data["Temperature_Array"][idx] = msg.get("Temperature_Value", 0)
            battery.custom_message_processor = process_battery

    def _create_device(self, name, send_ids, default_data=None, timeout=1):
        device = CANDevice(name, send_ids, default_data, timeout)
        self.devices[name] = device
        for sid in send_ids:
            if sid in self.id_map:
                print(f"Warning: Duplicate send ID {sid} for device {name}")
            self.id_map[sid] = name
        return device

    def get_device(self, name):
        return self.devices.get(name)

    def process_message(self, raw_message: can.Message, slcan_packet: str):
        device_name = self.id_map.get(raw_message.arbitration_id)
        if not device_name:
            return

        device = self.get_device(device_name)
        if not device:
            return

        decoded_msg = self.can_decoder.decode_message(raw_message.arbitration_id, raw_message.data)
        if decoded_msg:
            device.received_message()
            
            if self.print_can_info:
                self._print_message_info(raw_message, decoded_msg, slcan_packet)

            for key, value in decoded_msg.items():
                if key in device.master_data:
                    if isinstance(device.master_data[key], bool):
                        device.master_data[key] = bool(value)
                    else:
                        device.master_data[key] = value
            
            if device.custom_message_processor:
                device.custom_message_processor(decoded_msg)

    def _print_message_info(self, raw_message, decoded_msg, slcan_packet):
        """Prints detailed information about a CAN message."""
        try:
            message_def = self.can_decoder.db.get_message_by_frame_id(raw_message.arbitration_id)
            sender = message_def.senders[0] if message_def.senders else "Unknown"
            
            print("-" * 50)
            print(f"SENDER: {sender:<15} | MSG: {message_def.name:<25} | ID: 0x{raw_message.arbitration_id:X}")
            print(f"SLCAN: {slcan_packet}")
            for sig, val in decoded_msg.items():
                try:
                    unit = message_def.get_signal_by_name(sig).unit
                    unit_str = f" {unit}" if unit else ""
                except:
                    unit_str = ""
                print(f"  {sig:25}: {val}{unit_str}")
        except Exception as e:
            print(f"Error printing message info: {e}")
