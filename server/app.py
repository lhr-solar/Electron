import asyncio
import logging
import os
import shutil
import urllib.request
import urllib.error
import uvicorn
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import socketio
from influxdb_client import InfluxDBClient
from influxdb_client.client.exceptions import InfluxDBError
import serial.tools.list_ports

from server.config import settings
from server.services.telemetry import telemetry_service
from server.util.influx_writer import InfluxDBWriter

# --- Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger(__name__)
influx_client: InfluxDBClient | None = None

# Path to built static client (project root / client / dist)
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATIC_CLIENT_DIR = os.path.join(_PROJECT_ROOT, "client", "dist")
EMBEDDED_DBC_DIR = os.path.join(_PROJECT_ROOT, "Embedded-Sharepoint", "can", "dbc")

from server.util.vehicle_dbc_resolve import (
    get_vehicle_folders,
    resolve_vehicle as _resolve_vehicle,
)

# --- Pydantic Models ---
class Bucket(BaseModel): name: str
class ConfigUpdate(BaseModel): key: str; value: str | int | list | None
class FileAction(BaseModel): filename: str
class FileRename(BaseModel): old_name: str; new_name: str
class VehicleCreate(BaseModel): name: str
class TcpConfigCreate(BaseModel): name: str; ip: str; port: int
class TcpConfigUpdate(BaseModel): name: str; ip: str; port: int
class TcpTestRequest(BaseModel): ip: str

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

# --- Background Tasks & Lifespan ---
async def send_status_updates(sio: socketio.AsyncServer):
    while True:
        parser_status = telemetry_service.get_parser_status()
        influx_connected = await asyncio.to_thread(influx_client.ping) if influx_client else False
        grafana_active = await asyncio.to_thread(_check_grafana_health)
        status = {
            "service_running": telemetry_service.running,
            "influx_connected": influx_connected,
            "grafana_active": grafana_active,
            "parser_status": parser_status.get("status", "idle") if parser_status else "idle",
            "parser_connection_state": parser_status.get("connection_state") if parser_status else None,
            "error_message": parser_status.get("error_message") if parser_status else None,
            "dbc_errors": telemetry_service.get_dbc_errors(),
            "influx_bucket": settings.get_bucket(),
            "vehicle": settings.COMMON_CONFIG.get("DBC_VEHICLE", ""),
        }
        await sio.emit('status', status)
        await asyncio.sleep(1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global influx_client
    logger.info("--- Application starting up... ---")
    
    # Check and create directories
    for dir_key in ["DBC_DIR", "LOG_DIR", "TRASH_DIR"]:
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
    asyncio.create_task(telemetry_service.start(writer, sio=sio))
    return {"message": "Telemetry service starting."}

@app.post("/api/stop")
async def stop_service():
    if not telemetry_service.running: raise HTTPException(status_code=400, detail="Service is not running.")
    await telemetry_service.stop()
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
    asyncio.create_task(telemetry_service.start(writer, sio=sio))
    return {"message": "Telemetry service restarted."}

@app.get("/api/config")
async def get_config():
    data = settings.get_effective_config()
    if data is not None:
        data["default_dbc_vehicle"] = settings.DEFAULT_DBC_VEHICLE
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
        emb_dir = os.path.join(EMBEDDED_DBC_DIR, emb_actual)
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
    """Ping the given IP address. Returns success/failure."""
    import platform
    import subprocess
    ip = body.ip.strip()
    if not ip:
        return {"ok": False, "message": "IP required."}
    try:
        count = "1"
        flag = "-n" if platform.system() == "Windows" else "-c"
        result = await asyncio.to_thread(
            subprocess.run, ["ping", flag, count, ip],
            capture_output=True, timeout=10
        )
        if result.returncode == 0:
            return {"ok": True, "message": "Ping successful."}
        return {"ok": False, "message": result.stderr.decode(errors="ignore") or "Ping failed."}
    except Exception as e:
        return {"ok": False, "message": "Ping timed out." if "TimeoutExpired" in type(e).__name__ else str(e)}

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
    path = os.path.join(settings.DBC_DIR, name)
    if os.path.exists(path): raise HTTPException(status_code=409, detail=f"Vehicle '{name}' already exists.")
    os.makedirs(path)
    return {"message": f"Vehicle '{name}' created."}

@app.post("/api/dbc/vehicles/{vehicle}/files")
async def upload_dbc_file(vehicle: str, file: UploadFile = File(...), overwrite: bool = False):
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    display, emb_actual, local_actual = _resolve_vehicle(vehicle, settings.DBC_DIR)
    if display is None:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    # Use local folder if present, else create with display name (Embedded-Sharepoint spelling)
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
    _, emb_actual, local_actual = _resolve_vehicle(vehicle, settings.DBC_DIR)
    if local_actual is None:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    dir_path = os.path.join(settings.DBC_DIR, local_actual)
    if not os.path.isdir(dir_path):
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    safe_name = os.path.basename(action.filename)
    if not safe_name or safe_name in (".", "..") or any(sep in safe_name for sep in ("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    if emb_actual is not None:
        emb_dir = os.path.join(EMBEDDED_DBC_DIR, emb_actual)
        if os.path.isdir(emb_dir):
            for f in os.listdir(emb_dir):
                if f.lower() == safe_name.lower():
                    raise HTTPException(status_code=403, detail="Cannot delete DBC from Embedded-Sharepoint.")
    file_path = os.path.join(dir_path, safe_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found.")
    move_to_trash(dir_path, safe_name)
    return {"message": f"File '{safe_name}' moved to trash."}

@app.put("/api/dbc/vehicles/{vehicle}/files/rename")
async def rename_dbc_file(vehicle: str, body: FileRename):
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    _, emb_actual, local_actual = _resolve_vehicle(vehicle, settings.DBC_DIR)
    if local_actual is None:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    dir_path = os.path.join(settings.DBC_DIR, local_actual)
    if not os.path.isdir(dir_path):
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    old_name = os.path.basename(body.old_name)
    new_name = os.path.basename(body.new_name)
    for nm in (old_name, new_name):
        if not nm or nm in (".", "..") or any(sep in nm for sep in ("/", "\\")):
            raise HTTPException(status_code=400, detail="Invalid filename.")
    if emb_actual is not None:
        emb_dir = os.path.join(EMBEDDED_DBC_DIR, emb_actual)
        if os.path.isdir(emb_dir):
            for f in os.listdir(emb_dir):
                if f.lower() == old_name.lower():
                    raise HTTPException(status_code=403, detail="Cannot rename DBC from Embedded-Sharepoint.")
    old_path = os.path.join(dir_path, old_name)
    new_path = os.path.join(dir_path, new_name)
    if not os.path.exists(old_path):
        raise HTTPException(status_code=404, detail="File not found.")
    existing = await list_dbc_files(vehicle)
    lower_names = {entry["name"].lower() for entry in existing}
    if new_name.lower() in lower_names:
        raise HTTPException(status_code=409, detail=f"DBC '{new_name}' already exists.")
    os.rename(old_path, new_path)
    return {"message": f"Renamed '{old_name}' to '{new_name}'."}

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

# --- Socket.IO and Static Files ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")
if os.path.isdir(STATIC_CLIENT_DIR):
    app.mount("/", StaticFiles(directory=STATIC_CLIENT_DIR, html=True), name="static")
    logger.info(f"Serving static client from {STATIC_CLIENT_DIR}")
else:
    logger.warning(f"Static client not found at {STATIC_CLIENT_DIR}. Run 'cd client && npm run build' to build the client.")
asgi_app = socketio.ASGIApp(sio, app)

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")
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
