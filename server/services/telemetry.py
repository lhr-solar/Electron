import asyncio
import logging
import os
from server.config import settings
from server.util.can_manager import CANManager
from server.util.async_parser_factory import create_async_parser
from server.util.async_processor import process_packets
from server.util.influx_writer import InfluxDBWriter

logger = logging.getLogger(__name__)

class TelemetryService:
    def __init__(self):
        self.stop_event = asyncio.Event()
        self.packet_queue = asyncio.Queue()
        self.live_message_queue: asyncio.Queue | None = None
        self.background_tasks = set()
        self.influx_writer: InfluxDBWriter | None = None
        self.parser = None
        self.running = False
        self.dbc_errors = []

    def get_parser_status(self):
        """Returns the current status of the parser."""
        if self.parser and self.running:
            return self.parser.get_status()
        return None

    def get_dbc_errors(self):
        """Returns list of DBC load/parse errors for the UI."""
        return list(self.dbc_errors)

    async def _emit_live_messages(self, sio):
        """Drain live_message_queue periodically (every 100ms) and emit batches to Socket.IO clients."""
        batch_interval = 0.1  # 100 ms
        max_batch_size = 200  # cap per emit to avoid huge payloads
        while not self.stop_event.is_set() and self.live_message_queue is not None:
            try:
                await asyncio.sleep(batch_interval)
                batch = []
                while len(batch) < max_batch_size:
                    try:
                        payload = self.live_message_queue.get_nowait()
                        batch.append(payload)
                    except asyncio.QueueEmpty:
                        break
                if batch:
                    await sio.emit("live_message_batch", batch)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("live_message emit: %s", e)

    async def start(self, influx_writer: InfluxDBWriter, sio=None):
        """
        Starts the telemetry service. If sio is provided, live CAN messages are emitted to clients.
        """
        if self.running:
            logger.warning("TelemetryService is already running.")
            return

        logger.info("--- Starting Telemetry Service ---")
        
        config = settings.get_effective_config()
        if not config:
            logger.error("Could not start service due to invalid configuration.")
            return

        self.influx_writer = influx_writer
        
        if config.get("CLEAR_DEBUG_BUCKET_ON_STARTUP") and config.get("INFLUX_BUCKET") == "debug":
            logger.info(f"Startup clear requested for bucket: '{self.influx_writer.bucket}'")
            self.influx_writer.backup_and_clear_bucket()

        self.dbc_errors = []
        vehicle = config.get("DBC_VEHICLE", "").strip() or "Daybreak"
        dbc_dir = settings.DBC_DIR
        dbc_files = config.get("DBC_FILES") or []
        if not isinstance(dbc_files, list):
            dbc_files = [f for f in str(dbc_files).split(",") if f.strip()]
        dbc_paths = []
        for f in dbc_files:
            f = f.strip()
            if not f:
                continue
            if not f.lower().endswith(".dbc"):
                f = f + ".dbc"
            path = os.path.join(dbc_dir, vehicle, f)
            dbc_paths.append(path)
        if not dbc_paths:
            self.dbc_errors.append(f"No DBC files selected for vehicle '{vehicle}'.")
        can_manager = CANManager(dbc_paths, config, influx_writer=self.influx_writer)
        self.dbc_errors = can_manager.get_errors()
        
        self.parser = create_async_parser(config, self.packet_queue, self.stop_event)
        self.live_message_queue = asyncio.Queue(maxsize=500) if sio else None

        self.stop_event.clear()

        parser_task = asyncio.create_task(self.parser.run())
        self.background_tasks.add(parser_task)
        parser_task.add_done_callback(self.background_tasks.discard)

        processor_task = asyncio.create_task(
            process_packets(self.packet_queue, self.stop_event, can_manager, self.live_message_queue)
        )
        self.background_tasks.add(processor_task)
        processor_task.add_done_callback(self.background_tasks.discard)

        if sio and self.live_message_queue is not None:
            emit_task = asyncio.create_task(self._emit_live_messages(sio))
            self.background_tasks.add(emit_task)
            emit_task.add_done_callback(self.background_tasks.discard)

        self.running = True
        logger.info(f"--- Telemetry Service Started (Mode: {config['INPUT_MODE']}) ---")

    async def stop(self):
        """Gracefully stops the telemetry service and all background tasks."""
        if not self.running:
            return

        logger.info("Stopping Telemetry Service...")
        self.stop_event.set()
        
        for task in self.background_tasks:
            task.cancel()
        
        if self.background_tasks:
            await asyncio.gather(*self.background_tasks, return_exceptions=True)
        
        if self.influx_writer:
            self.influx_writer.close()
        
        self.running = False
        self.parser = None
        self.dbc_errors = []
        logger.info("Telemetry Service Stopped.")

telemetry_service = TelemetryService()
