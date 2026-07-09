import asyncio
import json
import logging
import os
import shutil
import time
import urllib.request
import urllib.error
import uvicorn
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, RedirectResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware
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
    resolve_all_dbc_paths,
)
from server.util.reverse_proxy import (
    proxy_to_upstream,
    grafana_disconnected,
    influx_disconnected,
    GRAFANA_UPSTREAM,
    INFLUX_UPSTREAM,
)
from server.util.manage_auth import (
    IS_SERVER_MODE,
    MANAGE_PASSWORD,
    create_session_token,
    password_ok,
    is_authenticated,
    require_manage_auth,
    set_session_cookie,
    clear_session_cookie,
    path_requires_manage_auth,
    socket_manage_authenticated,
)
import httpx

# --- Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger(__name__)
influx_client: InfluxDBClient | None = None

# Path to built static client (project root / client / dist)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATIC_CLIENT_DIR = os.path.join(_PROJECT_ROOT, "client", "dist")
FAVICON_PATH = os.path.join(_PROJECT_ROOT, "client", "public", "favicon.svg")
GRAFANA_PREFIX = "/grafana"
INFLUX_PREFIX = "/influx"
PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
RESERVED_SPA_PREFIXES = ("api", "grafana", "influx", "socket.io", "assets", "manage")
TRUTHY_VALUES = {"1", "true", "yes", "on"}
SERVE_STATIC_CLIENT = os.environ.get("SERVE_STATIC_CLIENT", "1").strip().lower() in TRUTHY_VALUES
STATUS_HEALTH_TTL_SEC = float(os.environ.get("STATUS_HEALTH_TTL_SEC", "2.0"))
STATUS_HEALTH_TIMEOUT_SEC = float(os.environ.get("STATUS_HEALTH_TIMEOUT_SEC", "0.4"))

def _parse_origins(raw: str):
    raw = (raw or "*").strip()
    if raw == "*":
        return ["*"]
    return [x.strip() for x in raw.split(",") if x.strip()]

HTTP_CORS_ORIGINS = _parse_origins(os.environ.get("CORS_ORIGINS", "*"))
# Cookie auth / credentials:include cannot use Access-Control-Allow-Origin: *.
if HTTP_CORS_ORIGINS == ["*"]:
    HTTP_CORS_ORIGINS = [
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:4000",
        "http://127.0.0.1:4000",
    ]
ALLOW_CREDENTIALS = True
# Keep Socket.IO at "*" when unset. Remapping to the HTTP localhost list breaks
# same-origin public hosts (e.g. Cloudflare Tunnel) — Engine.IO returns 400.
_socket_cors_raw = os.environ.get("SOCKET_CORS_ORIGINS", os.environ.get("CORS_ORIGINS", "*")).strip()
if _socket_cors_raw == "*":
    SOCKET_CORS_ORIGINS = "*"
else:
    SOCKET_CORS_ORIGINS = [x.strip() for x in _socket_cors_raw.split(",") if x.strip()]

_status_health_cache = {
    "checked_at": 0.0,
    "influx_connected": False,
    "grafana_active": False,
    "refreshing": False,
}

# --- Pydantic Models ---
class Bucket(BaseModel): name: str
class ConfigUpdate(BaseModel): key: str; value: str | int | list | None
class ManageLogin(BaseModel): password: str
class FileAction(BaseModel): filename: str
class FileRename(BaseModel): old_name: str; new_name: str
class VehicleCreate(BaseModel): name: str
class TcpConfigCreate(BaseModel): name: str; ip: str; port: int
class TcpConfigUpdate(BaseModel): name: str; ip: str; port: int
class TcpAutoUpdate(BaseModel): auto: str | None = None
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


class DecodeCsvRequest(BaseModel):
    event_ids: list[str] | None = None
    start_iso: str | None = None
    end_iso: str | None = None
    vehicle: str | None = None
    dbc_files: list[str] | None = None


