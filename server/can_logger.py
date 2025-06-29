import logging
from datetime import datetime
import os

import can


class CANLogger:
    def __init__(self, log_dir="./logs"):
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        os.makedirs(log_dir, exist_ok=True)

        self.raw_log_file = os.path.join(log_dir, f"raw_{timestamp}.log")
        self.decoded_log_file = os.path.join(log_dir, f"decoded_{timestamp}.log")

        self.raw_logger = self._setup_logger('raw_logger', self.raw_log_file)
        self.decoded_logger = self._setup_logger('decoded_logger', self.decoded_log_file)

    def _setup_logger(self, name, log_file):
        logger = logging.getLogger(name)
        logger.setLevel(logging.INFO)

        if logger.hasHandlers():
            logger.handlers.clear()

        handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
        formatter = logging.Formatter('%(asctime)s %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        return logger

    def log_raw(self, arbitration_id, data):
        try:
            data_str = data.hex() if isinstance(data, bytes) else bytes(data).hex()
            self.raw_logger.info(f"{arbitration_id:X}#{data_str}")
        except Exception as e:
            self.raw_logger.warning(f"Failed to log raw message: {e}")

    def log_decoded(self, arbitration_id, decoded_dict):
        try:
            if isinstance(decoded_dict, dict):
                msg_str = ', '.join(f"{k}={v}" for k, v in decoded_dict.items())
            else:
                msg_str = str(decoded_dict)
            self.decoded_logger.info(f"ID: {arbitration_id:X} | {msg_str}")
        except Exception as e:
            self.decoded_logger.warning(f"Failed to log decoded message: {e}")
