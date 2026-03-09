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

# --- Pydantic Models ---
class Bucket(BaseModel): name: str
class ConfigUpdate(BaseModel): key: str; value: str | int | list
class FileAction(BaseModel): filename: str
class FileRename(BaseModel): old_name: str; new_name: str
class VehicleCreate(BaseModel): name: str

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
@app.post("/api/start")
async def start_service():
    if telemetry_service.running: raise HTTPException(status_code=400, detail="Service is already running.")
    if not influx_client: raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    config = settings.get_effective_config()
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
    if not influx_client: raise HTTPException(status_code=503, detail="InfluxDB is not connected.")
    if telemetry_service.running:
        await telemetry_service.stop()
    config = settings.get_effective_config()
    if not config: raise HTTPException(status_code=500, detail="Invalid configuration.")
    target_bucket = config.get("INFLUX_BUCKET", "debug")
    writer = InfluxDBWriter(client=influx_client, bucket=target_bucket)
    asyncio.create_task(telemetry_service.start(writer, sio=sio))
    return {"message": "Telemetry service restarted."}

@app.get("/api/config")
async def get_config(): return settings.get_effective_config()

@app.post("/api/config")
async def update_config(update: ConfigUpdate):
    if telemetry_service.running: raise HTTPException(status_code=400, detail="Cannot update configuration while service is running.")
    if not settings.update_setting(update.key, update.value):
        raise HTTPException(status_code=404, detail=f"Setting '{update.key}' not found or invalid.")
    return {"message": "Configuration updated successfully."}

@app.get("/api/dbc/vehicles")
async def list_dbc_vehicles():
    """List vehicle folders (subdirs) under DBC_DIR."""
    dbc_dir = settings.DBC_DIR
    if not os.path.isdir(dbc_dir):
        return []
    names = [d for d in os.listdir(dbc_dir) if os.path.isdir(os.path.join(dbc_dir, d)) and not d.startswith(".")]
    return sorted(names)

@app.get("/api/dbc/vehicles/{vehicle}/files")
async def list_dbc_files(vehicle: str):
    """List .dbc files in DBC_DIR/vehicle. Vehicle must be a direct subdir name."""
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    dbc_dir = settings.DBC_DIR
    path = os.path.join(dbc_dir, vehicle)
    if not os.path.isdir(path):
        return []
    files = [f for f in os.listdir(path) if f.lower().endswith(".dbc") and os.path.isfile(os.path.join(path, f))]
    return sorted(files)

@app.get("/api/serial-ports")
async def list_serial_ports():
    ports = await asyncio.to_thread(serial.tools.list_ports.comports)
    return [{"device": port.device, "description": port.description} for port in ports]

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
    file_path = os.path.join(dir_path, file.filename)
    if os.path.exists(file_path) and not overwrite:
        raise HTTPException(status_code=409, detail=f"File '{file.filename}' already exists. Please confirm to overwrite.")
    if os.path.exists(file_path) and overwrite:
        move_to_trash(dir_path, file.filename)
    with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
    return {"filename": file.filename}

@app.delete("/api/files/{directory_key}")
async def delete_file_endpoint(directory_key: str, action: FileAction):
    dir_path = getattr(settings, f"{directory_key.upper()}_DIR", None)
    if not dir_path: raise HTTPException(status_code=404, detail="Directory not found.")
    file_path = os.path.join(dir_path, action.filename)
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="File not found.")
    move_to_trash(dir_path, action.filename)
    return {"message": f"File '{action.filename}' moved to trash."}

@app.put("/api/files/{directory_key}/rename")
async def rename_file_endpoint(directory_key: str, body: FileRename):
    dir_path = getattr(settings, f"{directory_key.upper()}_DIR", None)
    if not dir_path: raise HTTPException(status_code=404, detail="Directory not found.")
    old_path = os.path.join(dir_path, body.old_name)
    new_path = os.path.join(dir_path, body.new_name)
    if not os.path.exists(old_path): raise HTTPException(status_code=404, detail="File not found.")
    if os.path.exists(new_path): raise HTTPException(status_code=409, detail=f"File '{body.new_name}' already exists.")
    os.rename(old_path, new_path)
    return {"message": f"Renamed '{body.old_name}' to '{body.new_name}'."}

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
    dir_path = os.path.join(settings.DBC_DIR, vehicle)
    if not os.path.isdir(dir_path): raise HTTPException(status_code=404, detail="Vehicle not found.")
    file_path = os.path.join(dir_path, file.filename)
    if os.path.exists(file_path) and not overwrite:
        raise HTTPException(status_code=409, detail=f"File '{file.filename}' already exists.")
    if os.path.exists(file_path) and overwrite:
        move_to_trash(dir_path, file.filename)
    with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
    return {"filename": file.filename}

@app.delete("/api/dbc/vehicles/{vehicle}/files")
async def delete_dbc_file(vehicle: str, action: FileAction):
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    dir_path = os.path.join(settings.DBC_DIR, vehicle)
    if not os.path.isdir(dir_path): raise HTTPException(status_code=404, detail="Vehicle not found.")
    file_path = os.path.join(dir_path, action.filename)
    if not os.path.exists(file_path): raise HTTPException(status_code=404, detail="File not found.")
    move_to_trash(dir_path, action.filename)
    return {"message": f"File '{action.filename}' moved to trash."}

@app.put("/api/dbc/vehicles/{vehicle}/files/rename")
async def rename_dbc_file(vehicle: str, body: FileRename):
    if ".." in vehicle or "/" in vehicle or "\\" in vehicle:
        raise HTTPException(status_code=400, detail="Invalid vehicle name.")
    dir_path = os.path.join(settings.DBC_DIR, vehicle)
    if not os.path.isdir(dir_path): raise HTTPException(status_code=404, detail="Vehicle not found.")
    old_path = os.path.join(dir_path, body.old_name)
    new_path = os.path.join(dir_path, body.new_name)
    if not os.path.exists(old_path): raise HTTPException(status_code=404, detail="File not found.")
    if os.path.exists(new_path): raise HTTPException(status_code=409, detail=f"File '{body.new_name}' already exists.")
    os.rename(old_path, new_path)
    return {"message": f"Renamed '{body.old_name}' to '{body.new_name}'."}

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

if __name__ == "__main__":
    uvicorn.run("server.app:asgi_app", host="0.0.0.0", port=4000, reload=True)