class AnalyticsValidateRequest(BaseModel):
    version: int = 1
    views: list[dict] = Field(default_factory=list)

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
    base = os.environ.get("GRAFANA_URL", "http://127.0.0.1:3000").rstrip("/")
    subpath = os.environ.get("GRAFANA_SUBPATH", "/grafana").rstrip("/")
    # One fast probe — avoid multi-path 3s timeouts that stall status on connect.
    for path in (f"{subpath}/api/health", "/api/health"):
        try:
            req = urllib.request.Request(base + path)
            with urllib.request.urlopen(req, timeout=STATUS_HEALTH_TIMEOUT_SEC) as r:
                if 200 <= r.status < 400:
                    return True
        except (urllib.error.URLError, OSError, TimeoutError):
            continue
    return False

def _check_influx_health():
    if not influx_client:
        return False
    try:
        return bool(influx_client.ping())
    except Exception:
        return False

async def _refresh_health_cache():
    influx_ok, grafana_ok = await asyncio.gather(
        asyncio.to_thread(_check_influx_health),
        asyncio.to_thread(_check_grafana_health),
    )
    _status_health_cache["influx_connected"] = influx_ok
    _status_health_cache["grafana_active"] = grafana_ok
    _status_health_cache["checked_at"] = time.monotonic()
    return influx_ok, grafana_ok

def _cached_health():
    """Never blocks — returns last known Grafana/Influx flags."""
    return _status_health_cache["influx_connected"], _status_health_cache["grafana_active"]

async def _get_cached_health(force_refresh: bool = False):
    # Stale-while-revalidate: only block when explicitly forced (background loop).
    if force_refresh:
        return await _refresh_health_cache()
    now = time.monotonic()
    expired = (now - _status_health_cache["checked_at"]) >= STATUS_HEALTH_TTL_SEC
    if expired and not _status_health_cache.get("refreshing"):
        _status_health_cache["refreshing"] = True

        async def _bg():
            try:
                await _refresh_health_cache()
            finally:
                _status_health_cache["refreshing"] = False

        asyncio.create_task(_bg())
    return _cached_health()

