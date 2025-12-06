import queue
import time
from ..util.influx_writer import InfluxDBWriter
from influxdb_client.client.exceptions import InfluxDBError

class InfluxWriterThread:
    def __init__(self, stop_event, config):
        self.queue = queue.Queue()
        self.stop_event = stop_event
        self.config = config
        self.connected = False
        
        self.influx_writer = InfluxDBWriter(
            url=config.get("INFLUX_URL", "http://localhost:8086"),
            token=config.get("INFLUX_TOKEN", "your-token"),
            org=config.get("INFLUX_ORG", "your-org"),
            bucket=config.get("INFLUX_BUCKET", "debug") # Default to debug
        )

    def _connect_to_influx(self):
        """Tries to connect to InfluxDB, retrying until successful or stopped."""
        print(f"[{self.__class__.__name__}] Attempting to connect to InfluxDB...")
        while not self.stop_event.is_set():
            if self.influx_writer.check_connection():
                print(f"[{self.__class__.__name__}] InfluxDB connection successful.")
                self.connected = True
                return True
            else:
                print(f"[{self.__class__.__name__}] InfluxDB connection failed. Retrying in 5 seconds...")
                self.stop_event.wait(5)
        return False

    def _handle_startup_clear(self):
        """Checks config and clears the debug bucket if requested."""
        if self.config.get("CLEAR_DEBUG_BUCKET_ON_STARTUP") and self.config.get("INFLUX_BUCKET") == "debug":
            print(f"[{self.__class__.__name__}] Startup clear requested for 'debug' bucket.")
            self.influx_writer.backup_and_clear_bucket("debug")
        else:
            print(f"[{self.__class__.__name__}] Skipping startup clear.")

    def run(self):
        """Continuously tries to connect, handles startup clear, and then writes data."""
        print(f"[{self.__class__.__name__}] Thread started.")
        
        if not self._connect_to_influx():
            print(f"[{self.__class__.__name__}] Shutting down without connecting.")
            return

        # Handle the pre-run clear operation
        self._handle_startup_clear()

        while not self.stop_event.is_set():
            try:
                measurement, tags, fields, timestamp = self.queue.get(timeout=1)
                self.influx_writer.write_data(measurement, tags, fields, timestamp)
            except queue.Empty:
                continue
            except InfluxDBError as e:
                print(f"[{self.__class__.__name__}] Error writing to InfluxDB: {e}")
                print(f"[{self.__class__.__name__}] Pausing writes and attempting to reconnect...")
                self.connected = False
                self.queue.put((measurement, tags, fields, timestamp))
                if not self._connect_to_influx():
                    break
            except Exception as e:
                print(f"[{self.__class__.__name__}] An unexpected error occurred: {e}")
                time.sleep(1)
        
        print(f"[{self.__class__.__name__}] Shutdown initiated. Processing remaining items in queue...")
        while not self.queue.empty():
            try:
                measurement, tags, fields, timestamp = self.queue.get_nowait()
                if self.connected:
                    self.influx_writer.write_data(measurement, tags, fields, timestamp)
                else:
                    print(f"[{self.__class__.__name__}] Not connected, cannot process remaining items. Data may be lost.")
                    break
            except (queue.Empty, InfluxDBError):
                print(f"[{self.__class__.__name__}] Could not process remaining items. Data may be lost.")
                break

        self.influx_writer.close()
        print(f"[{self.__class__.__name__}] Thread finished.")

    def add_to_queue(self, measurement, tags, fields, timestamp):
        """Adds a data point to the writing queue."""
        self.queue.put((measurement, tags, fields, timestamp))
