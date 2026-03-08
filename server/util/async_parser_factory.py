import sys
import asyncio
import logging
from server.parsers.tcp_parser import TCPParser
from server.parsers.serial_canadapter_parser import SerialCanAdapterParser
from server.parsers.serial_uart_parser import SerialUartParser
from server.parsers.file_parser import FileParser
from server.parsers._parser_abc import _Parser

logger = logging.getLogger(__name__)

# Legacy: "serial" is treated as "serial_canadapter"
VALID_INPUT_MODES = ("tcp", "file", "serial_canadapter", "serial_uart")


def create_async_parser(config: dict, queue: asyncio.Queue, stop_event: asyncio.Event) -> _Parser:
    """
    Factory function that creates and returns the appropriate async parser instance
    based on the application configuration.
    """
    input_mode = config.get("INPUT_MODE", "tcp")
    logger.info(f"Creating async parser for input mode: '{input_mode}'")

    parser_class = {
        "tcp": TCPParser,
        "serial_canadapter": SerialCanAdapterParser,
        "serial_uart": SerialUartParser,
        "file": FileParser,
    }.get(input_mode)

    if not parser_class:
        logger.critical(f"Invalid INPUT_MODE: {input_mode}. Valid: {VALID_INPUT_MODES}. Exiting.")
        sys.exit(1)

    kwargs = {"queue": queue, "stop_event": stop_event}

    if input_mode == "tcp":
        kwargs.update({"ip": config.get("TCP_IP"), "port": config.get("TCP_PORT")})
    elif input_mode == "serial_canadapter":
        kwargs.update({
            "port": config.get("SERIAL_PORT"),
            "serial_baudrate": config.get("SERIAL_BAUDRATE"),
            "can_bitrate": config.get("CAN_BITRATE"),
        })
    elif input_mode == "serial_uart":
        kwargs.update({
            "port": config.get("SERIAL_PORT"),
            "serial_baudrate": config.get("SERIAL_BAUDRATE"),
        })
    elif input_mode == "file":
        kwargs.update({"file_path": config.get("REPLAY_FILE_PATH")})

    return parser_class(**kwargs)
