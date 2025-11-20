import sys
from ..parsers.tcp_parser import TCPParser
from ..parsers.serial_parser import SerialParser
from ..parsers.file_parser import FileParser

def start_parser_thread(config, packet_queue, stop_event, log_queue=None):
    input_mode = config.get("INPUT_MODE", "serial")
    
    if input_mode == 'tcp':
        parser = TCPParser(
            packet_queue, 
            stop_event, 
            config.get("TCP_IP"), 
            config.get("TCP_PORT"),
            log_queue=log_queue
        )
    elif input_mode == 'serial':
        parser = SerialParser(
            packet_queue, 
            stop_event, 
            config.get("SERIAL_PORT"), 
            config.get("SERIAL_BAUDRATE"),
            log_queue=log_queue
        )
    elif input_mode == 'file':
        parser = FileParser(
            packet_queue, 
            stop_event, 
            config.get("REPLAY_FILE")
        )
    else:
        print(f"Invalid INPUT_MODE: {input_mode}")
        sys.exit(1)
        
    parser.daemon = True
    parser.start()
    return parser
