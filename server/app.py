import asyncio
import json
import logging
import os
import shutil
import time
from collections import OrderedDict
import urllib.request
import urllib.error
import uvicorn
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import socketio
from influxdb_client import InfluxDBClient
from influxdb_client.client.exceptions import InfluxDBError
import serial.tools.list_ports

from server.config import settings
from server.services.telemetry import telemetry_service
from server.util.influx_writer import InfluxDBWriter
from server.util.analytics_buffer import analytics_buffer
from server.util.analytics_validate import validate_views
from server.util.vehicle_dbc_resolve import (
    get_vehicle_folders,
    resolve_vehicle as _resolve_vehicle,
    resolve_dbc_paths,
)

# --- Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger(__name__)
influx_client: InfluxDBClient | None = None

# Path to built static client (project root / client / dist)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATIC_CLIENT_DIR = os.path.join(_PROJECT_ROOT, "client", "dist")
TRUTHY_VALUES = {"1", "true", "yes", "on"}
SERVE_STATIC_CLIENT = os.environ.get("SERVE_STATIC_CLIENT", "1").strip().lower() in TRUTHY_VALUES
STATUS_HEALTH_TTL_SEC = float(os.environ.get("STATUS_HEALTH_TTL_SEC", "2.0"))

def _parse_origins(raw: str):
    raw = (raw or "*").strip()
    if raw == "*":
        return ["*"]
    return [x.strip() for x in raw.split(",") if x.strip()]

HTTP_CORS_ORIGINS = _parse_origins(os.environ.get("CORS_ORIGINS", "*"))
ALLOW_CREDENTIALS = HTTP_CORS_ORIGINS != ["*"]
SOCKET_CORS_ORIGINS = os.environ.get("SOCKET_CORS_ORIGINS", os.environ.get("CORS_ORIGINS", "*")).strip()
if SOCKET_CORS_ORIGINS != "*":
    SOCKET_CORS_ORIGINS = [x.strip() for x in SOCKET_CORS_ORIGINS.split(",") if x.strip()]

_status_health_cache = {
    "checked_at": 0.0,
    "influx_connected": False,
    "grafana_active": False,
}

# --- Pydantic Models ---
class Bucket(BaseModel): name: str
class ConfigUpdate(BaseModel): key: str; value: str | int | list | None
class FileAction(BaseModel): filename: str
class FileRename(BaseModel): old_name: str; new_name: str
class VehicleCreate(BaseModel): name: str
class TcpConfigCreate(BaseModel): name: str; ip: str; port: int
class TcpConfigUpdate(BaseModel): name: str; ip: str; port: int
class TcpTestRequest(BaseModel): ip: str; port: int = 8187


class AnalyticsStatRequest(BaseModel):
    time_range: str = "-1h"
    vehicle: str
    message_id: int
    field: str
    stat: str
    array_mode: str | None = None
    array_index: int | None = None


class AnalyticsSeriesRequest(BaseModel):
    time_range: str = "-1h"
    vehicle: str
    message_id: int
    field: str
    array_index: int | None = None
    limit: int = 5000


class AnalyticsPivotRequest(BaseModel):
    time_range: str = "-1h"
    vehicle: str
    message_id: int
    fields: list[str]
    array_index: int | None = None
    limit: int = 3000


class AnalyticsValidateRequest(BaseModel):
    version: int = 1
    views: list[dict] = Field(default_factory=list)


class EditorSignal(BaseModel):
    name: str
    start: int
    length: int
    byte_order: str = "little_endian"
    is_signed: bool = False
    scale: float = 1.0
    offset: float = 0.0
    minimum: float | None = None
    maximum: float | None = None
    unit: str | None = None
    receivers: list[str] = Field(default_factory=list)
    choices: dict[str, str] | None = None
    comment: str | None = None
    is_multiplexer: bool = False
    multiplexer_ids: list[int] | None = None
    multiplexer_signal: str | None = None


class EditorSignalGroup(BaseModel):
    name: str
    repetitions: int = 1
    signal_names: list[str] = Field(default_factory=list)


class EditorMessage(BaseModel):
    id: int
    name: str
    length: int
    is_extended_frame: bool = False
    is_fd: bool = False
    cycle_time: int | None = None
    senders: list[str] = Field(default_factory=list)
    comment: str | None = None
    protocol: str | None = None
    signals: list[EditorSignal] = Field(default_factory=list)
    signal_groups: list[EditorSignalGroup] = Field(default_factory=list)


class EditorNetwork(BaseModel):
    name: str
    nodes: list[str] = Field(default_factory=list)
    messages: list[EditorMessage] = Field(default_factory=list)


class EditorDatabasePayload(BaseModel):
    version: int = 1
    networks: list[EditorNetwork] = Field(default_factory=list)


class MdcSaveRequest(BaseModel):
    vehicle: str | None = None
    source_filename: str | None = None
    model: EditorDatabasePayload


class MdcExportRequest(BaseModel):
    vehicle: str
    base_name: str
    model: EditorDatabasePayload

# --- Helper Functions ---
def move_to_trash(directory: str, filename: str):
    trash_dir = settings.TRASH_DIR
    dated_trash_folder = os.path.join(trash_dir, datetime.now().strftime('%Y-%m-%d'))
    os.makedirs(dated_trash_folder, exist_ok=True)
    source_path = os.path.join(directory, filename)
    if os.path.exists(source_path):
        base, ext = os.path.splitext(filename)
        timestamp = datetime.now().strftime('%H%M%S_%f')
        new_filename = f"{base}_{timestamp}{ext}"
        destination_path = os.path.join(dated_trash_folder, new_filename)
        shutil.move(source_path, destination_path)
        logger.info(f"Moved '{source_path}' to '{destination_path}'")

