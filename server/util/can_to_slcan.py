"""Convert can.Message to SLCAN format string for downstream processing."""
import binascii


def message_to_slcan(msg) -> str:
    """
    Convert a can.Message to SLCAN ASCII format.
    Standard: t + 3 hex ID + 1 hex DLC + data hex
    Extended: T + 8 hex ID + 1 hex DLC + data hex
    """
    dlc = min(len(msg.data), 8)
    data_hex = binascii.hexlify(msg.data[:dlc]).decode("ascii").upper()
    if msg.is_extended_id:
        frame_type = "T"
        id_hex = f"{msg.arbitration_id:08X}"
    else:
        frame_type = "t"
        id_hex = f"{msg.arbitration_id:03X}"
    return f"{frame_type}{id_hex}{dlc:X}{data_hex}"
