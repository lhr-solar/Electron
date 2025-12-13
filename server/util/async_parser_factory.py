import sys
import asyncio
import logging
from server.parsers.tcp_parser import TCPParser
from server.parsers.serial_parser import SerialParser
from server.parsers.file_parser import FileParser
from server.parsers.parser_abc import Parser

logger = logging.getLogger(__name__)

def create_async_parser(config: dict, queue: asyncio.Queue, stop_event: asyncio.Event) -> Parser:
    """
    Factory function that creates and returns the appropriate async parser instance
    based on the application configuration.
    """
    input_mode = config.get("INPUT_MODE", "serial")
    logger.info(f"Creating async parser for input mode: '{input_mode}'")
    
    parser_class = {
        'tcp': TCPParser,
        'serial': SerialParser,
        'file': FileParser
    }.get(input_mode)

    if not parser_class:
        logger.critical(f"Invalid INPUT_MODE: {input_mode}. Exiting.")
        sys.exit(1)

    # Common arguments for all parsers
    kwargs = {
        "queue": queue,
        "stop_event": stop_event
    }

    # Add mode-specific arguments
    if input_mode == 'tcp':
        kwargs.update({
            "ip": config.get("TCP_IP"), 
            "port": config.get("TCP_PORT")
        })
    elif input_mode == 'serial':
        kwargs.update({
            "port": config.get("SERIAL_PORT"), 
            "serial_baudrate": config.get("SERIAL_BAUDRATE"),
            "can_bitrate": config.get("CAN_BITRATE")
        })
    elif input_mode == 'file':
        kwargs.update({
            "file_path": config.get("REPLAY_FILE_PATH")
        })
        
    return parser_class(**kwargs)
