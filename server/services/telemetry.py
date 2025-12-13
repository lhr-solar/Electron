import asyncio
import logging
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
        self.background_tasks = set()
        self.influx_writer: InfluxDBWriter | None = None
        self.parser = None
        self.running = False

    def get_parser_status(self):
        """Returns the current status of the parser."""
        if self.parser and self.running:
            return self.parser.get_status()
        return None

    async def start(self, influx_writer: InfluxDBWriter):
        """
        Starts the telemetry service with a pre-configured InfluxDB writer.
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

        # --- DBC Path Logic ---
        dbc_filename = config['DBC_FILE']
        if not dbc_filename.endswith('.dbc'):
            dbc_filename += '.dbc'
        dbc_file_path = f"dbc/{dbc_filename}"
        # --------------------

        can_manager = CANManager(dbc_file_path, config, influx_writer=self.influx_writer)
        
        self.parser = create_async_parser(config, self.packet_queue, self.stop_event)
        
        self.stop_event.clear()
        
        parser_task = asyncio.create_task(self.parser.run())
        self.background_tasks.add(parser_task)
        parser_task.add_done_callback(self.background_tasks.discard)
        
        processor_task = asyncio.create_task(
            process_packets(self.packet_queue, self.stop_event, can_manager)
        )
        self.background_tasks.add(processor_task)
        processor_task.add_done_callback(self.background_tasks.discard)

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
        logger.info("Telemetry Service Stopped.")

telemetry_service = TelemetryService()