async def build_status_payload(force_health_refresh: bool = False):
    parser_status = telemetry_service.get_parser_status()
    influx_connected, grafana_active = await _get_cached_health(force_refresh=force_health_refresh)
    return {
        "service_running": telemetry_service.running,
        "influx_connected": influx_connected,
        "influx_write_enabled": settings.COMMON_CONFIG.get("INFLUX_WRITE_ENABLED", True) and influx_connected,
        "grafana_active": grafana_active,
        "grafana_url": "/grafana/",
        "influx_url": "/influx/",
        "parser_status": parser_status.get("status", "idle") if parser_status else "idle",
        "parser_connection_state": parser_status.get("connection_state") if parser_status else None,
        "data_active": telemetry_service.is_data_active(),
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

async def _post_connect(sid: str):
    """Runs after Socket.IO connect is acknowledged — must not delay the handshake."""
    try:
        await emit_status_update(force_health_refresh=False, to=sid)
        cache = telemetry_service.get_cache()
        if cache:
            await sio.emit("signal_cache", cache, to=sid)
    except Exception:
        logger.debug("post-connect work failed", exc_info=True)

# --- Background Tasks & Lifespan ---
async def send_status_updates(sio: socketio.AsyncServer):
    # Health probes are slow when Grafana/Influx are down — never await them on the
    # hot status path (blocks Socket.IO connect ack / saturates the thread pool).
    health_task: asyncio.Task | None = None
    while True:
        now = time.monotonic()
        stale = (now - _status_health_cache["checked_at"]) >= STATUS_HEALTH_TTL_SEC
        if stale and (health_task is None or health_task.done()):
            health_task = asyncio.create_task(_refresh_health_cache())
        await emit_status_update(force_health_refresh=False)
        await asyncio.sleep(0.25)

def _list_vehicle_dbc_names(vehicle: str) -> list[str]:
    """Return sorted .dbc filenames for a vehicle from Embedded-Sharepoint."""
    _, emb_actual, _ = _resolve_vehicle(vehicle)
    names: dict[str, str] = {}
    if emb_actual is not None:
        emb_dir = os.path.join(settings.EMBEDDED_DBC_DIR, emb_actual)
        if os.path.isdir(emb_dir):
            for f in os.listdir(emb_dir):
                full = os.path.join(emb_dir, f)
                if f.lower().endswith(".dbc") and os.path.isfile(full):
                    names[f.lower()] = f
    return [names[k] for k in sorted(names.keys())]


async def _maybe_server_autostart():
    """If server mode has an optional TCP auto preset, apply HighNoon+all DBCs and start."""
    if not IS_SERVER_MODE:
        return
    from server.util.tcp_configs import get_auto_id, get_config

    auto_id = await asyncio.to_thread(get_auto_id)
    if not auto_id:
        logger.info("Server auto-start: no auto TCP config set; skipping.")
        return
    preset = await asyncio.to_thread(get_config, auto_id)
    if not preset:
        logger.warning("Server auto-start: auto id '%s' not found; skipping.", auto_id)
        return

    vehicle = settings.DEFAULT_DBC_VEHICLE or "HighNoon"
    dbc_files = await asyncio.to_thread(_list_vehicle_dbc_names, vehicle)
    if not dbc_files:
        logger.warning("Server auto-start: no DBC files for vehicle '%s'; skipping.", vehicle)
        return

    settings.update_setting("INPUT_MODE", "canp_tcp")
    settings.update_setting("CANP_TCP_IP", preset["ip"])
    settings.update_setting("CANP_TCP_PORT", int(preset["port"]))
    settings.update_setting("DBC_VEHICLE", vehicle)
    settings.update_setting("DBC_FILES", dbc_files)
    logger.info(
        "Server auto-start: preset=%s (%s:%s) vehicle=%s dbcs=%d",
        auto_id, preset["ip"], preset["port"], vehicle, len(dbc_files),
    )

    try:
        _validate_and_raise()
    except HTTPException as e:
        logger.error("Server auto-start validation failed: %s", e.detail)
        return

    config = settings.get_effective_config()
    if not config:
        logger.error("Server auto-start: invalid effective config.")
        return
    influx_write_enabled = config.get("INFLUX_WRITE_ENABLED", True)
    if influx_write_enabled and not influx_client:
        logger.warning("Server auto-start: InfluxDB not connected; starting without writes.")
        settings.update_setting("INFLUX_WRITE_ENABLED", False)
        influx_write_enabled = False
        config = settings.get_effective_config()
    writer: InfluxDBWriter | None = None
    if influx_write_enabled and influx_client:
        target_bucket = config.get("INFLUX_BUCKET", "debug")
        if not _is_event_bucket_name(target_bucket):
            writer = InfluxDBWriter(client=influx_client, bucket=target_bucket)
        else:
            logger.warning("Server auto-start: refusing event bucket; starting without writes.")
    try:
        await telemetry_service.start(writer, sio=sio, influx_client=influx_client)
        logger.info("Server auto-start: telemetry service started.")
    except Exception:
        logger.exception("Server auto-start: failed to start telemetry service.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global influx_client
    logger.info("--- Application starting up... ---")
    logger.info(
        "Runtime directories: DATA=%s LOG=%s TRASH=%s DB=%s EMBEDDED=%s",
        settings.DATA_FOLDER, settings.LOG_DIR, settings.TRASH_DIR, settings.DB_DIR, settings.EMBEDDED_DBC_DIR,
    )

    for dir_path in (settings.DATA_FOLDER, settings.LOG_DIR, settings.TRASH_DIR, settings.DB_DIR):
        if not os.path.exists(dir_path):
            logger.warning(f"Directory '{dir_path}' not found. Creating it.")
            os.makedirs(dir_path, exist_ok=True)
        else:
            logger.info(f"Directory '{dir_path}' found.")

    config = settings.get_effective_config()
    try:
        import concurrent.futures
        influx_client = InfluxDBClient(url=config['INFLUX_URL'], token=config['INFLUX_TOKEN'], org=config['INFLUX_ORG'], timeout=2000)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            ok = pool.submit(influx_client.ping).result(timeout=3)
        if not ok:
            raise Exception("Ping failed")
        logger.info("InfluxDB connection successful.")
    except Exception as e:
        logger.error(f"Failed to connect to InfluxDB on startup: {e}")
        influx_client = None

    await _maybe_server_autostart()
    
    status_task = asyncio.create_task(send_status_updates(sio))
    yield
    logger.info("--- Application shutting down... ---")
    status_task.cancel()
    if telemetry_service.running: await telemetry_service.stop(influx_client)
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


class ManageAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if path_requires_manage_auth(request.method, request.url.path):
            try:
                require_manage_auth(request)
            except HTTPException as exc:
                return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return await call_next(request)


app.add_middleware(ManageAuthMiddleware)

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
        if _is_event_bucket_name(target_bucket):
            raise HTTPException(status_code=400, detail="Cannot write telemetry to an event metadata bucket. Choose a telemetry bucket in Database settings.")
        writer = InfluxDBWriter(client=influx_client, bucket=target_bucket)
    await telemetry_service.start(writer, sio=sio, influx_client=influx_client)
    await emit_status_update(force_health_refresh=True)
    return {"message": "Telemetry service started." if telemetry_service.running else "Telemetry service did not start."}

@app.post("/api/stop")
async def stop_service():
    if not telemetry_service.running: raise HTTPException(status_code=400, detail="Service is not running.")
    await telemetry_service.stop(influx_client)
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
        await telemetry_service.stop(influx_client)
    writer: InfluxDBWriter | None = None
    if influx_write_enabled:
        target_bucket = config.get("INFLUX_BUCKET", "debug")
        if _is_event_bucket_name(target_bucket):
            raise HTTPException(status_code=400, detail="Cannot write telemetry to an event metadata bucket. Choose a telemetry bucket in Database settings.")
        writer = InfluxDBWriter(client=influx_client, bucket=target_bucket)
    await telemetry_service.start(writer, sio=sio, influx_client=influx_client)
    await emit_status_update(force_health_refresh=True)
    return {"message": "Telemetry service restarted."}

@app.get("/api/health")
async def api_health():
    status = await build_status_payload(force_health_refresh=False)
    return {"ok": True, "status": status}

@app.get("/api/runtime-info")
async def runtime_info():
    return {
        "mode": "server" if IS_SERVER_MODE else "client",
        "manage_auth_required": IS_SERVER_MODE,
        "manage_password_configured": bool(MANAGE_PASSWORD) if IS_SERVER_MODE else False,
        "serve_static_client": SERVE_STATIC_CLIENT,
        "data_dirs": {
            "app_data_dir": settings.APP_DATA_DIR,
            "data_folder": settings.DATA_FOLDER,
            "log_dir": settings.LOG_DIR,
            "trash_dir": settings.TRASH_DIR,
            "db_dir": settings.DB_DIR,
            "embedded_dbc_dir": settings.EMBEDDED_DBC_DIR,
        },
    }


@app.post("/api/manage/login")
async def manage_login(body: ManageLogin):
    if not IS_SERVER_MODE:
        return {"ok": True, "authenticated": True}
    if not MANAGE_PASSWORD:
        raise HTTPException(status_code=503, detail="MANAGE_PASSWORD is not configured.")
    if not password_ok(body.password):
        raise HTTPException(status_code=401, detail="Invalid password.")
    response = JSONResponse({"ok": True, "authenticated": True})
    set_session_cookie(response, create_session_token())
    return response


@app.post("/api/manage/logout")
async def manage_logout():
    response = JSONResponse({"ok": True, "authenticated": False})
    clear_session_cookie(response)
    return response


@app.get("/api/manage/session")
async def manage_session(request: Request):
    return {
        "authenticated": is_authenticated(request),
        "mode": "server" if IS_SERVER_MODE else "client",
        "manage_auth_required": IS_SERVER_MODE,
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
    if update.key == "INFLUX_WRITE_ENABLED" and update.value in (True, "true", "1", 1):
        if not influx_client or not influx_client.ping():
            raise HTTPException(status_code=503, detail="InfluxDB must be connected to enable writes.")
    if not settings.update_setting(update.key, update.value):
        raise HTTPException(status_code=404, detail=f"Setting '{update.key}' not found or invalid.")
    return {"message": "Configuration updated successfully."}

@app.get("/api/dbc/vehicles")
async def list_dbc_vehicles():
    """List vehicle folders from Embedded-Sharepoint."""
    display, _, _ = get_vehicle_folders()
    return sorted(display.values())

@app.get("/api/dbc/vehicles/{vehicle}/files")
async def list_dbc_files(vehicle: str):
    """List .dbc files for a vehicle from Embedded-Sharepoint."""
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    _, emb_actual, _ = _resolve_vehicle(vehicle)
    if emb_actual is None:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    result = {}
    emb_dir = os.path.join(settings.EMBEDDED_DBC_DIR, emb_actual)
    if os.path.isdir(emb_dir):
        for f in os.listdir(emb_dir):
            full = os.path.join(emb_dir, f)
            if f.lower().endswith(".dbc") and os.path.isfile(full):
                result[f.lower()] = {"name": f, "source": "embedded"}
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

@app.get("/api/tcp/auto")
async def get_tcp_auto():
    from server.util.tcp_configs import get_auto_id
    return {"auto": await asyncio.to_thread(get_auto_id)}

@app.put("/api/tcp/auto")
async def update_tcp_auto(body: TcpAutoUpdate):
    from server.util.tcp_configs import set_auto_id
    try:
        auto = await asyncio.to_thread(set_auto_id, body.auto)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"auto": auto}

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
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=5.0,
        )
        writer.close()
        await writer.wait_closed()
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
    raise HTTPException(status_code=403, detail="DBCs come from Embedded-Sharepoint; local vehicles are disabled.")

@app.post("/api/dbc/vehicles/{vehicle}/files")
async def upload_dbc_file(vehicle: str, file: UploadFile = File(...), overwrite: bool = False):
    raise HTTPException(status_code=403, detail="DBCs come from Embedded-Sharepoint; uploads are disabled.")

@app.delete("/api/dbc/vehicles/{vehicle}/files")
async def delete_dbc_file(vehicle: str, action: FileAction):
    raise HTTPException(status_code=403, detail="Cannot modify Embedded-Sharepoint DBCs.")

@app.put("/api/dbc/vehicles/{vehicle}/files/rename")
async def rename_dbc_file(vehicle: str, body: FileRename):
    raise HTTPException(status_code=403, detail="Cannot modify Embedded-Sharepoint DBCs.")


@app.get("/api/dbc/vehicles/{vehicle}/files/{filename}/schema")
async def get_dbc_schema(vehicle: str, filename: str):
    """Return DBC schema (messages and signals) for a given vehicle + DBC filename."""
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name in (".", "..") or any(sep in safe_name for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    # Resolve full path using the same vehicle resolution / embedded precedence as runtime
    paths = resolve_dbc_paths(vehicle, [safe_name])
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

def _is_event_bucket_name(name: str) -> bool:
    index_path = os.path.join(settings.LOG_DIR, "events", "index.json")
    if not os.path.isfile(index_path):
        return False
    try:
        with open(index_path, encoding="utf-8") as f:
            data = json.load(f)
        for evt in data.get("events") or []:
            if evt.get("bucket_name") == name:
                return True
    except Exception:
        pass
    return " - Run " in name


@app.get("/api/events")
async def list_events():
    from server.util.event_recorder import EventRecorder
    from server.util.influx_events import list_recent_influx_events, merge_local_and_influx_events

    recorder = EventRecorder(settings.LOG_DIR, settings.INPUT_MODE, settings.COMMON_CONFIG.get("DBC_VEHICLE", ""))
    local_events = recorder.list_events()
    influx_connected = bool(influx_client and await asyncio.to_thread(influx_client.ping))
    influx_events: list[dict] = []
    if influx_connected:
        org = settings.INFLUX_CONFIG.get("INFLUX_ORG", "")
        influx_events = await asyncio.to_thread(list_recent_influx_events, influx_client, org)
    merged = merge_local_and_influx_events(local_events, influx_events)
    return {
        "events": merged,
        "influx_connected": influx_connected,
        "local_count": len(local_events),
        "influx_count": len(influx_events),
    }


@app.post("/api/events/decode-csv")
async def decode_events_csv(body: DecodeCsvRequest):
    from server.util.decode_capture import generate_decoded_csv_zip
    from server.util.event_recorder import EventRecorder

    recorder = EventRecorder(settings.LOG_DIR, settings.INPUT_MODE, settings.COMMON_CONFIG.get("DBC_VEHICLE", ""))
    events = recorder.list_events()
    default_vehicle = (body.vehicle or "").strip() or settings.COMMON_CONFIG.get("DBC_VEHICLE", "") or settings.DEFAULT_DBC_VEHICLE
    dbc_files = body.dbc_files if body.dbc_files is not None else settings.COMMON_CONFIG.get("DBC_FILES") or []

    def dbc_paths_for_vehicle(vehicle: str) -> list[str]:
        v = (vehicle or "").strip() or default_vehicle
        return resolve_all_dbc_paths(v, dbc_files)

    try:
        zip_bytes, meta = generate_decoded_csv_zip(
            events,
            dbc_paths_for_vehicle,
            event_ids=body.event_ids,
            start_iso=body.start_iso,
            end_iso=body.end_iso,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("decode-csv failed")
        raise HTTPException(status_code=500, detail=str(e))

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"decoded-clean_{stamp}.zip"
    return StreamingResponse(
        iter([zip_bytes]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Decode-Rows": str(meta.get("rows", 0)),
            "X-Decode-Csv-Count": str(meta.get("csv_count", 0)),
        },
    )


@app.get("/api/influx/buckets")
async def list_buckets():
    if not influx_client: raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    names = [b.name for b in influx_client.buckets_api().find_buckets().buckets]
    return [{"name": n, "is_event": _is_event_bucket_name(n)} for n in sorted(names)]

@app.post("/api/influx/buckets")
async def create_bucket(bucket: Bucket):
    if not influx_client: raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    if _is_event_bucket_name(bucket.name):
        raise HTTPException(status_code=403, detail="Cannot manually create event metadata buckets.")
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
        valid, errors = validate_views(body.views or [], dbc_dir="")
        return {
            "ok": len(errors) == 0,
            "validViews": valid,
            "errors": errors,
        }
    except Exception:
        logger.debug("analytics_validate failed", exc_info=True)
        return {"ok": False, "validViews": [], "errors": [{"path": "/", "detail": "Validation failed unexpectedly."}]}


# --- Socket.IO and routing ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins=SOCKET_CORS_ORIGINS)


async def _serve_favicon() -> FileResponse:
    if not os.path.isfile(FAVICON_PATH):
        raise HTTPException(status_code=404, detail="Favicon not found")
    return FileResponse(FAVICON_PATH, media_type="image/svg+xml")


@app.get("/favicon.svg")
@app.get("/favicon.ico")
async def favicon():
    return await _serve_favicon()


@app.get("/manage")
@app.get("/manage/")
async def manage_root():
    if IS_SERVER_MODE and SERVE_STATIC_CLIENT and os.path.isdir(STATIC_CLIENT_DIR):
        index = os.path.join(STATIC_CLIENT_DIR, "index.html")
        if not os.path.isfile(index):
            raise HTTPException(status_code=404, detail="Portal build not found. Run npm run build.")
        return FileResponse(index)
    return RedirectResponse(url="/", status_code=307)


@app.get("/manage/{path:path}")
async def manage_path(path: str):
    if IS_SERVER_MODE and SERVE_STATIC_CLIENT and os.path.isdir(STATIC_CLIENT_DIR):
        # SPA assets under /manage are not used; hashes handle client routes.
        index = os.path.join(STATIC_CLIENT_DIR, "index.html")
        if not os.path.isfile(index):
            raise HTTPException(status_code=404, detail="Portal build not found. Run npm run build.")
        return FileResponse(index)
    return RedirectResponse(url=f"/{path}" if path else "/", status_code=307)


@app.get("/dashboard")
@app.get("/dashboard/")
async def dashboard_legacy_redirect():
    return RedirectResponse(url="/influx/", status_code=307)


@app.get("/dashboard/{path:path}")
async def dashboard_legacy_path_redirect(path: str):
    return RedirectResponse(url=f"/influx/{path}", status_code=307)


@app.api_route(GRAFANA_PREFIX, methods=PROXY_METHODS)
@app.api_route(f"{GRAFANA_PREFIX}/{{path:path}}", methods=PROXY_METHODS)
async def grafana_proxy(request: Request, path: str = ""):
    _, grafana_active = await _get_cached_health()
    if not grafana_active:
        return grafana_disconnected()
    try:
        return await proxy_to_upstream(
            request,
            GRAFANA_UPSTREAM,
            public_prefix=GRAFANA_PREFIX,
        )
    except httpx.RequestError:
        return grafana_disconnected()


@app.api_route(INFLUX_PREFIX, methods=PROXY_METHODS)
@app.api_route(f"{INFLUX_PREFIX}/{{path:path}}", methods=PROXY_METHODS)
async def influx_proxy(request: Request, path: str = ""):
    influx_connected, _ = await _get_cached_health()
    if not influx_connected:
        return influx_disconnected()
    try:
        return await proxy_to_upstream(
            request,
            INFLUX_UPSTREAM,
            strip_prefix=INFLUX_PREFIX,
            public_prefix=INFLUX_PREFIX,
            rewrite_body_paths=True,
        )
    except httpx.RequestError:
        return influx_disconnected()


if SERVE_STATIC_CLIENT and os.path.isdir(STATIC_CLIENT_DIR):
    assets_dir = os.path.join(STATIC_CLIENT_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def serve_portal_root():
        index = os.path.join(STATIC_CLIENT_DIR, "index.html")
        if not os.path.isfile(index):
            raise HTTPException(status_code=404, detail="Portal build not found. Run npm run build.")
        return FileResponse(index)

    @app.get("/{spa_path:path}")
    async def serve_portal_spa(spa_path: str):
        head = spa_path.split("/", 1)[0]
        if head in RESERVED_SPA_PREFIXES or spa_path in ("favicon.ico", "favicon.svg"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.join(STATIC_CLIENT_DIR, spa_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        index = os.path.join(STATIC_CLIENT_DIR, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="Portal build not found.")

    logger.info(f"Serving manage portal from {STATIC_CLIENT_DIR} at /")
else:
    logger.info("Portal serving is disabled or client build not found.")


asgi_app = socketio.ASGIApp(sio, app)

@sio.event
async def connect(sid, environ, auth=None):
    # Keep this handler tiny: Socket.IO only fires client `connect` after it returns.
    logger.info(f"Client connected: {sid}")
    await sio.save_session(sid, {"environ": environ or {}, "auth": auth})
    asyncio.create_task(_post_connect(sid))

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")

@sio.event
async def request_cache(sid):
    cache = telemetry_service.get_cache()
    await sio.emit("signal_cache", cache, to=sid)

@sio.event
async def reset_cache(sid, data=None):
    if IS_SERVER_MODE:
        session = await sio.get_session(sid)
        environ = session.get("environ") if isinstance(session, dict) else None
        auth = session.get("auth") if isinstance(session, dict) else None
        if isinstance(data, dict):
            auth = data
        if not socket_manage_authenticated(environ or {}, auth if isinstance(auth, dict) else None):
            await sio.emit("error", {"detail": "Manage login required."}, to=sid)
            return
    telemetry_service.message_cache = {}
    logger.info(f"Signal cache reset by client {sid}")

if __name__ == "__main__":
    uvicorn.run("server.app:asgi_app", host="0.0.0.0", port=4000, reload=True)
