import sys
from ..parsers.tcp_parser import TCPParser
from ..parsers.serial_parser import SerialParser
from ..parsers.file_parser import FileParser

def create_parser(config, log_queue=None):
    """
    Factory function that creates and returns the appropriate parser instance
    based on the application configuration.
    """
    input_mode = config.get("INPUT_MODE", "serial")
    
    # The STOP_EVENT is now managed by the parser instances themselves
    
    if input_mode == 'tcp':
        parser = TCPParser(
            config.get("TCP_IP"), 
            config.get("TCP_PORT"),
            log_queue=log_queue
        )
    elif input_mode == 'serial':
        parser = SerialParser(
            config.get("SERIAL_PORT"), 
            config.get("SERIAL_BAUDRATE"),
            log_queue=log_queue
        )
    elif input_mode == 'file':
        parser = FileParser(
            config.get("REPLAY_CONTENT") # Pass content directly
        )
    else:
        print(f"Invalid INPUT_MODE: {input_mode}")
        sys.exit(1)
        
    return parser
