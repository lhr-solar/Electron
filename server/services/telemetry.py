import asyncio
import logging
import os
from server.config import settings
from server.util.can_manager import CANManager
from server.util.vehicle_dbc_resolve import resolve_dbc_paths
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
        self.message_cache = {}  # {sender: {can_id_hex: {message_name, network, signals, raw_packet, timestamp_ns}}}
        self.last_parser_error: str | None = None

    def get_parser_status(self):
        """Returns the current status of the parser. Includes last error when stopped due to parser failure."""
        if self.parser and self.running:
            return self.parser.get_status()
        if self.last_parser_error and not self.running:
            return {"status": "error", "error_message": self.last_parser_error}
        return None

    def get_dbc_errors(self):
        """Returns list of DBC load/parse errors for the UI."""
        return list(self.dbc_errors)

    def _update_cache(self, msg):
        """Update the message cache with a single message payload. Handles array messages by merging into indexed lists.
        Top-level key is 'vehicle::sender' to separate ECUs across vehicles."""
        sender = msg.get("sender", "Unknown")
        vehicle = msg.get("vehicle", "unknown")
        cache_key = f"{vehicle}::{sender}"
        can_id_hex = msg.get("can_id_hex", "")
        if cache_key not in self.message_cache:
            self.message_cache[cache_key] = {}

        array_index = msg.get("array_index")
        incoming_signals = msg.get("signals", {})

        if array_index is not None:
            existing = self.message_cache[cache_key].get(can_id_hex)
            if existing and existing.get("is_array"):
                merged_signals = existing["signals"]
            else:
                merged_signals = {}

            for sig_name, sig_val in incoming_signals.items():
                arr = merged_signals.get(sig_name)
                if not isinstance(arr, list):
                    arr = []
                if array_index >= len(arr):
                    arr.extend([0] * (array_index + 1 - len(arr)))
                arr[array_index] = sig_val
                merged_signals[sig_name] = arr

            self.message_cache[cache_key][can_id_hex] = {
                "message_name": msg.get("message_name"),
                "network": msg.get("network", "not_found"),
                "signals": merged_signals,
                "units": msg.get("units", {}),
                "is_array": True,
                "raw_packet": msg.get("raw_packet", ""),
                "timestamp_ns": msg.get("timestamp_ns", 0),
            }
        else:
            self.message_cache[cache_key][can_id_hex] = {
                "message_name": msg.get("message_name"),
                "network": msg.get("network", "not_found"),
                "signals": incoming_signals,
                "units": msg.get("units", {}),
                "raw_packet": msg.get("raw_packet", ""),
                "timestamp_ns": msg.get("timestamp_ns", 0),
            }

    def get_cache(self):
        """Return the full message cache."""
        return self.message_cache

    async def _emit_live_messages(self, sio):
        """Drain live_message_queue periodically (every 100ms), update cache, and emit batches."""
        batch_interval = 0.1
        max_batch_size = 200
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
                    for msg in batch:
                        self._update_cache(msg)
                    await sio.emit("live_message_batch", batch)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("live_message emit: %s", e)

    async def start(self, influx_writer: InfluxDBWriter, sio=None):
        """
        Starts the telemetry service. If sio is provided, live CAN messages are emitted to clients.
        Does not start any tasks if pre-start validation fails.
        """
        if self.running:
            logger.warning("TelemetryService is already running.")
            return

        from server.util.start_validation import validate_start_config
        title, detail = validate_start_config()
        if title and detail:
            logger.error("Start aborted: %s: %s", title, detail)
            return

        self.last_parser_error = None
        logger.info("--- Starting Telemetry Service ---")
        
        config = settings.get_effective_config()
        if not config:
            logger.error("Could not start service due to invalid configuration.")
            return

        influx_write_enabled = config.get("INFLUX_WRITE_ENABLED", True)
        self.influx_writer = influx_writer if influx_write_enabled else None

        if influx_write_enabled and config.get("CLEAR_DEBUG_BUCKET_ON_STARTUP") and config.get("INFLUX_BUCKET") == "debug":
            logger.info(f"Startup clear requested for bucket: '{self.influx_writer.bucket}'")
            self.influx_writer.backup_and_clear_bucket()

        if not influx_write_enabled:
            logger.info("InfluxDB writes disabled by config.")

        self.dbc_errors = []
        vehicle = config.get("DBC_VEHICLE", "").strip() or settings.DEFAULT_DBC_VEHICLE
        dbc_files = config.get("DBC_FILES") or []
        if not isinstance(dbc_files, list):
            dbc_files = [f for f in str(dbc_files).split(",") if f.strip()]
        dbc_paths = resolve_dbc_paths(vehicle, dbc_files, settings.DBC_DIR)
        if not dbc_paths:
            self.dbc_errors.append(f"No DBC files selected for vehicle '{vehicle}'.")
        can_manager = CANManager(dbc_paths, config, influx_writer=self.influx_writer)
        self.dbc_errors = can_manager.get_errors()
        
        self.parser = create_async_parser(config, self.packet_queue, self.stop_event)
        self.live_message_queue = asyncio.Queue(maxsize=500) if sio else None

        self.stop_event.clear()
        self.running = True  # Set before starting tasks so error callback can stop

        parser_task = asyncio.create_task(self.parser.run())
        self.background_tasks.add(parser_task)
        parser_task.add_done_callback(self.background_tasks.discard)

        def _on_parser_done(t):
            if not self.running:
                return
            try:
                s = self.parser.get_status() if self.parser else {}
                if s.get("status") == "error":
                    self.last_parser_error = s.get("error_message") or "Parser error"
                    logger.info("Parser error detected; auto-stopping service.")
                    asyncio.get_running_loop().create_task(self.stop())
            except Exception:
                pass
        parser_task.add_done_callback(_on_parser_done)

        if config.get("INPUT_MODE") == "file":

            async def _stop_when_parser_done():
                await parser_task
                if not self.running:
                    return
                logger.info("File replay finished; waiting for packet queue to drain...")
                await self.packet_queue.join()
                await asyncio.sleep(0.3)
                if self.running:
                    logger.info("Queue drained; stopping telemetry service.")
                    await self.stop()

            asyncio.create_task(_stop_when_parser_done())

        processor_task = asyncio.create_task(
            process_packets(self.packet_queue, self.stop_event, can_manager, self.live_message_queue)
        )
        self.background_tasks.add(processor_task)
        processor_task.add_done_callback(self.background_tasks.discard)

        if sio and self.live_message_queue is not None:
            emit_task = asyncio.create_task(self._emit_live_messages(sio))
            self.background_tasks.add(emit_task)
            emit_task.add_done_callback(self.background_tasks.discard)

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
