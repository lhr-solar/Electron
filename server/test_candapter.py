import threading

from candapter_reader import CandapterReader
from can_decoder import CANDecoder

if __name__ == '__main__':
    decoder = CANDecoder()
    decoder.find_add_dbc_files()

    candapter_reader = CandapterReader()
    candapter_reader.connect()

    #start reading in a separate thread
    candapter_reader_thread = threading.Thread(target=candapter_reader.start_reading)
    candapter_reader_thread.start()

    try:
        while True:
            message = candapter_reader.read_message()
            if message is not None:
                decoded_message = decoder.device_data_readable(message.arbitration_id, message.data)
                if decoded_message is not None:
                    print(decoded_message)
           # else:
               # print("No new CAN messages.")
    except KeyboardInterrupt:
        print("Stopping CAN message reading.")
        candapter_reader.close()
