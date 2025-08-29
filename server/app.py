from flask import Flask, request
from flask_socketio import SocketIO
from flask_cors import CORS
import threading
import queue
import platform
import os

from server.adapter.utils.adapter_abc import AdapterABC
from server.can_decoder import CANDecoder
from server.can_device import CANDevice
from server.can_logger import CANLogger
from server.init_can_devices import init_can_devices
from server.adapter.ewert_candapter import EwertCandapter
from server.adapter.xbee_rf_adapter import XBeeRFAdapter
from server.adapter.network_adapter import NetworkAdapter

LOG = False  # Set to True to enable debug logging

app = Flask(
    __name__,
    static_folder='../build/client',
    static_url_path='',
)

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

can_decoder = CANDecoder()
can_decoder.find_add_dbc_files()
CANDevice.can_decoder = can_decoder

can_logger = None
if LOG:
    can_logger = CANLogger(log_dir="./logs")

# Detect platform and set default port_name
if 'microsoft' in platform.uname().release.lower() or 'WSL_DISTRO_NAME' in os.environ:
    port_name = "/dev/ttyUSB0"  # WSL
elif platform.system() == "Windows":
    port_name = "COM3"
else:
    port_name = "/dev/ttyUSB0"  # Linux

# can_reader = EwertCandapter(
#     com_port=port_name,
#     serial_baudrate=9600,
#     can_baudrate=125000
# )

# can_reader = XBeeRFAdapter(
#     com_port=port_name,
#     bitrate=125000
# )

# can_reader = NetworkAdapterABC(
#     server_ip="3.141.38.115",
#     port=5700
# )

can_reader: AdapterABC | None = None

can_queue = queue.Queue(maxsize=1024)
data_available = threading.Event()


def can_reader_task():
    try:
        while True:
            try:
                if can_reader.is_connected():
                    queue_msg = can_reader.read()
                    if queue_msg is None:
                        continue
                    can_queue.put(queue_msg, timeout=0)
                    data_available.set()
            except queue.Full:
                print("Queue is full")
                pass
    except KeyboardInterrupt:
        print("\nStopping CAN message reader.")
    finally:
        can_reader.close()
        can_reader.set_connected(False)
        print("CAN bus and device closed.")


def can_processor_task():
    while True:
        data_available.wait()
        try:
            raw_message = can_queue.get_nowait()
            if raw_message is None:
                continue
            # print(raw_message)
            dm = CANDevice.process_can_message(raw_message)
            if LOG:
                can_logger.log_raw(raw_message.arbitration_id, raw_message.data)
                can_logger.log_decoded(raw_message.arbitration_id, dm["msg"])

            # print(hex(raw_message.arbitration_id), dm)
        except queue.Empty:
            data_available.clear()


emit_thread = None
emit_thread_lock = threading.Lock()


def emit_can_data():
    while True:
        socketio.sleep(0.1)  # 100ms update interval
        with emit_thread_lock:
            if emit_thread is None:
                break

            socketio.emit('can_update', {
                "BATTERY": CANDevice.get_device_by_name("BATTERY").master_data,
                "MPPT_A": CANDevice.get_device_by_name("MPPT_A").master_data,
                "MPPT_B": CANDevice.get_device_by_name("MPPT_B").master_data,
                "SUPPLEMENTAL_BATTERY": CANDevice.get_device_by_name("SUPPLEMENTAL_BATTERY").master_data,
                "CONTACTOR_DRIVER": CANDevice.get_device_by_name("CONTACTOR_DRIVER").master_data,
                "CONTROLS": CANDevice.get_device_by_name("CONTROLS").master_data,
                "MOTOR_CONTROLLER": CANDevice.get_device_by_name("MOTOR_CONTROLLER").master_data
            })
            socketio.emit('connection_state', {
                "CANDAPTER": can_reader.is_connected() if can_reader is not None else False,
                "BATTERY": CANDevice.get_device_by_name("BATTERY").is_connected,
                "MPPT_A": CANDevice.get_device_by_name("MPPT_A").is_connected,
                "MPPT_B": CANDevice.get_device_by_name("MPPT_B").is_connected,
                "SUPPLEMENTAL_BATTERY": CANDevice.get_device_by_name("SUPPLEMENTAL_BATTERY").is_connected,
                "CONTACTOR_DRIVER": CANDevice.get_device_by_name("CONTACTOR_DRIVER").is_connected,
                "CONTROLS": CANDevice.get_device_by_name("CONTROLS").is_connected,
                "MOTOR_CONTROLLER": CANDevice.get_device_by_name("MOTOR_CONTROLLER").is_connected,
                "dev_nick": can_reader.nickname if can_reader is not None else "Unknown",
            })


