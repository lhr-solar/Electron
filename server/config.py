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
        self.INPUT_MODE = 'file'
        self.COMMON_CONFIG = {
            "DBC_FILE": "Daybreak_Telemetry.dbc", # Now includes extension
            "PRINT_CAN_INFO": False,
            "CLEAR_DEBUG_BUCKET_ON_STARTUP": False,
        }
        self.INFLUX_CONFIG = {
            "INFLUX_URL": "http://localhost:8086",
            "INFLUX_ORG": "LHRS",
            "INFLUX_TOKEN": os.environ.get("INFLUX_TOKEN", ""),
        }
        self.SERIAL_CONFIG = {
            "SERIAL_PORT": "/dev/tty.usbmodem14201",
            "SERIAL_BAUDRATE": 9600,
            "CAN_BITRATE": 125000,
        }
        self.TCP_CONFIG = {
            "TCP_IP": "127.0.0.1",
            "TCP_PORT": 8187,
        }
        self.FILE_CONFIG = {
            "REPLAY_FILE_PATH": os.path.join(self.LOG_DIR, "261_log.txt"),
        }

    def get_effective_config(self):
        config = self.COMMON_CONFIG.copy()
        config.update(self.INFLUX_CONFIG)
        config["INPUT_MODE"] = self.INPUT_MODE
        if self.INPUT_MODE == 'serial':
            config.update(self.SERIAL_CONFIG)
            config["INFLUX_BUCKET"] = "debug"
        elif self.INPUT_MODE == 'file':
            config.update(self.FILE_CONFIG)
            config["INFLUX_BUCKET"] = "debug"
        elif self.INPUT_MODE == 'tcp':
            config.update(self.TCP_CONFIG)
            config["INFLUX_BUCKET"] = "telemetry_main"
        else:
            logger.error(f"Invalid INPUT_MODE '{self.INPUT_MODE}' selected.")
            return None
        return config

    def update_setting(self, key: str, value: str | int) -> bool:
        if key == "INPUT_MODE":
            if value in ['serial', 'file', 'tcp']:
                self.INPUT_MODE = value
                logger.info(f"Input mode updated to '{value}'")
                return True
            return False
        
        for config_dict in [self.COMMON_CONFIG, self.SERIAL_CONFIG, self.TCP_CONFIG, self.FILE_CONFIG, self.INFLUX_CONFIG]:
            if key in config_dict:
                config_dict[key] = value
                logger.info(f"Set {key} = {value}")
                return True
                
        logger.warning(f"Attempted to update unknown setting '{key}'")
        return False

settings = Configuration()
