import can
import time
import queue
import threading
from server.candapter_reader import CandapterReader

def slcan_to_can_message(line: str) -> can.Message:
    """
    Convert a single SLCAN line (11-bit ID) to a python-can Message.
    Example: t1234112233
    """
    line = line.strip()
    if not line or line[0] != 't':  # Only 11-bit standard frames
        return None

    messageID = int(line[1:4], 16)
    messageLength = int(line[4])
    messageDataArr = [int(line[5 + 2*i : 5 + 2*i + 2], 16) for i in range(messageLength)]

    return can.Message(
        arbitration_id=messageID,
        data=messageDataArr,
        is_extended_id=False,
        timestamp=time.time()
    )


class CandapterSimulator(CandapterReader):
    def __init__(self, filepath, interval_ms=200):
        super().__init__()
        self.filepath = filepath
        self.interval = interval_ms / 1000
        self.lines = []
        self.index = 0

    def connect(self):
        with open(self.filepath, "r") as f:
            self.lines = [line.strip() for line in f if line.strip()]
        self.candapter_connected = True
        print(f"[SIM] Loaded {len(self.lines)} SLCAN packets")

    def read(self):
        if not self.candapter_connected or not self.lines:
            return None

        slcan_line = self.lines[self.index]
        self.index = (self.index + 1) % len(self.lines)
        msg = slcan_to_can_message(slcan_line)
        time.sleep(self.interval)
        return msg