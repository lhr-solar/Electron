import binascii
import can

def parse_slcan(line):
    """
    Parses a SLCAN string (e.g., 't12381122334455667788') into a can.Message object.
    """
    line = line.strip()
    if not line:
        return None

    try:
        frame_type = line[0]

        if frame_type == "t":  # Standard 11-bit
            can_id = int(line[1:4], 16)
            dlc = int(line[4], 16)
            data_hex = line[5:5 + dlc * 2]
            is_extended = False
        elif frame_type == "T":  # Extended 29-bit
            can_id = int(line[1:9], 16)
            dlc = int(line[9], 16)
            data_hex = line[10:10 + dlc * 2]
            is_extended = True
        else:
            return None

        data = binascii.unhexlify(data_hex)

        return can.Message(
            arbitration_id=can_id,
            data=data,
            is_extended_id=is_extended
        )
    except Exception:
        return None
