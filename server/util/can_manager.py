import cantools
import os
from cantools.database.namedsignalvalue import NamedSignalValue
import can
import time
import queue

class CANManager:
    def __init__(self, dbc_file_path, config=None, influx_queue=None):
        self.id_map = {}  # Maps CAN ID to the primary sender ECU name
        self.ecu_list = []
        self.config = config if config else {}
        self.print_can_info = self.config.get("PRINT_CAN_INFO", False)
        
        self.influx_queue = influx_queue
        self.dbc_name = self.config.get("DBC_FILE", "unknown_dbc")

        self.db = cantools.database.Database()
        self._add_dbc_file(dbc_file_path)
        
        self.array_messages = {}  # {frame_id: index_signal_name}
        self._parse_dbc_for_ecus_and_arrays()

    def _add_dbc_file(self, dbc_file):
        """Adds a DBC file to the internal database."""
        if not os.path.exists(dbc_file):
            print(f"[{self.__class__.__name__}] DBC file not found at: {dbc_file}")
            return
        try:
            self.db.add_dbc_file(dbc_file)
            print(f"[{self.__class__.__name__}] Successfully loaded DBC file: {dbc_file}")
        except Exception as e:
            print(f"[{self.__class__.__name__}] Error loading DBC file {dbc_file}: {e}")

    def decode_message(self, arbitration_id, data):
        """Decodes a CAN message using the internal database."""
        try:
            return self.db.decode_message(arbitration_id, data)
        except Exception:
            return None

    def _parse_dbc_for_ecus_and_arrays(self):
        """Parses the DBC to build an ECU map and find array messages."""
        print("Parsing DBC for ECUs and array messages...")
        all_senders = set()
        for msg in self.db.messages:
            if msg.senders:
                sender = msg.senders[0]
                self.id_map[msg.frame_id] = sender
                all_senders.add(sender)

            index_signal = next((s.name for s in msg.signals if "idx" in s.name.lower() or "index" in s.name.lower()), None)
            if index_signal:
                self.array_messages[msg.frame_id] = index_signal
                print(f"  - Found array message: {msg.name} (ID: {msg.frame_id}) with index: {index_signal}")

        self.ecu_list = sorted(list(all_senders))
        print(f"Found {len(self.ecu_list)} ECUs: {self.ecu_list}")

    def process_message(self, raw_message: can.Message, slcan_packet: str):
        """Processes a raw CAN message, decodes it, and queues it for InfluxDB."""
        if raw_message.arbitration_id not in self.id_map:
            return

        decoded_msg = self.decode_message(raw_message.arbitration_id, raw_message.data)
        if decoded_msg:
            serializable_decoded = {k: str(v) if isinstance(v, NamedSignalValue) else v for k, v in decoded_msg.items()}
            if self.print_can_info:
                self._print_message_info(raw_message, serializable_decoded)
            self._queue_for_influx(raw_message.arbitration_id, serializable_decoded)

    def _queue_for_influx(self, arbitration_id, decoded_msg):
        """Queues a decoded message for writing to InfluxDB."""
        if not self.influx_queue:
            return
            
        try:
            sender = self.id_map.get(arbitration_id, "Unknown")
            measurement = str(arbitration_id)
            timestamp = int(time.time_ns())

            if arbitration_id in self.array_messages:
                index_signal_name = self.array_messages[arbitration_id]
                idx = int(decoded_msg.get(index_signal_name, -1))
                
                if idx != -1:
                    tags = {"sender": sender, "dbc_name": self.dbc_name, "idx": str(idx)}
                    fields = {sig_name: float(sig_val) if isinstance(sig_val, (int, float)) else sig_val 
                              for sig_name, sig_val in decoded_msg.items() if sig_name != index_signal_name}
                    if fields:
                        self.influx_queue.put((measurement, tags, fields, timestamp))
            else:
                tags = {"sender": sender, "dbc_name": self.dbc_name}
                fields = {k: float(v) if isinstance(v, (int, float)) else v for k, v in decoded_msg.items()}
                if fields:
                    self.influx_queue.put((measurement, tags, fields, timestamp))
        except Exception as e:
            print(f"[{self.__class__.__name__}] Error queueing for InfluxDB: {e}")

    def _print_message_info(self, raw_message, decoded_msg):
        """Prints formatted information about a CAN message."""
        sender = self.id_map.get(raw_message.arbitration_id, "Unknown")
        print(f"CAN ID: {raw_message.arbitration_id} | Sender: {sender} | Data: {decoded_msg}")