def _check_grafana_health():
    base = os.environ.get("GRAFANA_URL", "http://127.0.0.1:3000")
    for path in ("/healthz", "/api/health", "/"):
        try:
            req = urllib.request.Request(base.rstrip("/") + path)
            with urllib.request.urlopen(req, timeout=3) as r:
                if 200 <= r.status < 400:
                    return True
        except (urllib.error.URLError, OSError):
            pass
    return False


def _resolve_existing_dbc_path(vehicle: str, filename: str):
    """Resolve to an existing .dbc file. Embedded-Sharepoint path wins when both exist (same as runtime)."""
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name in (".", "..") or any(sep in safe_name for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    if not safe_name.lower().endswith(".dbc"):
        safe_name = f"{safe_name}.dbc"

    _, emb_actual, local_actual = _resolve_vehicle(vehicle, settings.DBC_DIR)
    if emb_actual is None and local_actual is None:
        raise HTTPException(status_code=404, detail="Vehicle not found.")

    if emb_actual is not None:
        emb_dir = os.path.join(settings.EMBEDDED_DBC_DIR, emb_actual)
        if os.path.isdir(emb_dir):
            for existing in os.listdir(emb_dir):
                if existing.lower() == safe_name.lower() and existing.lower().endswith(".dbc"):
                    return os.path.join(emb_dir, existing), existing

    if local_actual is not None:
        local_dir = os.path.join(settings.DBC_DIR, local_actual)
        if os.path.isdir(local_dir):
            for existing in os.listdir(local_dir):
                if existing.lower() == safe_name.lower() and existing.lower().endswith(".dbc"):
                    return os.path.join(local_dir, existing), existing

    raise HTTPException(status_code=404, detail="DBC not found.")


def _signal_to_editor(sig):
    conversion = getattr(sig, "conversion", None)
    scale = float(getattr(conversion, "scale", 1.0)) if conversion is not None else 1.0
    offset = float(getattr(conversion, "offset", 0.0)) if conversion is not None else 0.0
    choices_obj = getattr(conversion, "choices", None) if conversion is not None else None
    choices = None
    if choices_obj:
        choices = {str(int(k)): str(v) for k, v in choices_obj.items()}

    return {
        "name": sig.name,
        "start": int(getattr(sig, "start", 0)),
        "length": int(getattr(sig, "length", 1)),
        "byte_order": getattr(sig, "byte_order", "little_endian"),
        "is_signed": bool(getattr(sig, "is_signed", False)),
        "scale": scale,
        "offset": offset,
        "minimum": getattr(sig, "minimum", None),
        "maximum": getattr(sig, "maximum", None),
        "unit": getattr(sig, "unit", None),
        "receivers": list(getattr(sig, "receivers", []) or []),
        "choices": choices,
        "comment": getattr(sig, "comment", None),
        "is_multiplexer": bool(getattr(sig, "is_multiplexer", False)),
        "multiplexer_ids": list(getattr(sig, "multiplexer_ids", []) or []) or None,
        "multiplexer_signal": getattr(sig, "multiplexer_signal", None),
    }


def _message_to_editor(msg):
    groups = []
    for grp in (getattr(msg, "signal_groups", None) or []):
        groups.append({
            "name": grp.name,
            "repetitions": int(getattr(grp, "repetitions", 1) or 1),
            "signal_names": list(getattr(grp, "signal_names", []) or []),
        })
    return {
        "id": int(msg.frame_id),
        "name": msg.name,
        "length": int(msg.length),
        "is_extended_frame": bool(getattr(msg, "is_extended_frame", False)),
        "is_fd": bool(getattr(msg, "is_fd", False)),
        "cycle_time": getattr(msg, "cycle_time", None),
        "senders": list(getattr(msg, "senders", []) or []),
        "comment": getattr(msg, "comment", None),
        "protocol": getattr(msg, "protocol", None),
        "signals": [_signal_to_editor(sig) for sig in (msg.signals or [])],
        "signal_groups": groups,
    }


def _build_editor_model(db):
    grouped = {}
    network_nodes = {}
    global_nodes = {str(getattr(n, "name", "")).strip() for n in (getattr(db, "nodes", None) or [])}
    global_nodes.discard("")
    for msg in db.messages:
        network = (getattr(msg, "bus_name", None) or "CAN").strip() or "CAN"
        grouped.setdefault(network, []).append(_message_to_editor(msg))
        nodes = network_nodes.setdefault(network, set())
        for snd in (getattr(msg, "senders", None) or []):
            if snd:
                nodes.add(str(snd))
        for sig in (getattr(msg, "signals", None) or []):
            for rcv in (getattr(sig, "receivers", None) or []):
                if rcv:
                    nodes.add(str(rcv))
    networks = []
    for network_name in sorted(grouped.keys(), key=lambda x: x.lower()):
        messages = sorted(grouped[network_name], key=lambda m: (m["id"], m["name"].lower()))
        nodes = sorted(set(network_nodes.get(network_name, set())) | global_nodes, key=str.lower)
        networks.append({"name": network_name, "nodes": nodes, "messages": messages})
    return {"version": 1, "networks": networks}


def _safe_filename(name: str, ext: str):
    base = os.path.basename((name or "").strip())
    if not base or base in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    if any(sep in base for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    if not base.lower().endswith(ext.lower()):
        base = base + ext
    return base


def _safe_slug(name: str):
    cleaned = "".join(ch if (ch.isalnum() or ch in ("-", "_")) else "_" for ch in (name or "").strip())
    cleaned = cleaned.strip("_")
    return cleaned or "network"

async def _get_cached_health(force_refresh: bool = False):
    now = time.monotonic()
    expired = (now - _status_health_cache["checked_at"]) >= STATUS_HEALTH_TTL_SEC
    if force_refresh or expired:
        _status_health_cache["influx_connected"] = (
            await asyncio.to_thread(influx_client.ping) if influx_client else False
        )
        _status_health_cache["grafana_active"] = await asyncio.to_thread(_check_grafana_health)
        _status_health_cache["checked_at"] = now
    return _status_health_cache["influx_connected"], _status_health_cache["grafana_active"]

async def build_status_payload(force_health_refresh: bool = False):
    parser_status = telemetry_service.get_parser_status()
    influx_connected, grafana_active = await _get_cached_health(force_refresh=force_health_refresh)
    return {
        "service_running": telemetry_service.running,
        "influx_connected": influx_connected,
        "grafana_active": grafana_active,
        "grafana_url": os.environ.get("GRAFANA_URL", "http://127.0.0.1:3000"),
        "parser_status": parser_status.get("status", "idle") if parser_status else "idle",
        "parser_connection_state": parser_status.get("connection_state") if parser_status else None,
        "error_message": parser_status.get("error_message") if parser_status else None,
        "dbc_errors": telemetry_service.get_dbc_errors(),
        "influx_bucket": settings.get_bucket(),
        "vehicle": settings.COMMON_CONFIG.get("DBC_VEHICLE", ""),
    }

async def emit_status_update(force_health_refresh: bool = False, to: str | None = None):
    status = await build_status_payload(force_health_refresh=force_health_refresh)
    if to:
        await sio.emit("status", status, to=to)
        return
    await sio.emit("status", status)

# --- Background Tasks & Lifespan ---
async def send_status_updates(sio: socketio.AsyncServer):
    while True:
        await emit_status_update()
        await asyncio.sleep(0.25)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global influx_client
    logger.info("--- Application starting up... ---")
    logger.info("Runtime directories: DBC=%s MDC=%s LOG=%s TRASH=%s EMBEDDED=%s",
                settings.DBC_DIR, settings.MDC_DIR, settings.LOG_DIR, settings.TRASH_DIR, settings.EMBEDDED_DBC_DIR)
    
    # Check and create directories
    for dir_key in ["DBC_DIR", "MDC_DIR", "LOG_DIR", "TRASH_DIR"]:
        dir_path = getattr(settings, dir_key)
        if not os.path.exists(dir_path):
            logger.warning(f"Directory '{dir_path}' not found. Creating it.")
            os.makedirs(dir_path)
        else:
            logger.info(f"Directory '{dir_path}' found.")

    config = settings.get_effective_config()
    try:
        influx_client = InfluxDBClient(url=config['INFLUX_URL'], token=config['INFLUX_TOKEN'], org=config['INFLUX_ORG'])
        if not influx_client.ping(): raise Exception("Ping failed")
        logger.info("InfluxDB connection successful.")
    except Exception as e:
        logger.error(f"Failed to connect to InfluxDB on startup: {e}")
        influx_client = None
    
    status_task = asyncio.create_task(send_status_updates(sio))
    yield
    logger.info("--- Application shutting down... ---")
    status_task.cancel()
    if telemetry_service.running: await telemetry_service.stop()
    if influx_client: influx_client.close()

# --- FastAPI App ---
app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=HTTP_CORS_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Endpoints ---
def _validate_and_raise():
    """Run start validation; raise HTTPException if invalid so caller does not start the service."""
    from server.util.start_validation import validate_start_config
    title, detail = validate_start_config()
    if title and detail:
        raise HTTPException(status_code=400, detail=f"{title}: {detail}")

@app.post("/api/start")
async def start_service():
    if telemetry_service.running:
        raise HTTPException(status_code=400, detail="Service is already running.")
    _validate_and_raise()
    config = settings.get_effective_config()
    if not config:
        raise HTTPException(status_code=500, detail="Invalid configuration.")
    influx_write_enabled = config.get("INFLUX_WRITE_ENABLED", True)
    if influx_write_enabled and not influx_client:
        raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    writer: InfluxDBWriter | None = None
    if influx_write_enabled:
        target_bucket = config.get("INFLUX_BUCKET", "debug")
        writer = InfluxDBWriter(client=influx_client, bucket=target_bucket)
    await telemetry_service.start(writer, sio=sio)
    await emit_status_update(force_health_refresh=True)
    return {"message": "Telemetry service started." if telemetry_service.running else "Telemetry service did not start."}

@app.post("/api/stop")
async def stop_service():
    if not telemetry_service.running: raise HTTPException(status_code=400, detail="Service is not running.")
    await telemetry_service.stop()
    await emit_status_update(force_health_refresh=True)
    return {"message": "Telemetry service stopped."}

@app.post("/api/restart")
async def restart_service():
    """Stop the service if running, then start with current config."""
    config = settings.get_effective_config()
    if not config: raise HTTPException(status_code=500, detail="Invalid configuration.")
    influx_write_enabled = config.get("INFLUX_WRITE_ENABLED", True)
    if influx_write_enabled and not influx_client:
        raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    _validate_and_raise()
    if telemetry_service.running:
        await telemetry_service.stop()
    writer: InfluxDBWriter | None = None
    if influx_write_enabled:
        target_bucket = config.get("INFLUX_BUCKET", "debug")
        writer = InfluxDBWriter(client=influx_client, bucket=target_bucket)
    await telemetry_service.start(writer, sio=sio)
    await emit_status_update(force_health_refresh=True)
    return {"message": "Telemetry service restarted."}

@app.get("/api/health")
async def api_health():
    status = await build_status_payload(force_health_refresh=False)
    return {"ok": True, "status": status}

@app.get("/api/runtime-info")
async def runtime_info():
    return {
        "serve_static_client": SERVE_STATIC_CLIENT,
        "data_dirs": {
            "app_data_dir": settings.APP_DATA_DIR,
            "dbc_dir": settings.DBC_DIR,
            "log_dir": settings.LOG_DIR,
            "trash_dir": settings.TRASH_DIR,
        },
    }

@app.get("/api/config")
async def get_config():
    data = settings.get_effective_config()
    if data is not None:
        data["default_dbc_vehicle"] = settings.DEFAULT_DBC_VEHICLE
        # If InfluxDB is not connected, default writes to disabled in the UI
        if not influx_client:
            data["INFLUX_WRITE_ENABLED"] = False
    return data

@app.post("/api/config")
async def update_config(update: ConfigUpdate):
    if telemetry_service.running: raise HTTPException(status_code=400, detail="Cannot update configuration while service is running.")
    if not settings.update_setting(update.key, update.value):
        raise HTTPException(status_code=404, detail=f"Setting '{update.key}' not found or invalid.")
    return {"message": "Configuration updated successfully."}

@app.get("/api/dbc/vehicles")
async def list_dbc_vehicles():
    """List vehicle folders combining local DBC_DIR and Embedded-Sharepoint.
    Cross-referenced by case-insensitive + trim; Embedded-Sharepoint spelling preferred.
    """
    display, _, _ = get_vehicle_folders(settings.DBC_DIR)
    return sorted(display.values())

@app.get("/api/dbc/vehicles/{vehicle}/files")
async def list_dbc_files(vehicle: str):
    """List .dbc files for a vehicle from Embedded-Sharepoint and local DBC_DIR.
    Vehicle is matched case-insensitively with trim; Embedded-Sharepoint files take priority when names collide.
    Returns list of {name, source} where source is 'embedded' or 'local'.
    """
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    _, emb_actual, loc_actual = _resolve_vehicle(vehicle, settings.DBC_DIR)
    if emb_actual is None and loc_actual is None:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    result = {}
    if emb_actual is not None:
        emb_dir = os.path.join(settings.EMBEDDED_DBC_DIR, emb_actual)
        if os.path.isdir(emb_dir):
            for f in os.listdir(emb_dir):
                full = os.path.join(emb_dir, f)
                if f.lower().endswith(".dbc") and os.path.isfile(full):
                    key = f.lower()
                    result[key] = {"name": f, "source": "embedded"}
    if loc_actual is not None:
        loc_dir = os.path.join(settings.DBC_DIR, loc_actual)
        if os.path.isdir(loc_dir):
            for f in os.listdir(loc_dir):
                full = os.path.join(loc_dir, f)
                if f.lower().endswith(".dbc") and os.path.isfile(full):
                    key = f.lower()
                    if key not in result:
                        result[key] = {"name": f, "source": "local"}
    return [result[k] for k in sorted(result.keys())]

@app.get("/api/serial-ports")
async def list_serial_ports():
    ports = await asyncio.to_thread(serial.tools.list_ports.comports)
    return [{"device": port.device, "description": port.description} for port in ports]

@app.get("/api/pcan/channels")
async def list_pcan_channels():
    from server.util.pcan_utils import get_available_pcan_channels
    return await asyncio.to_thread(get_available_pcan_channels)

@app.get("/api/pcan/prerequisites")
async def check_pcan_prerequisites():
    from server.util.pcan_utils import check_pcan_prerequisites
    return await asyncio.to_thread(check_pcan_prerequisites)

@app.get("/api/tcp/configs")
async def list_tcp_configs():
    from server.util.tcp_configs import list_configs
    return await asyncio.to_thread(list_configs)

@app.post("/api/tcp/configs")
async def create_tcp_config(body: TcpConfigCreate):
    from server.util.tcp_configs import add_config
    return await asyncio.to_thread(add_config, body.name, body.ip, body.port)

@app.put("/api/tcp/configs/{config_id}")
async def update_tcp_config(config_id: str, body: TcpConfigUpdate):
    from server.util.tcp_configs import update_config
    result = await asyncio.to_thread(update_config, config_id, body.name, body.ip, body.port)
    if not result:
        raise HTTPException(status_code=404, detail="TCP config not found.")
    return result

@app.delete("/api/tcp/configs/{config_id}")
async def delete_tcp_config(config_id: str):
    from server.util.tcp_configs import delete_config
    if not await asyncio.to_thread(delete_config, config_id):
        raise HTTPException(status_code=404, detail="TCP config not found.")
    return {"message": "Deleted."}

@app.post("/api/tcp/test")
async def test_tcp_connection(body: TcpTestRequest):
    """Test TCP connectivity to the given IP and port. Attempts a real socket connection."""
    ip = body.ip.strip()
    if not ip:
        return {"ok": False, "message": "IP required."}
    port = body.port
    if not (1 <= port <= 65535):
        return {"ok": False, "message": "Port must be between 1 and 65535."}
    try:
        conn = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=5.0
        )
        conn[0].close()
        conn[1].close()
        return {"ok": True, "message": f"TCP connection to {ip}:{port} successful."}
    except asyncio.TimeoutError:
        return {"ok": False, "message": "Connection timed out."}
    except OSError as e:
        return {"ok": False, "message": str(e) or "Connection failed."}

@app.get("/api/files/{directory_key}")
async def list_files(directory_key: str):
    # Map the URL parameter to the config attribute name
    config_attr = f"{directory_key.upper()}_DIR"
    dir_path = getattr(settings, config_attr, None)
    
    logger.info(f"Listing files for key '{directory_key}' -> Config Attr: '{config_attr}' -> Path: '{dir_path}'")

    if not dir_path:
        logger.error(f"Invalid directory key: {directory_key}")
        return []
        
    if not os.path.exists(dir_path):
        logger.warning(f"Directory not found: {dir_path}")
        return []
        
    files = [f for f in os.listdir(dir_path) if os.path.isfile(os.path.join(dir_path, f))]
    logger.info(f"Found {len(files)} files in {dir_path}")
    return files

@app.post("/api/files/{directory_key}")
async def upload_file(directory_key: str, file: UploadFile = File(...), overwrite: bool = False):
    dir_path = getattr(settings, f"{directory_key.upper()}_DIR", None)
    if not dir_path: raise HTTPException(status_code=404, detail="Directory not found.")
    os.makedirs(dir_path, exist_ok=True)
    safe_name = os.path.basename(file.filename)
    if not safe_name or safe_name in (".", "..") or any(sep in safe_name for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    file_path = os.path.join(dir_path, safe_name)
    if os.path.exists(file_path) and not overwrite:
        raise HTTPException(status_code=409, detail=f"File '{safe_name}' already exists. Please confirm to overwrite.")
    if os.path.exists(file_path) and overwrite:
        move_to_trash(dir_path, safe_name)
    with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
    return {"filename": safe_name}

@app.delete("/api/files/{directory_key}")
async def delete_file_endpoint(directory_key: str, action: FileAction):
    dir_path = getattr(settings, f"{directory_key.upper()}_DIR", None)
    if not dir_path: raise HTTPException(status_code=404, detail="Directory not found.")
    safe_name = os.path.basename(action.filename)
    if not safe_name or safe_name in (".", "..") or any(sep in safe_name for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    file_path = os.path.join(dir_path, safe_name)
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="File not found.")
    move_to_trash(dir_path, safe_name)
    return {"message": f"File '{safe_name}' moved to trash."}

@app.put("/api/files/{directory_key}/rename")
async def rename_file_endpoint(directory_key: str, body: FileRename):
    dir_path = getattr(settings, f"{directory_key.upper()}_DIR", None)
    if not dir_path: raise HTTPException(status_code=404, detail="Directory not found.")
    old_name = os.path.basename(body.old_name)
    new_name = os.path.basename(body.new_name)
    for nm in (old_name, new_name):
        if not nm or nm in (".", "..") or any(sep in nm for sep in ("/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid filename.")
    old_path = os.path.join(dir_path, old_name)
    new_path = os.path.join(dir_path, new_name)
    if not os.path.exists(old_path): raise HTTPException(status_code=404, detail="File not found.")
    if os.path.exists(new_path): raise HTTPException(status_code=409, detail=f"File '{new_name}' already exists.")
    os.rename(old_path, new_path)
    return {"message": f"Renamed '{old_name}' to '{new_name}'."}

@app.post("/api/dbc/vehicles")
async def create_vehicle(body: VehicleCreate):
    name = body.name.strip()
    if not name or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    _, emb_e, loc_e = _resolve_vehicle(name, settings.DBC_DIR)
    if emb_e is not None or loc_e is not None:
        raise HTTPException(status_code=409, detail=f"Vehicle '{name}' already exists.")
    os.makedirs(settings.EMBEDDED_DBC_DIR, exist_ok=True)
    path = os.path.join(settings.EMBEDDED_DBC_DIR, name)
    if os.path.exists(path):
        raise HTTPException(status_code=409, detail=f"Vehicle '{name}' already exists.")
    os.makedirs(path)
    return {"message": f"Vehicle '{name}' created."}

@app.post("/api/dbc/vehicles/{vehicle}/files")
async def upload_dbc_file(vehicle: str, file: UploadFile = File(...), overwrite: bool = False):
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    display, emb_actual, local_actual = _resolve_vehicle(vehicle, settings.DBC_DIR)
    if display is None:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    if emb_actual is not None:
        dir_path = os.path.join(settings.EMBEDDED_DBC_DIR, emb_actual)
    else:
        local_dir_name = local_actual if local_actual is not None else display
        dir_path = os.path.join(settings.DBC_DIR, local_dir_name)
    if not os.path.isdir(dir_path):
        os.makedirs(dir_path, exist_ok=True)
    safe_name = os.path.basename(file.filename)
    if not safe_name or safe_name in (".", "..") or any(sep in safe_name for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    file_path = os.path.join(dir_path, safe_name)
    from fastapi import status as http_status
    existing = await list_dbc_files(vehicle)
    lower_names = {entry["name"].lower() for entry in existing}
    if safe_name.lower() in lower_names:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"DBC '{safe_name}' already exists (including Embedded-Sharepoint).",
        )
    if os.path.exists(file_path) and not overwrite:
        raise HTTPException(status_code=http_status.HTTP_409_CONFLICT, detail=f"File '{safe_name}' already exists.")
    if os.path.exists(file_path) and overwrite:
        move_to_trash(dir_path, safe_name)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": safe_name}

@app.delete("/api/dbc/vehicles/{vehicle}/files")
async def delete_dbc_file(vehicle: str, action: FileAction):
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    safe_name = os.path.basename(action.filename)
    if not safe_name or safe_name in (".", "..") or any(sep in safe_name for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    dbc_path, actual = _resolve_existing_dbc_path(vehicle, safe_name)
    dir_path = os.path.dirname(dbc_path)
    move_to_trash(dir_path, actual)
    return {"message": f"File '{actual}' moved to trash."}

@app.put("/api/dbc/vehicles/{vehicle}/files/rename")
async def rename_dbc_file(vehicle: str, body: FileRename):
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    old_name = os.path.basename(body.old_name)
    new_name = os.path.basename(body.new_name)
    for nm in (old_name, new_name):
        if not nm or nm in (".", "..") or any(sep in nm for sep in ("/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid filename.")
    if not new_name.lower().endswith(".dbc"):
        new_name = f"{new_name}.dbc"
    dbc_path, old_actual = _resolve_existing_dbc_path(vehicle, old_name)
    dir_path = os.path.dirname(dbc_path)
    old_path = os.path.join(dir_path, old_actual)
    new_path = os.path.join(dir_path, new_name)
    if not os.path.exists(old_path):
        raise HTTPException(status_code=404, detail="File not found.")
    existing = await list_dbc_files(vehicle)
    lower_names = {entry["name"].lower() for entry in existing}
    if new_name.lower() in lower_names and new_name.lower() != old_actual.lower():
        raise HTTPException(status_code=409, detail=f"DBC '{new_name}' already exists.")
    os.rename(old_path, new_path)
    return {"message": f"Renamed '{old_actual}' to '{new_name}'."}


@app.get("/api/dbc/vehicles/{vehicle}/files/{filename}/schema")
async def get_dbc_schema(vehicle: str, filename: str):
    """Return DBC schema (messages and signals) for a given vehicle + DBC filename."""
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name in (".", "..") or any(sep in safe_name for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    # Resolve full path using the same vehicle resolution / embedded precedence as runtime
    paths = resolve_dbc_paths(vehicle, [safe_name], settings.DBC_DIR)
    if not paths:
        raise HTTPException(status_code=404, detail="DBC not found.")
    dbc_path = paths[0]
    if not os.path.isfile(dbc_path):
        raise HTTPException(status_code=404, detail="DBC not found.")
    try:
        import cantools
        db = cantools.database.load_file(dbc_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load DBC: {e!s}")

    def _infer_signal_data_type(sig):
        """Infer a human-friendly DBC data type label for UI display.

        cantools Signal exposes flags like is_float / is_signed; we use those plus
        signal bit length to produce labels like uint8/int16/float32, etc.
        """
        length_bits = getattr(sig, "length", None)
        try:
            length_bits = int(length_bits) if length_bits is not None else None
        except Exception:
            length_bits = None

        is_float = bool(getattr(sig, "is_float", False))
        is_signed = bool(getattr(sig, "is_signed", False))
        is_multiplexer = bool(getattr(sig, "is_multiplexer", False))

        if is_float:
            # Typical DBC float sizes are 16/32/64; fall back to float{bits}
            if length_bits == 16:
                base = "float16"
            elif length_bits == 32:
                base = "float32"
            elif length_bits == 64:
                base = "float64"
            else:
                base = f"float{length_bits}" if length_bits is not None else "float"
        else:
            if is_signed:
                base = f"int{length_bits}" if length_bits is not None else "int"
            else:
                base = f"uint{length_bits}" if length_bits is not None else "unsigned int"

        if is_multiplexer:
            base = f"mux({base})"

        return base

    messages = []
    for msg in db.messages:
        signals = []
        for sig in msg.signals:
            start_bit = getattr(sig, "start", None)
            length = getattr(sig, "length", None)
            bit_range = None
            if start_bit is not None and length is not None:
                bit_range = [int(start_bit), int(start_bit) + int(length) - 1]
            # Value table / choices (enumerations)
            choices = None
            try:
                if getattr(sig, "choices", None):
                    choices = {int(k): str(v) for k, v in sig.choices.items()}
            except Exception:
                choices = None
            signals.append(
                {
                    "name": sig.name,
                    "start_bit": start_bit,
                    "length": length,
                    "bit_range": bit_range,
                    "unit": sig.unit or None,
                    "scale": getattr(sig, "scale", None),
                    "offset": getattr(sig, "offset", None),
                    "min": getattr(sig, "minimum", None),
                    "max": getattr(sig, "maximum", None),
                    "choices": choices,
                    "data_type": _infer_signal_data_type(sig),
                }
            )
        idx_sig = None
        for sig in msg.signals:
            ln = sig.name.lower()
            if "idx" in ln or "index" in ln:
                idx_sig = sig.name
                break
        messages.append(
            {
                "id": msg.frame_id,
                "id_hex": f"0x{msg.frame_id:X}",
                "name": msg.name,
                "length": msg.length,
                "ecu": msg.senders[0] if msg.senders else None,
                "signals": signals,
                "array_index_signal": idx_sig,
            }
        )
    return {"vehicle": vehicle, "filename": safe_name, "path": dbc_path, "messages": messages}


@app.get("/api/dbc/vehicles/{vehicle}/files/{filename}/editor-model")
async def get_dbc_editor_model(vehicle: str, filename: str):
    """Return DBC as editor model (read-only import; use MDC for saving edits)."""
    dbc_path, safe_name = _resolve_existing_dbc_path(vehicle, filename)
    try:
        import cantools
        db = cantools.database.load_file(dbc_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load DBC: {e!s}")

    model = _build_editor_model(db)
    model.update({"vehicle": vehicle, "filename": safe_name, "path": dbc_path})
    return model


def _editor_model_to_cantools_messages(model: EditorDatabasePayload):
    from cantools.database.can import Message, Signal
    from cantools.database.can.node import Node
    from cantools.database.can.signal_group import SignalGroup
    from cantools.database.conversion import BaseConversion

    messages = []
    node_names = set()
    for net in model.networks:
        network_name = (net.name or "CAN").strip() or "CAN"
        for n in (net.nodes or []):
            n = str(n).strip()
            if n:
                node_names.add(n)
        for msg in net.messages:
            signals = []
            for sig in msg.signals:
                choices = None
                if sig.choices:
                    choices = OrderedDict()
                    for k, v in sig.choices.items():
                        choices[int(k)] = str(v)
                conversion = BaseConversion.factory(
                    scale=float(sig.scale),
                    offset=float(sig.offset),
                    choices=choices,
                )
                signals.append(
                    Signal(
                        name=sig.name,
                        start=int(sig.start),
                        length=int(sig.length),
                        byte_order=sig.byte_order,
                        is_signed=bool(sig.is_signed),
                        conversion=conversion,
                        minimum=sig.minimum,
                        maximum=sig.maximum,
                        unit=sig.unit,
                        comment=sig.comment,
                        receivers=list(sig.receivers or []),
                        is_multiplexer=bool(sig.is_multiplexer),
                        multiplexer_ids=list(sig.multiplexer_ids or []) or None,
                        multiplexer_signal=sig.multiplexer_signal,
                    )
                )
            signal_groups = []
            for grp in (msg.signal_groups or []):
                signal_groups.append(
                    SignalGroup(
                        name=grp.name,
                        repetitions=int(grp.repetitions or 1),
                        signal_names=list(grp.signal_names or []),
                    )
                )
            messages.append(
                Message(
                    frame_id=int(msg.id),
                    name=msg.name,
                    length=int(msg.length),
                    signals=signals,
                    cycle_time=msg.cycle_time,
                    senders=list(msg.senders or []),
                    comment=msg.comment,
                    is_extended_frame=bool(msg.is_extended_frame),
                    is_fd=bool(msg.is_fd),
                    bus_name=network_name,
                    protocol=msg.protocol,
                    signal_groups=signal_groups,
                )
            )
            for snd in (msg.senders or []):
                if snd:
                    node_names.add(str(snd))
            for sig in msg.signals:
                for rcv in (sig.receivers or []):
                    if rcv:
                        node_names.add(str(rcv))
    nodes = [Node(name=n) for n in sorted(node_names, key=str.lower)]
    return messages, nodes


@app.get("/api/mdc/files")
async def list_mdc_files():
    if not os.path.isdir(settings.MDC_DIR):
        return []
    files = []
    for f in os.listdir(settings.MDC_DIR):
        full = os.path.join(settings.MDC_DIR, f)
        if os.path.isfile(full) and f.lower().endswith(".mdc"):
            files.append(f)
    return sorted(files, key=str.lower)


@app.get("/api/mdc/files/{filename}")
async def load_mdc_file(filename: str):
    safe_name = _safe_filename(filename, ".mdc")
    path = os.path.join(settings.MDC_DIR, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="MDC file not found.")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise HTTPException(status_code=400, detail="Invalid MDC content.")
        data["filename"] = safe_name
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load MDC: {e!s}")


@app.put("/api/mdc/files/{filename}")
async def save_mdc_file(filename: str, body: MdcSaveRequest):
    safe_name = _safe_filename(filename, ".mdc")
    os.makedirs(settings.MDC_DIR, exist_ok=True)
    path = os.path.join(settings.MDC_DIR, safe_name)
    payload = {
        "type": "electron.mdc",
        "version": 1,
        "vehicle": body.vehicle,
        "source_filename": body.source_filename,
        "model": body.model.model_dump(),
    }
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return {"ok": True, "filename": safe_name, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save MDC: {e!s}")


@app.post("/api/mdc/export-dbc")
async def export_mdc_to_dbcs(body: MdcExportRequest):
    try:
        import cantools
        from cantools.database.can import Database
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DBC export dependencies unavailable: {e!s}")

    vehicle = body.vehicle.strip()
    if not vehicle or any(x in vehicle for x in ("..", "/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid vehicle.")

    base_name = _safe_slug(body.base_name)
    _, emb_actual, loc_actual = _resolve_vehicle(vehicle, settings.DBC_DIR)
    if emb_actual is None and loc_actual is None:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    if emb_actual is not None:
        export_dir = os.path.join(settings.EMBEDDED_DBC_DIR, emb_actual)
    else:
        export_dir = os.path.join(settings.DBC_DIR, loc_actual)
    os.makedirs(export_dir, exist_ok=True)

    exported = []
    for net in body.model.networks:
        net_name = (net.name or "CAN").strip() or "CAN"
        try:
            one_network_model = EditorDatabasePayload(version=1, networks=[net])
            messages, nodes = _editor_model_to_cantools_messages(one_network_model)
            db = Database(messages=messages, nodes=nodes, strict=True)
            out_name = f"{base_name}__{_safe_slug(net_name)}.dbc"
            out_path = os.path.join(export_dir, out_name)
            cantools.database.dump_file(db, out_path)
            exported.append({"network": net_name, "filename": out_name, "path": out_path})
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed exporting network '{net_name}': {e!s}")

    return {"ok": True, "vehicle": vehicle, "exported": exported}

@app.get("/api/influx/buckets")
async def list_buckets():
    if not influx_client: raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    return [b.name for b in influx_client.buckets_api().find_buckets().buckets]

@app.post("/api/influx/buckets")
async def create_bucket(bucket: Bucket):
    if not influx_client: raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    try:
        influx_client.buckets_api().create_bucket(bucket_name=bucket.name)
        return {"message": f"Bucket '{bucket.name}' created successfully."}
    except InfluxDBError as e:
        if "already exists" in str(e.message): raise HTTPException(status_code=409, detail=f"Bucket '{bucket.name}' already exists.")
        raise HTTPException(status_code=500, detail=str(e.message))

@app.delete("/api/influx/buckets/{name}")
async def delete_bucket(name: str):
    if not name.startswith("debug"): raise HTTPException(status_code=403, detail="Forbidden: Only buckets starting with 'debug' can be deleted.")
    if not influx_client: raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    bucket_to_delete = influx_client.buckets_api().find_bucket_by_name(name)
    if not bucket_to_delete: raise HTTPException(status_code=404, detail=f"Bucket '{name}' not found.")
    influx_client.buckets_api().delete_bucket(bucket_to_delete)
    return {"message": f"Bucket '{name}' deleted successfully."}


@app.post("/api/analytics/stat")
async def analytics_stat(body: AnalyticsStatRequest):
    """Min/max over in-memory samples captured while telemetry is running (not Influx)."""
    try:
        r = analytics_buffer.query_stat(
            range_value=body.time_range,
            vehicle=body.vehicle,
            message_id=body.message_id,
            field=body.field,
            stat=body.stat,
            array_mode=body.array_mode,
            array_index=body.array_index,
        )
        return {
            "value": r.value,
            "atIndex": r.at_index,
            "atTime": r.at_time,
            "samplesInAggregate": r.samples_in_aggregate,
        }
    except Exception:
        logger.debug("analytics_stat failed", exc_info=True)
        return {
            "value": None,
            "atIndex": None,
            "atTime": None,
            "samplesInAggregate": 0,
        }


@app.post("/api/analytics/series")
async def analytics_series(body: AnalyticsSeriesRequest):
    """Time series from in-memory ring buffer (live telemetry only)."""
    try:
        points, truncated = analytics_buffer.query_series(
            range_value=body.time_range,
            vehicle=body.vehicle,
            message_id=body.message_id,
            field=body.field,
            array_index=body.array_index,
            limit=body.limit,
        )
        return {"points": points, "truncated": truncated}
    except Exception:
        logger.debug("analytics_series failed", exc_info=True)
        return {"points": [], "truncated": False}


@app.post("/api/analytics/pivot")
async def analytics_pivot(body: AnalyticsPivotRequest):
    """Multi-field rows per decode time from the in-memory buffer."""
    try:
        rows, truncated = analytics_buffer.query_pivot_fields(
            range_value=body.time_range,
            vehicle=body.vehicle,
            message_id=body.message_id,
            fields=body.fields,
            array_index=body.array_index,
            limit=body.limit,
        )
        return {"rows": rows, "truncated": truncated}
    except Exception:
        logger.debug("analytics_pivot failed", exc_info=True)
        return {"rows": [], "truncated": False}


@app.post("/api/analytics/validate")
async def analytics_validate(body: AnalyticsValidateRequest):
    """Validate saved analytics views against DBC; returns errors and passing views only."""
    try:
        valid, errors = validate_views(body.views or [], dbc_dir=settings.DBC_DIR)
        return {
            "ok": len(errors) == 0,
            "validViews": valid,
            "errors": errors,
        }
    except Exception:
        logger.debug("analytics_validate failed", exc_info=True)
        return {"ok": False, "validViews": [], "errors": [{"path": "/", "detail": "Validation failed unexpectedly."}]}


# --- Socket.IO and Static Files ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=SOCKET_CORS_ORIGINS)
if SERVE_STATIC_CLIENT and os.path.isdir(STATIC_CLIENT_DIR):
    app.mount("/", StaticFiles(directory=STATIC_CLIENT_DIR, html=True), name="static")
    logger.info(f"Serving static client from {STATIC_CLIENT_DIR}")
else:
    logger.info("Static client serving is disabled or client build not found.")
asgi_app = socketio.ASGIApp(sio, app)

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")
    await emit_status_update(force_health_refresh=True, to=sid)
    cache = telemetry_service.get_cache()
    if cache:
        await sio.emit("signal_cache", cache, to=sid)

@sio.event
async def disconnect(sid): logger.info(f"Client disconnected: {sid}")

@sio.event
async def request_cache(sid):
    cache = telemetry_service.get_cache()
    await sio.emit("signal_cache", cache, to=sid)

@sio.event
async def reset_cache(sid):
    telemetry_service.message_cache = {}
    logger.info(f"Signal cache reset by client {sid}")

if __name__ == "__main__":
    uvicorn.run("server.app:asgi_app", host="0.0.0.0", port=4000, reload=True)
