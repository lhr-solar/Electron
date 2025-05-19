import time

from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
import threading
import queue
from candapter_reader import CandapterReader
from can_decoder import CANDecoder
from can_device import CANDevice
from init_can_devices import init_can_devices

app = Flask(
    __name__,
    static_folder='../build/client',
    static_url_path='',
)

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

can_decoder = CANDecoder()
can_decoder.find_add_dbc_files()

default_data = {
    "BATTERY": {
        "BPS_Trip": False,
        "BPS_All_Clear": False,
        "HV_Contactor": False,
        "Array_Contactor": False,
        "Current": 0,
        "Voltage_Array": [0] * 32,
        "Temperature_Array": [0] * 32,
        "SoC": 0,
        "Charge_Enable": False,
        "Pack_Voltage": 0,
        "Voltage_Range": 0,
        "Average_Temp": 0,
        "Temperature_Range": 0,
        "BPS_Fault_State": 0,
        "Boost_Enable": False,
    },
    "MPPT_A": {
        "MPPT_Enabled": False,
        "MPPT_HeatsinkTemperature": 0,
        "MPPT_AmbientTemperature": 0,
        "MPPT_Fault": 0,
        "MPPT_Mode": 0,
        "MPPT_Iout": 0,
        "MPPT_Vout": 0,
        "MPPT_Iin": 0,
        "MPPT_Vin": 0,
    },
    "MPPT_B": {
        "MPPT_Enabled": False,
        "MPPT_HeatsinkTemperature": 0,
        "MPPT_AmbientTemperature": 0,
        "MPPT_Fault": 0,
        "MPPT_Mode": 0,
        "MPPT_Iout": 0,
        "MPPT_Vout": 0,
        "MPPT_Iin": 0,
        "MPPT_Vin": 0,
    }
}

master_data = default_data

can_reader = CandapterReader(
    com_port="COM6",
    serial_baudrate=9600,
    can_baudrate=125000
)
can_reader.connect()

can_queue = queue.Queue(maxsize=500)
data_available = threading.Event()

def can_reader_task():
    while True:
        try:
            can_queue.put(can_reader.read(), timeout=0)
            data_available.set()
        except queue.Full:
            print("Queue is full")
            pass


def can_processor_task():
    while True:
        data_available.wait()
        try:
            raw_message = can_queue.get_nowait()
            process_raw_message(raw_message)
        except queue.Empty:
            data_available.clear()



def process_raw_message(raw_message):
    # print(raw_message.arbitration_id)
    decoded_message = can_decoder.device_data_readable(raw_message.arbitration_id, raw_message.data)
    if decoded_message is not None and decoded_message["msg"] is not None:
        device_name = CANDevice.get_device_name_by_send_id(raw_message.arbitration_id)
        CANDevice.get_device_by_name(device_name).received_message()
        for key, value in decoded_message['msg'].items():
            if key in master_data[device_name]:
                if type(master_data[device_name][key]) == bool:
                    master_data[device_name][key] = bool(value)
                else:
                    master_data[device_name][key] = value
            elif key == "Voltage_idx":
                master_data[device_name]["Voltage_Array"][value] = decoded_message['msg']["Voltage_Value"]
            elif key == "Temperature_idx":
                master_data[device_name]["Temperature_Array"][value] = decoded_message['msg']["Temperature_Value"]

emit_thread = None
emit_thread_lock = threading.Lock()


def emit_can_data():
    while True:
        socketio.sleep(0.1)  # 100ms update interval
        with emit_thread_lock:
            if emit_thread is None:
                break

            socketio.emit('can_update', master_data)
            socketio.emit('connection_state', {
                "BATTERY": CANDevice.get_device_by_name("BATTERY").is_connected,
                "MPPT_A": CANDevice.get_device_by_name("MPPT_A").is_connected,
                "MPPT_B": CANDevice.get_device_by_name("MPPT_B").is_connected,
                "MOTOR_CONTROLLER": CANDevice.get_device_by_name("MOTOR_CONTROLLER").is_connected
            })


init_can_devices()

can_reader_thread = threading.Thread(target=can_reader_task)
can_reader_thread.daemon = True

can_processor_thread = threading.Thread(target=can_processor_task)
can_processor_thread.daemon = True


can_reader_thread.start()
can_processor_thread.start()


@app.route('/')
def index():
    return app.send_static_file('index.html')


@socketio.on('connect')
def handle_connect():
    global emit_thread
    print('Client connected')

    with emit_thread_lock:
        if emit_thread is None:
            emit_thread = socketio.start_background_task(emit_can_data)


@socketio.on('disconnect')
def handle_disconnect():
    global emit_thread
    with emit_thread_lock:
        if emit_thread is not None:
            emit_thread = None
    print('Client disconnected')


@socketio.on('bps_reset')
def handle_trip_reset():
    print('BPS RESET command received')
    master_data["BATTERY"]["BPS_Trip"] = False
    master_data["BATTERY"]["BPS_Fault_State"] = 0


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
