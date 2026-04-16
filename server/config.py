import os
import sys
import logging
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

class Configuration:
    def __init__(self):
        self.IS_FROZEN = bool(getattr(sys, "frozen", False))
        self.APP_NAME = os.environ.get("APP_NAME", "ElectronTelemetry")
        self.APP_DATA_DIR = self._resolve_app_data_dir()

        # --- Environment-based Paths ---
        self.DBC_DIR = self._resolve_runtime_path("DBC_DIR", "dbc")
        self.LOG_DIR = self._resolve_runtime_path("LOG_DIR", "logs")
        self.TRASH_DIR = self._resolve_runtime_path("TRASH_DIR", ".trash")

        # --- Default Settings ---
        self.DEFAULT_DBC_VEHICLE = os.environ.get("DEFAULT_DBC_VEHICLE", "Mcqueen")
        self.INPUT_MODE = 'tcp'
        self.COMMON_CONFIG = {
            "DBC_VEHICLE": self.DEFAULT_DBC_VEHICLE,
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
        # Cap'n Proto TCP: length-prefixed `server/util/capnp_schemas/can_frame.capnp` frames (see parser docs).
        self.CAPNP_TCP_CONFIG = {
            "CAPNP_TCP_IP": "127.0.0.1",
            "CAPNP_TCP_PORT": 8190,
        }
        self.FILE_CONFIG = {
            "REPLAY_FILE_PATH": os.path.join(self.LOG_DIR, "261_log.txt"),
        }
        self.PCAN_CONFIG = {
            "PCAN_CHANNEL": "PCAN_USBBUS1",
            "PCAN_BITRATE": 250000,
            "PCAN_DEVICE_ID": None,  # Optional: select by device ID instead of channel
        }

    def _resolve_app_data_dir(self):
        explicit = os.environ.get("APP_DATA_DIR")
        if explicit:
            return explicit
        if os.name == "nt":
            base = os.environ.get("APPDATA") or os.path.expanduser("~")
            return os.path.join(base, self.APP_NAME)
        if sys.platform == "darwin":
            return os.path.join(os.path.expanduser("~/Library/Application Support"), self.APP_NAME)
        return os.path.join(os.path.expanduser("~/.local/share"), self.APP_NAME)

    def _resolve_runtime_path(self, env_key: str, default_relative: str):
        explicit = os.environ.get(env_key)
        if explicit:
            return explicit
        if self.IS_FROZEN:
            return os.path.join(self.APP_DATA_DIR, default_relative)
        return default_relative

    def get_bucket(self):
        """Return the InfluxDB bucket name for the current input mode."""
        if self.INPUT_MODE in ("tcp", "capnp_tcp"):
            return "telemetry_main"
        return "debug"

    def get_effective_config(self):
        config = self.COMMON_CONFIG.copy()
        config.update(self.INFLUX_CONFIG)
        config["INPUT_MODE"] = self.INPUT_MODE
        config.update(self.PCAN_CONFIG)  # Always include for UI
        config.update(self.TCP_CONFIG)  # SLCAN TCP — include for UI when switching modes
        config.update(self.CAPNP_TCP_CONFIG)  # Cap'n Proto TCP — include for UI when switching modes
        if self.INPUT_MODE in ("serial_canadapter", "serial_uart"):
            config.update(self.SERIAL_CONFIG)
        elif self.INPUT_MODE == "pcan":
            config.update(self.PCAN_CONFIG)
        elif self.INPUT_MODE == 'file':
            config.update(self.FILE_CONFIG)
        elif self.INPUT_MODE in ('tcp', 'capnp_tcp'):
            pass
        else:
            logger.error(f"Invalid INPUT_MODE '{self.INPUT_MODE}' selected.")
            return None
        config["INFLUX_BUCKET"] = self.get_bucket()
        return config

    def update_setting(self, key: str, value: str | int | list) -> bool:
        if key == "INPUT_MODE":
            if value in ("serial_canadapter", "serial_uart", "pcan", "file", "tcp", "capnp_tcp"):
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

        for config_dict in [self.COMMON_CONFIG, self.SERIAL_CONFIG, self.TCP_CONFIG, self.CAPNP_TCP_CONFIG, self.FILE_CONFIG, self.PCAN_CONFIG, self.INFLUX_CONFIG]:
            if key in config_dict:
                if key == "DBC_FILES" and not isinstance(value, list):
                    continue
                config_dict[key] = value
                logger.info(f"Set {key} = {value}")
                return True

        logger.warning(f"Attempted to update unknown setting '{key}'")
        return False

settings = Configuration()
