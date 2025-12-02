from gevent import monkey
monkey.patch_all()

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
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

# --- Global State ---
SESSION_STARTED = False
STOP_EVENT = threading.Event()
emitter_thread = None
selected_dbc_name = None
# --------------------

@app.route('/')
def index():
    return app.send_static_file('index.html')

@socketio.on('connect')
def handle_connect():
    global emitter_thread, selected_dbc_name
    print(f"Client connected: {request.sid}")
    if SESSION_STARTED and emitter_thread:
        print("Session in progress. Sending full state snapshot to re-connecting client.")
        # Get the complete state snapshot from the emitter
        snapshot = emitter_thread.get_full_state_snapshot()
        # Send a single, consolidated event
        socketio.emit('session_resumed', {
            'selected_dbc': selected_dbc_name,
            'full_data_state': snapshot['full_data_state'],
            'connection_states': snapshot['connection_states']
        }, room=request.sid)
    else:
        print("No session started. Sending available DBCs.")
        socketio.emit('available_dbcs', {'dbcs': AVAILABLE_DBCS}, room=request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")

@socketio.on('start_session')
def handle_start_session(client_config):
    global SESSION_STARTED, emitter_thread, selected_dbc_name
    if SESSION_STARTED:
        return

    print(f"Received configuration from client {request.sid}: {client_config}")
    
    config = client_config
    config["PRINT_CAN_INFO"] = True
    
    try:
        selected_dbc_name = config["DBC_FILE"]
        if selected_dbc_name not in AVAILABLE_DBCS:
            raise ImportError(f"Selected DBC '{selected_dbc_name}' is not available or cached.")

        module_path = f"server.dbc_structure_generated.{selected_dbc_name}"
        dbc_module = importlib.import_module(module_path)

    except ImportError as e:
        # ... (error handling)
        return
    except Exception as e:
        # ... (error handling)
        return

    SESSION_STARTED = True
    
    dbc_file_path = f"dbc/{selected_dbc_name}.dbc"
    can_decoder = CANDecoder()
    can_decoder.add_dbc_file(dbc_file_path)
    
    device_manager = DeviceManager(can_decoder, dbc_module, config)

    log_handler = LogThread(STOP_EVENT, config.get("LOG_ENABLED"))
    parser = create_parser(config, log_handler.log_queue)
    processor = ProcessorThread(parser.queue, STOP_EVENT, device_manager)
    emitter_thread = EmitterThread(socketio, STOP_EVENT, parser, device_manager)

    socketio.start_background_task(log_handler.run)
    socketio.start_background_task(parser.run)
    socketio.start_background_task(processor.run)
    socketio.start_background_task(emitter_thread.run)
    
    print("--- Backend Session Started ---")
    socketio.emit('session_started', {'selected_dbc': selected_dbc_name})


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
