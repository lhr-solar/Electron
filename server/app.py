import threading
import queue
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

from server.can_decoder import CANDecoder
from server.can_manager import DeviceManager
from server.threads.log_thread import LogThread
from server.threads.parser_thread import start_parser_thread
from server.threads.processor_thread import ProcessorThread
from server.threads.emitter_thread import EmitterThread

app = Flask(
    __name__,
    static_folder='../build/client',
    static_url_path='',
)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Configuration
config = {
    "DBC_FILE_PATH": "./dbc/Daybreak-Telemetry.dbc",
    "INPUT_MODE": "tcp",
    "TCP_IP": "3.141.38.115",
    "TCP_PORT": 8187,
    "SERIAL_PORT": "COM3",
    "SERIAL_BAUDRATE": 125000,
    "REPLAY_FILE": "./data/578_log.txt",
    "LOG_ENABLED": True,
    "PRINT_CAN_INFO": True
}

# Global Variables
PACKET_QUEUE = queue.Queue()
LOG_QUEUE = queue.Queue() if config["LOG_ENABLED"] and config['INPUT_MODE'] != "file" else None
STOP_EVENT = threading.Event()

# Initialize CAN Decoder and Device Manager
can_decoder = CANDecoder()
can_decoder.add_dbc_file(config["DBC_FILE_PATH"])
device_manager = DeviceManager(can_decoder, config)

# Start Threads
log_thread = LogThread(LOG_QUEUE, STOP_EVENT) if LOG_QUEUE else None
parser_thread = start_parser_thread(config, PACKET_QUEUE, STOP_EVENT, LOG_QUEUE)
processor_thread = ProcessorThread(PACKET_QUEUE, STOP_EVENT, device_manager)
emitter_thread = EmitterThread(socketio, STOP_EVENT, parser_thread, device_manager)

if log_thread:
    log_thread.daemon = True
    log_thread.start()
processor_thread.daemon = True
emitter_thread.daemon = True
processor_thread.start()
emitter_thread.start()

@app.route('/')
def index():
    return app.send_static_file('index.html')

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('bps_reset')
def handle_trip_reset():
    print('BPS RESET command received')
    bps_device = device_manager.get_device("BPS_Leader")
    if bps_device:
        bps_device.reset()

def on_shutdown():
    print("[Main] Stopping threads...")
    STOP_EVENT.set()
    if parser_thread:
        parser_thread.join()
    processor_thread.join()
    emitter_thread.join()
    if log_thread:
        log_thread.join()
    print("[Main] Exited.")

if __name__ == '__main__':
    try:
        socketio.run(app, host='0.0.0.0', port=5000, debug=False)
    except KeyboardInterrupt:
        pass
    finally:
        on_shutdown()
