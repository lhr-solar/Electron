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
        self.influx_writer = None
        self.can_manager = None
        self.parser = None
        self.running = False

    async def start(self):
        """Initializes and starts the telemetry service components."""
        if self.running:
            logger.warning("TelemetryService is already running.")
            return

        logger.info("--- Starting Telemetry Service ---")
        
        config = settings.get_effective_config()
        if not config:
            logger.error("Could not start service due to invalid configuration.")
            return

        if config["INFLUX_TOKEN"] == "your-token-fallback":
            logger.warning("Using fallback InfluxDB token. Set the INFLUX_TOKEN environment variable.")

        # --- InfluxDB Setup ---
        self.influx_writer = InfluxDBWriter(
            url=config.get("INFLUX_URL"),
            token=config.get("INFLUX_TOKEN"),
            org=config.get("INFLUX_ORG"),
            bucket=config.get("INFLUX_BUCKET")
        )

        if not self.influx_writer.check_connection():
            logger.error("InfluxDB connection failed. Aborting service start.")
            return

        if config.get("CLEAR_DEBUG_BUCKET_ON_STARTUP") and config.get("INFLUX_BUCKET") == "debug":
            logger.info("Startup clear requested for 'debug' bucket.")
            # This is a synchronous call, which is fine for startup
            self.influx_writer.backup_and_clear_bucket("debug")

        # --- CAN & Parser Setup ---
        dbc_file_path = f"dbc/{config['DBC_FILE']}.dbc"
        self.can_manager = CANManager(dbc_file_path, config, influx_writer=self.influx_writer)
        
        # Create the appropriate async parser
        self.parser = create_async_parser(config, self.packet_queue, self.stop_event)
        
        # --- Start Background Tasks ---
        self.stop_event.clear()
        
        # Task 1: The Parser (Producer)
        parser_task = asyncio.create_task(self.parser.run())
        self.background_tasks.add(parser_task)
        parser_task.add_done_callback(self.background_tasks.discard)
        
        # Task 2: The Processor (Consumer)
        processor_task = asyncio.create_task(
            process_packets(self.packet_queue, self.stop_event, self.can_manager)
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
        
        # Cancel all tasks
        for task in self.background_tasks:
            task.cancel()
        
        # Wait for tasks to finish
        if self.background_tasks:
            await asyncio.gather(*self.background_tasks, return_exceptions=True)
        
        if self.influx_writer:
            logger.info("Closing InfluxDB writer...")
            self.influx_writer.close()
        
        self.running = False
        logger.info("Telemetry Service Stopped.")

# Create a singleton instance
telemetry_service = TelemetryService()
