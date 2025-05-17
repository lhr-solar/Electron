import cantools
import can
import glob


class CANDecoder:
    def __init__(self):
        self.db = cantools.database.Database()

    def find_add_dbc_files(self):
        dbc_list = glob.glob("./dbc_files/*.dbc")
        for i in dbc_list:
            self.db.add_dbc_file(i)

    def device_data_readable(self, arbitration_id, data) -> str:
        try:
            decoded_message = self.db.decode_message(arbitration_id, data)  # decode message using dbc
        except Exception as e:
            print(e)
            decoded_message = None
        return decoded_message
