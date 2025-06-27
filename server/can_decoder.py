import cantools
import glob
import os


class CANDecoder:
    def __init__(self):
        self.db = cantools.database.Database()

    def find_add_dbc_files(self):
        abs_path = os.path.abspath("./Embedded-Sharepoint/can/dbc/*.dbc")
        dbc_list = glob.glob(abs_path)
        for i in dbc_list:
            self.db.add_dbc_file(i)

    def device_data_readable(self, arbitration_id, data) -> {
        "id": hex,
        "msg": str
    }:
        decoded_message = None
        try:
            decoded_message = {
                "id": hex(arbitration_id),
                "msg": self.db.decode_message(arbitration_id, data)
            }
        except Exception as e:
            decoded_message = {
                "id": e,
                "msg": None
            }
        return decoded_message
