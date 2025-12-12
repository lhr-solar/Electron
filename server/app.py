import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
import socketio

from server.config import settings
from server.services.telemetry import telemetry_service

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan manager to start and stop the TelemetryService.
    """
    logger.info("Application starting up...")
    # Start the telemetry service in the background
    asyncio.create_task(telemetry_service.start())
    
    yield
    
    logger.info("Application shutting down...")
    # Gracefully stop the telemetry service
    await telemetry_service.stop()

# --- FastAPI App and Socket.IO ---
app = FastAPI(lifespan=lifespan)
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app)

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")
    config = settings.get_effective_config()
    await sio.emit('session_started', {'selected_dbc': config.get("DBC_FILE")}, to=sid)

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")

# To run this app: uvicorn server.app:asgi_app --reload