init_can_devices()

can_reader_thread = threading.Thread(target=can_reader_task)
can_reader_thread.daemon = True

can_processor_thread = threading.Thread(target=can_processor_task)
can_processor_thread.daemon = True


# function start reading, set can_reader to the desired adapter. Start read and process threads. Will take in the user selected adapter
def start_can_reader(adapter):
    global can_reader
    global can_reader_thread
    global emit_thread
    global emit_thread_lock
    with emit_thread_lock:
        if emit_thread is not None:
            emit_thread = None
        if can_reader_thread.is_alive():
            can_reader_thread.join()
    if can_reader is not None:
        can_reader.close()
    if adapter == "CANdapter":
        can_reader = EwertCandapter(
            com_port=port_name,
            serial_baudrate=9600,
            can_baudrate=125000
        )
    elif adapter == "XBee RF":
        can_reader = XBeeRFAdapter(
            com_port=port_name,
            bitrate=125000
        )
    elif adapter == "LTE":
        can_reader = NetworkAdapter(
            server_ip="")


@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/get_adapter_form_data')
def get_adapter_form_data():
    ports = []
    if platform.system() == "Windows":
        import serial.tools.list_ports
        ports = [port.device for port in serial.tools.list_ports.comports()]
    else:
        import glob
        ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')

    return {
        "CANdapter": [
            {"name": "port", "label": "Port", "type": "select", "options": ports, "required": True},
            {"name": "dev_baudrate", "label": "UART Baudrate", "type": "number", "required": True},
            {"name": "can_bitrate", "label": "CAN Bitrate", "type": "number", "required": True},
        ],
        "XBee RF": [
            {"name": "port", "label": "Port", "type": "select", "options": ports, "required": True},
            {"name": "can_bitrate", "label": "CAN Bitrate", "type": "number", "required": True},
        ],
        "LTE": [
            {"name": "server_ip", "label": "Server IP", "type": "text", "required": True},
            {"name": "server_port", "label": "Port", "type": "number", "required": True},
        ]
    }


@app.route('/api/adapter_configure', methods=['POST'])
def adapter_configure():
    global can_reader

    if can_reader is not None and can_reader.is_connected():
        can_reader.close()

    data = request.json
    adapter = data.get('adapter')
    if adapter not in ["candapter", "xbee_rf", "lte"]:
        return {"error": "Invalid adapter"}, 400

    if adapter == "candapter":
        can_reader = EwertCandapter(
            com_port=data.get('port', port_name),
            serial_baudrate=int(data.get('dev_baudrate', 9600)),
            can_baudrate=int(data.get('can_bitrate', 125000))
        )
    elif adapter == "xbee_rf":
        can_reader = XBeeRFAdapter(
            com_port=data.get('port', port_name),
            bitrate=int(data.get('can_bitrate', 125000))
        )
    elif adapter == "lte":
        can_reader = NetworkAdapter(
            server_ip=data.get("server_ip"),
            port=int(data.get("server_port", 5700)),
        )

    if not can_reader.is_connected():
        can_reader.connect()
        can_processor_thread.start()
        can_reader_thread.start()
    return {"success": True}, 200


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
    CANDevice.get_device_by_name("BATTERY").reset()


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
