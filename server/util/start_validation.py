"""
Pre-start validation: run before telemetry_service.start().
Returns (error_title, error_detail) if validation fails, else (None, None).
Caller should not start the service when validation fails.
"""
import os
import logging
from server.config import settings
from server.util.can_manager import CANManager
from server.util.vehicle_dbc_resolve import resolve_dbc_paths

logger = logging.getLogger(__name__)


def validate_start_config() -> tuple[str | None, str | None]:
    """
    Validate current config so the service can start. Returns (title, detail) on error, (None, None) if ok.
    """
    config = settings.get_effective_config()
    if not config:
        return "Invalid configuration", "No effective configuration. Check input mode and settings."

    input_mode = config.get("INPUT_MODE", "tcp")

    # DBC: must have at least one DBC file selected
    vehicle = config.get("DBC_VEHICLE", "").strip() or settings.DEFAULT_DBC_VEHICLE
    dbc_files = config.get("DBC_FILES") or []
    if not isinstance(dbc_files, list):
        dbc_files = [f for f in str(dbc_files).split(",") if f.strip()]
    dbc_paths = resolve_dbc_paths(vehicle, dbc_files, settings.DBC_DIR)
    if not dbc_paths:
        return "DBC error", f"No DBC files selected for vehicle '{vehicle}'."

    # Load DBC to surface load/parse errors before starting
    try:
        can_manager = CANManager(dbc_paths, config, influx_writer=None)
        errors = can_manager.get_errors()
        if errors:
            return "DBC error", " ".join(errors) if len(errors) <= 2 else (errors[0] + " … and " + str(len(errors) - 1) + " more.")
    except Exception as e:
        logger.exception("DBC validation: %s", e)
        return "DBC error", str(e)

    if input_mode == "pcan":
        from server.util.pcan_utils import check_pcan_prerequisites
        prereq = check_pcan_prerequisites()
        if not prereq.get("ok"):
            msg = prereq.get("message", "PCAN not available.")
            hint = prereq.get("hint", "")
            return "PCAN error", f"{msg}. {hint}".strip() if hint else msg

    if input_mode == "file":
        path = config.get("REPLAY_FILE_PATH") or ""
        if not path:
            return "File error", "No replay file path configured."
        if not os.path.isfile(path):
            return "File error", f"Replay file not found: {path}"

    if input_mode in ("tcp", "capnp_tcp"):
        if input_mode == "capnp_tcp":
            ip = (config.get("CAPNP_TCP_IP") or "").strip()
            port = config.get("CAPNP_TCP_PORT")
        else:
            ip = (config.get("TCP_IP") or "").strip()
            port = config.get("TCP_PORT")
        if not ip:
            return "Network error", "IP address is required for the selected network source."
        try:
            p = int(port)
            if p < 1 or p > 65535:
                raise ValueError
        except (TypeError, ValueError):
            return "Network error", "Valid TCP port (1–65535) is required."

    if input_mode in ("serial_canadapter", "serial_uart"):
        port = config.get("SERIAL_PORT") or ""
        if not port:
            return "Serial error", "No serial port selected."
        try:
            import serial.tools.list_ports
            ports = list(serial.tools.list_ports.comports())
            if not any(p.device == port for p in ports):
                return "Serial error", f"Serial port not found: {port}. Connect the device or choose another port."
        except Exception as e:
            logger.warning("Could not validate serial port: %s", e)

    return None, None
