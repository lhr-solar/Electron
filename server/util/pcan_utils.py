"""
Utilities for PEAK PCAN: channel detection and prerequisite checking.
"""
import platform
import logging

logger = logging.getLogger(__name__)

# Per-OS prerequisite hints
PREREQ_HINTS = {
    "Windows": (
        "PEAK PCAN drivers and PCAN-Basic API required. "
        "Install from: https://www.peak-system.com/quick/DrvSetup"
    ),
    "Linux": (
        "PEAK Linux driver or SocketCAN required. "
        "See: https://www.peak-system.com/fileadmin/media/linux/"
    ),
    "Darwin": (
        "MacCAN PCBUSB library required for macOS. "
        "See: https://www.peak-system.com/MacCAN.336.0.html"
    ),
}


def check_pcan_prerequisites() -> dict:
    """
    Check if PCAN/PEAK support is available. Returns {ok, message, platform, hint}.
    """
    os_name = platform.system()
    hint = PREREQ_HINTS.get(os_name, "PEAK PCAN drivers required for your platform.")

    try:
        import can
        from can.interfaces.pcan import PcanBus
    except ImportError as e:
        return {
            "ok": False,
            "message": str(e),
            "platform": os_name,
            "hint": hint,
        }

    # Try to detect or open a channel
    try:
        configs = can.detect_available_configs(interfaces=["pcan"])
        if configs:
            return {
                "ok": True,
                "message": f"Found {len(configs)} PCAN channel(s)",
                "platform": os_name,
                "hint": None,
            }
        # No configs found - might still work if user specifies channel manually
        return {
            "ok": True,
            "message": "PCAN API available. No devices detected; ensure PCAN-USB is connected.",
            "platform": os_name,
            "hint": hint,
        }
    except Exception as e:
        return {
            "ok": False,
            "message": str(e),
            "platform": os_name,
            "hint": hint,
        }


def get_available_pcan_channels() -> list[dict]:
    """
    Return list of available PCAN channel configs for UI selection.
    Each dict has: channel, bitrate (if detected), interface, etc.
    """
    try:
        import can
        detect = getattr(can, "detect_available_configs", None)
        if not detect:
            raise AttributeError("detect_available_configs not available")
        configs = detect(interfaces=["pcan"])
        result = []
        for cfg in configs:
            chan = cfg.get("channel", cfg.get("interface", "unknown"))
            result.append({
                "channel": chan,
                "bitrate": cfg.get("bitrate", 500000),
                "interface": cfg.get("interface", "pcan"),
            })
        if result:
            return result
    except Exception as e:
        logger.warning("Could not detect PCAN channels: %s", e)
    # Fallback: common USB channel names
    return [
        {"channel": "PCAN_USBBUS1", "bitrate": 500000},
        {"channel": "PCAN_USBBUS2", "bitrate": 500000},
    ]
