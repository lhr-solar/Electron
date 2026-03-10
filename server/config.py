import os
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

class Configuration:
    def __init__(self):
        # --- Environment-based Paths ---
        self.DBC_DIR = os.environ.get("DBC_DIR", "dbc")
        self.LOG_DIR = os.environ.get("LOG_DIR", "logs")
        self.TRASH_DIR = os.environ.get("TRASH_DIR", ".trash")

        # --- Default Settings ---
        self.INPUT_MODE = 'tcp'
        self.COMMON_CONFIG = {
            "DBC_VEHICLE": "Daybreak",
            "DBC_FILES": [],  # list of .dbc filenames under DBC_DIR/<vehicle>/
            "PRINT_CAN_INFO": False,
            "CLEAR_DEBUG_BUCKET_ON_STARTUP": False,
            "INFLUX_WRITE_ENABLED": True,
        }
        self.INFLUX_CONFIG = {
            "INFLUX_URL": "http://localhost:8086",
            "INFLUX_ORG": "LHRS",
            "INFLUX_TOKEN": os.environ.get("INFLUX_TOKEN", ""),
        }
        self.SERIAL_CONFIG = {
            "SERIAL_PORT": "/dev/tty.usbmodem14201",
            "SERIAL_BAUDRATE": 9600,
            "CAN_BITRATE": 250000,
        }
        self.TCP_CONFIG = {
            "TCP_IP": "3.141.38.115",
            "TCP_PORT": 8187,
        }
        self.FILE_CONFIG = {
            "REPLAY_FILE_PATH": os.path.join(self.LOG_DIR, "261_log.txt"),
        }
        self.PCAN_CONFIG = {
            "PCAN_CHANNEL": "PCAN_USBBUS1",
            "PCAN_BITRATE": 250000,
            "PCAN_DEVICE_ID": None,  # Optional: select by device ID instead of channel
        }

    def get_bucket(self):
        """Return the InfluxDB bucket name for the current input mode."""
        if self.INPUT_MODE == "tcp":
            return "telemetry_main"
        return "debug"

    def get_effective_config(self):
        config = self.COMMON_CONFIG.copy()
        config.update(self.INFLUX_CONFIG)
        config["INPUT_MODE"] = self.INPUT_MODE
        config.update(self.PCAN_CONFIG)  # Always include for UI
        if self.INPUT_MODE in ("serial", "serial_canadapter", "serial_uart"):
            config.update(self.SERIAL_CONFIG)
        elif self.INPUT_MODE == "pcan":
            config.update(self.PCAN_CONFIG)
        elif self.INPUT_MODE == 'file':
            config.update(self.FILE_CONFIG)
        elif self.INPUT_MODE == 'tcp':
            config.update(self.TCP_CONFIG)
        else:
            logger.error(f"Invalid INPUT_MODE '{self.INPUT_MODE}' selected.")
            return None
        config["INFLUX_BUCKET"] = self.get_bucket()
        return config

    def update_setting(self, key: str, value: str | int | list) -> bool:
        if key == "INPUT_MODE":
            if value in ("serial", "serial_canadapter", "serial_uart", "pcan", "file", "tcp"):
                self.INPUT_MODE = value
                logger.info(f"Input mode updated to '{value}'")
                return True
            return False
        
        # Special handling for REPLAY_FILE_PATH to ensure full path
        if key == "REPLAY_FILE_PATH":
            # If the value is just a filename, prepend the LOG_DIR
            if not os.path.isabs(value) and not os.path.dirname(value):
                value = os.path.join(self.LOG_DIR, value)
        
        if key == "DBC_FILES" and isinstance(value, list):
            self.COMMON_CONFIG["DBC_FILES"] = [str(x) for x in value]
            logger.info(f"Set DBC_FILES = {len(value)} file(s)")
            return True

        if key == "PCAN_DEVICE_ID":
            self.PCAN_CONFIG["PCAN_DEVICE_ID"] = int(value) if value is not None and value != "" else None
            logger.info(f"Set PCAN_DEVICE_ID = {self.PCAN_CONFIG['PCAN_DEVICE_ID']}")
            return True

        for config_dict in [self.COMMON_CONFIG, self.SERIAL_CONFIG, self.TCP_CONFIG, self.FILE_CONFIG, self.PCAN_CONFIG, self.INFLUX_CONFIG]:
            if key in config_dict:
                if key == "DBC_FILES" and not isinstance(value, list):
                    continue
                config_dict[key] = value
                logger.info(f"Set {key} = {value}")
                return True

        logger.warning(f"Attempted to update unknown setting '{key}'")
        return False

settings = Configuration()
