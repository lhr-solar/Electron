import eventlet
eventlet.monkey_patch()

import threading
from flask import Flask, request
from flask_socketio import SocketIO
from flask_cors import CORS
import importlib

try:
    from server.dbc_structure_generated import AVAILABLE_DBCS
except ImportError:
    AVAILABLE_DBCS = []

from server.util.can_decoder import CANDecoder
from server.util.can_manager import DeviceManager
from server.threads.log_thread import LogThread
from server.threads.parser_thread import create_parser
from server.threads.processor_thread import ProcessorThread
from server.threads.emitter_thread import EmitterThread

app = Flask(__name__, static_folder='../client/build', static_url_path='')
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

SESSION_STARTED = False
STOP_EVENT = threading.Event()

@app.route('/')
def index():
    return app.send_static_file('index.html')

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    socketio.emit('available_dbcs', {'dbcs': AVAILABLE_DBCS}, room=request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")

@socketio.on('start_session')
def handle_start_session(client_config):
    global SESSION_STARTED
    if SESSION_STARTED:
        print("Warning: Session already started. Ignoring request.")
        return

    print(f"Received configuration from client {request.sid}: {client_config}")
    
    config = client_config
    config["PRINT_CAN_INFO"] = True
    
    try:
        selected_dbc = config["DBC_FILE"]
        if selected_dbc not in AVAILABLE_DBCS:
            raise ImportError(f"Selected DBC '{selected_dbc}' is not available or cached.")

        module_path = f"server.dbc_structure_generated.{selected_dbc}"
        print(f"Attempting to dynamically import DBC module: {module_path}")
        dbc_module = importlib.import_module(module_path)

    except ImportError as e:
        error_msg = f"FATAL: Could not import cache for '{selected_dbc}'. Please run 'util/cache_dbc.py' first. Details: {e}"
        print(error_msg)
        socketio.emit('init_error', {'error': 'DBC_CACHE_NOT_FOUND', 'message': error_msg}, room=request.sid)
        return
    except Exception as e:
        print(f"FATAL: An unexpected error occurred during initialization. Error: {e}")
        socketio.emit('init_error', {'error': 'UNKNOWN_INIT_ERROR', 'message': str(e)}, room=request.sid)
        return

    SESSION_STARTED = True
    
    dbc_file_path = f"server/dbc/{selected_dbc}.dbc"
    can_decoder = CANDecoder()
    can_decoder.add_dbc_file(dbc_file_path)
    
    device_manager = DeviceManager(can_decoder, dbc_module, config)

    log_handler = LogThread(STOP_EVENT, config.get("LOG_ENABLED"))
    parser = create_parser(config, log_handler.log_queue)
    processor = ProcessorThread(parser.queue, STOP_EVENT, device_manager)
    emitter = EmitterThread(socketio, STOP_EVENT, parser, device_manager)

    socketio.start_background_task(log_handler.run)
    socketio.start_background_task(parser.run)
    socketio.start_background_task(processor.run)
    socketio.start_background_task(emitter.run)
    
    print("--- Backend Session Started ---")
    socketio.emit('session_started', {'selected_dbc': selected_dbc})


def on_shutdown():
    print("[Main] Stopping threads...")
    STOP_EVENT.set()

if __name__ == '__main__':
    try:
        socketio.run(app, host='0.0.0.0', port=5000, debug=False)
    except KeyboardInterrupt:
        pass
    finally:
        on_shutdown()
