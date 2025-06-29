import cantools
import os
import glob

db = cantools.database.Database()
abs_path = os.path.abspath("../Embedded-Sharepoint/can/dbc/*.dbc")
dbc_list = glob.glob(abs_path)

for i in dbc_list:
    db.add_dbc_file(i)

x = db.decode_message(0x242, b'\xAA\x84\x54\x41\x00\x00\x00\x00')
print(x)