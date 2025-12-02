from cantools.database.namedsignalvalue import NamedSignalValue
from server.can_decoder import CANDecoder
from server.can_device import CANDevice
import queue
import can

class DeviceManager:
    def __init__(self, can_decoder: CANDecoder, dbc_module, config=None):
        self.devices = {}
        self.id_map = {}
        self.ecu_list = []
        self.can_decoder = can_decoder
        self.dbc_module = dbc_module # The dynamically imported DBC module
        self.config = config if config else {}
        self.print_can_info = self.config.get("PRINT_CAN_INFO", False)
        self.changes_queue = queue.Queue()
        
        self._init_devices_from_dbc_module()

    def _init_devices_from_dbc_module(self):
        """
        Initializes devices using the dynamically loaded DBC module.
        """
        for ecu_name in dir(self.dbc_module):
            if ecu_name.startswith('__'): continue
            
            ecu_class = getattr(self.dbc_module, ecu_name)
            if not (isinstance(ecu_class, type) and hasattr(ecu_class, 'SEND_IDS')):
                continue
            
            self.ecu_list.append(ecu_name)
            default_data = {}
            
            for attr_name in dir(ecu_class):
                attr = getattr(ecu_class, attr_name)
                if isinstance(attr, type) and hasattr(attr, 'ID'):
                    if getattr(attr, 'IS_ARRAY_MESSAGE', False):
                        for key in getattr(attr, 'DATA_SIGNAL_KEYS', []):
                            default_data[key] = []
                    else:
                        # This assumes non-array messages have signals defined elsewhere
                        # in the DBC, which is handled by the decoder. We just need keys.
                        msg_from_db = self.can_decoder.db.get_message_by_frame_id(attr.ID)
                        for sig in msg_from_db.signals:
                            default_data[sig.name] = 0

            self._create_device(ecu_name, ecu_class.SEND_IDS, default_data)
        
        self.ecu_list.sort()

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

    def get_all_device_data(self):
        return {name: dev.master_data for name, dev in self.devices.items()}

    def get_and_clear_changes(self):
        changes = []
        while not self.changes_queue.empty():
            try:
                changes.append(self.changes_queue.get_nowait())
            except queue.Empty:
                break
        return changes

    def process_message(self, raw_message: can.Message, slcan_packet: str):
        device_name = self.id_map.get(raw_message.arbitration_id)
        if not device_name: return

        device = self.get_device(device_name)
        if not device: return

        decoded_msg = self.can_decoder.decode_message(raw_message.arbitration_id, raw_message.data)
        if decoded_msg:
            serializable_decoded = {
                k: str(v) if isinstance(v, NamedSignalValue) else v
                for k, v in decoded_msg.items()
            }

            device.received_message()
            
            if self.print_can_info:
                self._print_message_info(raw_message, serializable_decoded, slcan_packet)
            
            self._update_device_data(device, serializable_decoded)

    def _update_device_data(self, device, decoded_msg):
        for key, value in decoded_msg.items():
            if key not in device.master_data: continue

            if isinstance(device.master_data[key], list):
                idx_val = None
                for sig_name in decoded_msg:
                    if "idx" in sig_name.lower() or "index" in sig_name.lower():
                        idx_val = int(decoded_msg[sig_name])
                        break
                
                if idx_val is not None:
                    while len(device.master_data[key]) <= idx_val:
                        device.master_data[key].append(None)
                    
                    if device.master_data[key][idx_val] != value:
                        device.master_data[key][idx_val] = value
                        change = {'index': idx_val, 'value': value}
                        self.changes_queue.put((device.name, key, change))
            
            elif device.master_data[key] != value:
                device.master_data[key] = value
                self.changes_queue.put((device.name, key, value))

    def _print_message_info(self, raw_message, decoded_msg, slcan_packet):
        try:
            message_def = self.can_decoder.db.get_message_by_frame_id(raw_message.arbitration_id)
            sender = message_def.senders[0] if message_def.senders else "Unknown"
            
            print(f"SENDER: {sender} | MSG: {message_def.name} | ID: 0x{raw_message.arbitration_id:X}")
            for sig, val in decoded_msg.items():
                unit = message_def.get_signal_by_name(sig).unit
                print(f"  {sig}: {val} {unit if unit else ''}")
        except Exception:
            pass
