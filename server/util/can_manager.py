import cantools
import os
from cantools.database.namedsignalvalue import NamedSignalValue
import can
import time
import logging

logger = logging.getLogger(__name__)

class CANManager:
    def __init__(self, dbc_file_path, config=None, influx_writer=None):
        self.id_map = {}  # Maps CAN ID to the primary sender ECU name
        self.ecu_list = []
        self.config = config if config else {}
        self.print_can_info = self.config.get("PRINT_CAN_INFO", False)
        
        self.influx_writer = influx_writer
        self.dbc_name = self.config.get("DBC_FILE", "unknown_dbc")

        self.db = cantools.database.Database()
        self._add_dbc_file(dbc_file_path)
        
        self.array_messages = {}  # {frame_id: index_signal_name}
        self._parse_dbc_for_ecus_and_arrays()

    def _add_dbc_file(self, dbc_file):
        """Adds a DBC file to the internal database."""
        if not os.path.exists(dbc_file):
            logger.error(f"DBC file not found at: {dbc_file}")
            return
        try:
            self.db.add_dbc_file(dbc_file)
            logger.info(f"Successfully loaded DBC file: {dbc_file}")
        except Exception as e:
            logger.error(f"Error loading DBC file {dbc_file}: {e}")

    def decode_message(self, arbitration_id, data):
        """Decodes a CAN message using the internal database."""
        try:
            return self.db.decode_message(arbitration_id, data)
        except Exception:
            return None

    def _parse_dbc_for_ecus_and_arrays(self):
        """Parses the DBC to build an ECU map and find array messages."""
        logger.info("Parsing DBC for ECUs and array messages...")
        all_senders = set()
        for msg in self.db.messages:
            if msg.senders:
                sender = msg.senders[0]
                self.id_map[msg.frame_id] = sender
                all_senders.add(sender)

            index_signal = next((s.name for s in msg.signals if "idx" in s.name.lower() or "index" in s.name.lower()), None)
            if index_signal:
                self.array_messages[msg.frame_id] = index_signal
                logger.info(f"  - Found array message: {msg.name} (ID: {msg.frame_id:X}) with index: {index_signal}")

        self.ecu_list = sorted(list(all_senders))
        logger.info(f"Found {len(self.ecu_list)} ECUs: {self.ecu_list}")

    def process_message(self, raw_message: can.Message, slcan_packet: str):
        """Processes a raw CAN message, decodes it, and writes it to InfluxDB."""
        if raw_message.arbitration_id not in self.id_map:
            return

        decoded_msg = self.decode_message(raw_message.arbitration_id, raw_message.data)
        if decoded_msg:
            if self.print_can_info:
                self._print_message_info(raw_message, decoded_msg, slcan_packet)
            self._write_to_influx(raw_message.arbitration_id, decoded_msg, slcan_packet)

    def _write_to_influx(self, arbitration_id, decoded_msg, slcan_packet):
        """Formats and writes a decoded message to InfluxDB via the writer."""
        if not self.influx_writer:
            return
            
        try:
            message_def = self.db.get_message_by_frame_id(arbitration_id)
            if not message_def:
                return

            sender = self.id_map.get(arbitration_id, "Unknown")
            measurement = f"{arbitration_id:X}"
            timestamp = int(time.time_ns())

            tags = {
                "sender": sender,
                "dbc_name": self.dbc_name,
                "message_name": message_def.name,
            }
            
            fields = {"raw_packet": slcan_packet}

            def convert_value(value):
                if isinstance(value, (int, float)):
                    return float(value)
                return str(value)

            if arbitration_id in self.array_messages:
                index_signal_name = self.array_messages[arbitration_id]
                idx = int(decoded_msg.get(index_signal_name, -1))
                
                if idx != -1:
                    tags["idx"] = str(idx)
                    for sig_name, sig_val in decoded_msg.items():
                        if sig_name != index_signal_name:
                            fields[sig_name] = convert_value(sig_val)
                    
                    if len(fields) > 1:
                        self.influx_writer.write_data(measurement, tags, fields, timestamp)
            else:
                for k, v in decoded_msg.items():
                    fields[k] = convert_value(v)
                
                if len(fields) > 1:
                    self.influx_writer.write_data(measurement, tags, fields, timestamp)
        except Exception as e:
            logger.error(f"Error writing to InfluxDB: {e}")

    def _print_message_info(self, raw_message, decoded_msg, slcan_packet):
        """Prints formatted information about a CAN message."""
        sender = self.id_map.get(raw_message.arbitration_id, "Unknown")
        printable_data = {k: str(v) for k, v in decoded_msg.items()}
        # This uses a separate logger to allow for easy filtering of high-volume messages
        logging.getLogger("CAN_FRAMES").info(f"ID: {raw_message.arbitration_id:X} | Sender: {sender} | Packet: {slcan_packet} | Data: {printable_data}")
