import cantools
import os
import can
import time
import logging

logger = logging.getLogger(__name__)


class CANManager:
    """Loads one or more DBC files, decodes CAN messages, and writes to Influx. Errors are collected and reported instead of raising."""

    def __init__(self, dbc_file_paths, config=None, influx_writer=None):
        self.id_map = {}  # frame_id -> sender (ECU name)
        self.frame_id_to_network = {}  # frame_id -> DBC filename (network name) for tags
        self.ecu_list = []
        self.config = config if config else {}
        self.print_can_info = self.config.get("PRINT_CAN_INFO", False)
        self.influx_writer = influx_writer
        self.vehicle_name = self.config.get("DBC_VEHICLE", "unknown")
        self.load_errors = []

        self.db = cantools.database.Database()
        paths = [dbc_file_paths] if not isinstance(dbc_file_paths, (list, tuple)) else dbc_file_paths
        for path in paths:
            self._add_dbc_file(path)

        self.array_messages = {}  # frame_id -> index signal name (for array messages)
        self._parse_dbc_for_ecus_and_arrays()

    def _add_dbc_file(self, dbc_file):
        if not dbc_file or not os.path.exists(dbc_file):
            self.load_errors.append(f"DBC file not found: {dbc_file}")
            logger.error(f"DBC file not found at: {dbc_file}")
            return
        try:
            assigned_before = set(self.frame_id_to_network.keys())
            self.db.add_dbc_file(dbc_file)
            network_name = os.path.basename(dbc_file)
            if network_name.lower().endswith(".dbc"):
                network_name = network_name[:-4]
            for msg in self.db.messages:
                if msg.frame_id not in assigned_before:
                    self.frame_id_to_network[msg.frame_id] = network_name
                    assigned_before.add(msg.frame_id)
            logger.info(f"Loaded DBC: {dbc_file}")
        except Exception as e:
            msg = f"{dbc_file}: {e!s}"
            self.load_errors.append(msg)
            logger.exception(f"Error loading DBC file {dbc_file}")

    def get_errors(self):
        """Return list of DBC load/parse error messages for UI."""
        return list(self.load_errors)

    def _parse_dbc_for_ecus_and_arrays(self):
        """Build id_map (frame_id -> sender), array_messages (frame_id -> index signal name), and ecu_list."""
        try:
            for msg in self.db.messages:
                if msg.senders:
                    self.id_map[msg.frame_id] = msg.senders[0]
                index_signal = next(
                    (s.name for s in msg.signals if "idx" in s.name.lower() or "index" in s.name.lower()),
                    None,
                )
                if index_signal:
                    self.array_messages[msg.frame_id] = index_signal
            self.ecu_list = sorted(set(self.id_map.values()))
        except Exception as e:
            self.load_errors.append(f"Parse ECUs/arrays: {e!s}")
            logger.exception("Error parsing DBC for ECUs/arrays")

    def decode_message(self, arbitration_id, data):
        try:
            return self.db.decode_message(arbitration_id, data)
        except Exception as e:
            logger.debug("Decode failed for id %s: %s", hex(arbitration_id), e)
            return None

    def process_message(self, raw_message: can.Message, slcan_packet: str):
        try:
            if raw_message.arbitration_id not in self.id_map:
                return
            decoded_msg = self.decode_message(raw_message.arbitration_id, raw_message.data)
            if not decoded_msg:
                return
            if self.print_can_info:
                self._print_message_info(raw_message, decoded_msg, slcan_packet)
            self._write_to_influx(raw_message.arbitration_id, decoded_msg, slcan_packet)
        except Exception as e:
            logger.exception("process_message error: %s", e)

    def _write_to_influx(self, arbitration_id, decoded_msg, slcan_packet):
        """Write one point to Influx with consistent structure: measurement=CAN ID, tags=vehicle, network, sender, message_name [, idx], fields=raw_packet + decoded signals."""
        if not self.influx_writer:
            return
        try:
            message_def = self.db.get_message_by_frame_id(arbitration_id)
            if not message_def:
                return

            measurement = f"{arbitration_id:X}"
            timestamp = int(time.time_ns())
            sender = self.id_map.get(arbitration_id, "Unknown")
            network = self.frame_id_to_network.get(arbitration_id, "unknown")

            tags = {
                "vehicle": self.vehicle_name,
                "network": network,
                "sender": sender,
                "message_name": message_def.name,
                "dbc_name": self.vehicle_name,  # backward compat for existing dashboards
            }

            # Array messages: message has an index signal (e.g. cell index). When idx is valid we add it as a tag
            # and omit the index signal from fields so each row is one logical element; when idx is invalid we
            # write all signals and no idx tag.
            index_signal_name = self.array_messages.get(arbitration_id)
            exclude_index_from_fields = False
            if index_signal_name is not None:
                idx = decoded_msg.get(index_signal_name, -1)
                try:
                    idx = int(idx)
                except (TypeError, ValueError):
                    idx = -1
                if idx != -1:
                    tags["idx"] = str(idx)
                    exclude_index_from_fields = True

            fields = {"raw_packet": slcan_packet}

            def convert_value(value):
                if isinstance(value, (int, float)):
                    return float(value)
                return str(value)

            for sig_name, sig_val in decoded_msg.items():
                if exclude_index_from_fields and sig_name == index_signal_name:
                    continue
                fields[sig_name] = convert_value(sig_val)

            if len(fields) > 1:
                self.influx_writer.write_data(measurement, tags, fields, timestamp)
        except Exception as e:
            logger.error("Influx write error: %s", e)

    def _print_message_info(self, raw_message, decoded_msg, slcan_packet):
        sender = self.id_map.get(raw_message.arbitration_id, "Unknown")
        printable_data = {k: str(v) for k, v in decoded_msg.items()}
        logging.getLogger("CAN_FRAMES").info(
            f"ID: {raw_message.arbitration_id:X} | Sender: {sender} | Packet: {slcan_packet} | Data: {printable_data}"
        )
