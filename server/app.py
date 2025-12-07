from gevent import monkey
monkey.patch_all()

import os
import threading
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()

from server.util.can_manager import CANManager
from server.threads.parser_thread import create_parser
from server.threads.processor_thread import ProcessorThread
from server.threads.influx_writer_thread import InfluxWriterThread



app = Flask(__name__, static_folder='../client/build', static_url_path='')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

# --- Hardcoded Configuration ---
INPUT_MODE = 'file'
COMMON_CONFIG = {
    "DBC_FILE": "Daybreak_Telemetry",
    "PRINT_CAN_INFO": True,
    "INFLUX_URL": "http://localhost:8086",
    "INFLUX_ORG": "LHRS",
    "INFLUX_TOKEN": os.environ.get("INFLUX_TOKEN", "your-token-fallback"),
    "CLEAR_DEBUG_BUCKET_ON_STARTUP": True,
}
SERIAL_CONFIG = {
    "SERIAL_PORT": "/dev/cu.usbserial-DN8BA088", # Updated to match your device
    "SERIAL_BAUDRATE": 9600, # Correct, standard baud rate for the serial port
    "CAN_BITRATE": 125000,   # The desired CAN bus speed
}
TCP_CONFIG = {
    "TCP_IP": "3.141.38.115",
    "TCP_PORT": 8187,
}
FILE_CONFIG = {
    "REPLAY_FILE_PATH": "test_data/261_log.txt",
}
# -----------------------------

# --- Global State ---
SESSION_STARTED = False
STOP_EVENT = threading.Event()
# --------------------

def start_backend_session():
    """Initializes and starts all the backend threads based on the hardcoded config."""
    global SESSION_STARTED
    if SESSION_STARTED:
        return

    print("--- Starting Backend Session ---")
    
    config = COMMON_CONFIG.copy()
    config["INPUT_MODE"] = INPUT_MODE

    if INPUT_MODE == 'serial':
        config.update(SERIAL_CONFIG)
        config["INFLUX_BUCKET"] = "debug"
    elif INPUT_MODE == 'file':
        config.update(FILE_CONFIG)
        config["INFLUX_BUCKET"] = "debug"
    elif INPUT_MODE == 'tcp':
        config.update(TCP_CONFIG)
        config["INFLUX_BUCKET"] = "telemetry_main"
    else:
        print(f"Error: Invalid INPUT_MODE '{INPUT_MODE}' selected.")
        return

    if config["INFLUX_TOKEN"] == "your-token-fallback":
        print("\n--- WARNING: Using fallback InfluxDB token. ---")
        print("--- Set the INFLUX_TOKEN environment variable for secure authentication. ---\n")

    SESSION_STARTED = True
    
    selected_dbc_name = config["DBC_FILE"]
    dbc_file_path = f"dbc/{selected_dbc_name}.dbc"
    
    influx_writer_thread = InfluxWriterThread(STOP_EVENT, config)
    can_manager = CANManager(dbc_file_path, config, influx_writer=influx_writer_thread)
    parser = create_parser(config)
    processor = ProcessorThread(parser.queue, STOP_EVENT, can_manager)

    socketio.start_background_task(influx_writer_thread.run)
    socketio.start_background_task(parser.run)
    socketio.start_background_task(processor.run)
    
    print("--- Backend Session Started ---")
    socketio.emit('session_started', {'selected_dbc': selected_dbc_name})

@app.route('/')
def index():
    return app.send_static_file('index.html')

def on_shutdown():
    print("[Main] Stopping threads...")
    STOP_EVENT.set()

if __name__ == '__main__':
    try:
        start_backend_session()
        socketio.run(app, host='0.0.0.0', port=4000, debug=False)
    except KeyboardInterrupt:
        pass
    finally:
        on_shutdown()
