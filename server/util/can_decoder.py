import cantools
import os

class CANDecoder:
    def __init__(self):
        self.db = cantools.database.Database()

    def add_dbc_file(self, dbc_file):
        """
        Adds a DBC file to the database.
        """
        if not os.path.exists(dbc_file):
            print(f"[CANDecoder] DBC file not found at: {dbc_file}")
            return
        try:
            self.db.add_dbc_file(dbc_file)
            print(f"[CANDecoder] Successfully loaded DBC file: {dbc_file}")
        except Exception as e:
            print(f"[CANDecoder] Error loading DBC file {dbc_file}: {e}")

    def decode_message(self, arbitration_id, data):
        """
        Decodes a CAN message and returns the decoded data.
        Returns None if it cannot be decoded.
        """
        try:
            return self.db.decode_message(arbitration_id, data)
        except Exception:
            return None
