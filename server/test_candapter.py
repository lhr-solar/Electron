import threading

from server.adapter.ewert_candapter import EwertCandapter
from can_decoder import CANDecoder
from can_device import CANDevice

if __name__ == '__main__':
    BPS = CANDevice("BPS", [0x002, 0x101, 0x102, 0x103, 0x104, 0x105, 0x106, 0x107, 0x108, 0x109, 0x10A, 0x10B, 0x10C, 0x10D, 0x10E, 0x10F, 0x110, 0x209, 0x219])
    MPPT_A = CANDevice("MPPT_A", [0x200, 0x201])
    MPPT_B = CANDevice("MPPT_B", [0x210, 0x211])
    MOTOR_CONTROLLER = CANDevice("MOTOR_CONTROLLER", [])

    decoder = CANDecoder()
    decoder.find_add_dbc_files()

    candapter_reader = EwertCandapter()
    candapter_reader.connect()

    #start reading in a separate thread
    candapter_reader_thread = threading.Thread(target=candapter_reader.start_reading)
    candapter_reader_thread.start()

    try:
        while True:
            message = candapter_reader.read_from_queue()
            if message is not None:
                decoded_message = decoder.device_data_readable(message.arbitration_id, message.data)
                if decoded_message is not None:
                        print(decoded_message)
    except KeyboardInterrupt:
        print("Stopping CAN message reading.")
        candapter_reader.close()
