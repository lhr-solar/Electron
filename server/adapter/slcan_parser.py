import can
from typing import Optional, List


class SLCANParser:
    def __init__(self):
        self._buffer = ""
        self._messages: List[can.Message] = []

    def feed(self, data: str):
        """
        Feed new ASCII data into the parser. This should be called whenever
        new data is received from the socket.
        """
        self._buffer += data
        while '\r' in self._buffer:
            frame, self._buffer = self._buffer.split('\r', 1)
            msg = self._parse_frame(frame)
            if msg:
                self._messages.append(msg)

    def get_message(self) -> Optional[can.Message]:
        """Return the next parsed CAN message, or None if none available."""
        if self._messages:
            return self._messages.pop(0)
        return None

    def _parse_frame(self, frame: str) -> Optional[can.Message]:
        """
        Parse a single SLCAN frame and return a can.Message or None if invalid.
        """
        try:
            if frame.startswith('t'):  # standard ID
                can_id = int(frame[1:4], 16)
                dlc = int(frame[4])
                data = bytes(int(frame[i:i+2], 16) for i in range(5, 5 + 2 * dlc))
                return can.Message(arbitration_id=can_id, data=data, is_extended_id=False)

            elif frame.startswith('T'):  # extended ID
                can_id = int(frame[1:9], 16)
                dlc = int(frame[9])
                data = bytes(int(frame[i:i+2], 16) for i in range(10, 10 + 2 * dlc))
                return can.Message(arbitration_id=can_id, data=data, is_extended_id=True)

            # Optionally: add support for 'r', 'R' (RTR), error frames, etc.
        except Exception as e:
            print(f"[SLCANParser] Failed to parse frame: '{frame}' — {e}")
        return None
