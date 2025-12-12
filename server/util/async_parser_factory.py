import sys
import asyncio
import logging
from server.parsers.tcp_parser import TCPParser
from server.parsers.serial_parser import SerialParser
from server.parsers.file_parser import FileParser

logger = logging.getLogger(__name__)

def create_async_parser(config: dict, queue: asyncio.Queue, stop_event: asyncio.Event):
    """
    Factory function that creates and returns the appropriate async parser instance
    based on the application configuration.
    """
    input_mode = config.get("INPUT_MODE", "serial")
    logger.info(f"Creating async parser for input mode: '{input_mode}'")
    
    if input_mode == 'tcp':
        return TCPParser(
            ip=config.get("TCP_IP"), 
            port=config.get("TCP_PORT"),
            queue=queue,
            stop_event=stop_event
        )
    elif input_mode == 'serial':
        return SerialParser(
            port=config.get("SERIAL_PORT"), 
            serial_baudrate=config.get("SERIAL_BAUDRATE"),
            can_bitrate=config.get("CAN_BITRATE"),
            queue=queue,
            stop_event=stop_event
        )
    elif input_mode == 'file':
        return FileParser(
            file_path=config.get("REPLAY_FILE_PATH"),
            queue=queue,
            stop_event=stop_event
        )
    else:
        logger.critical(f"Invalid INPUT_MODE: {input_mode}. Exiting.")
        sys.exit(1)
