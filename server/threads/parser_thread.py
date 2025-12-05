import sys
from server.parsers.tcp_parser import TCPParser
from server.parsers.serial_parser import SerialParser
from server.parsers.file_parser import FileParser

def create_parser(config):
    """
    Factory function that creates and returns the appropriate parser instance
    based on the application configuration.
    """
    input_mode = config.get("INPUT_MODE", "serial")
    
    if input_mode == 'tcp':
        parser = TCPParser(
            config.get("TCP_IP"), 
            config.get("TCP_PORT")
        )
    elif input_mode == 'serial':
        parser = SerialParser(
            config.get("SERIAL_PORT"), 
            config.get("SERIAL_BAUDRATE")
        )
    elif input_mode == 'file':
        parser = FileParser(
            config.get("REPLAY_CONTENT") # Pass content directly
        )
    else:
        print(f"Invalid INPUT_MODE: {input_mode}")
        sys.exit(1)
        
    return parser
