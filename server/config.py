import os
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
logger = logging.getLogger(__name__)

class Configuration:
    def __init__(self):
        # --- Default Input Mode ---
        # Options: 'serial', 'file', 'tcp'
        self.INPUT_MODE = 'file'

        # --- Common Configuration ---
        self.COMMON_CONFIG = {
            "DBC_FILE": "Daybreak_Telemetry",
            "PRINT_CAN_INFO": True,
            "INFLUX_URL": "http://localhost:8086",
            "INFLUX_ORG": "LHRS",
            "INFLUX_TOKEN": os.environ.get("INFLUX_TOKEN", "your-token-fallback"),
            "CLEAR_DEBUG_BUCKET_ON_STARTUP": True,
        }

        # --- Mode-Specific Configurations ---
        self.SERIAL_CONFIG = {
            "SERIAL_PORT": "/dev/tty.usbmodem14201",
            "SERIAL_BAUDRATE": 9600,
            "CAN_BITRATE": 125000,
        }

        self.TCP_CONFIG = {
            "TCP_IP": "3.141.38.115",
            "TCP_PORT": 8187,
        }

        self.FILE_CONFIG = {
            "REPLAY_FILE_PATH": "test_data/261_log.txt",
        }

    def get_effective_config(self):
        """
        Constructs and returns the final configuration dictionary based on the
        current INPUT_MODE.
        """
        config = self.COMMON_CONFIG.copy()
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

    def update_input_mode(self, new_mode):
        """Allows changing the input mode at runtime (for future UI control)."""
        if new_mode in ['serial', 'file', 'tcp']:
            self.INPUT_MODE = new_mode
            logger.info(f"Input mode updated to '{new_mode}'")
            return True
        logger.warning(f"Attempted to set invalid input mode: '{new_mode}'")
        return False

# Create a singleton instance to be used across the app
settings = Configuration()
