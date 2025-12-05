import queue
from ..util.influx_writer import InfluxDBWriter

class InfluxWriterThread:
    def __init__(self, stop_event, config):
        self.queue = queue.Queue()
        self.stop_event = stop_event
        self.config = config
        
        # InfluxDB connection details are passed via config
        self.influx_writer = InfluxDBWriter(
            url=config.get("INFLUX_URL", "http://localhost:8086"),
            token=config.get("INFLUX_TOKEN", "your-token"),
            org=config.get("INFLUX_ORG", "your-org"),
            bucket=config.get("INFLUX_BUCKET", "your-bucket")
        )

    def run(self):
        """Gets data from the queue and writes it to InfluxDB."""
        print(f"[{self.__class__.__name__}] Thread started.")
        while not self.stop_event.is_set() or not self.queue.empty():
            try:
                # Data is expected to be a tuple: (measurement, tags, fields, timestamp)
                measurement, tags, fields, timestamp = self.queue.get(timeout=0.5)
                self.influx_writer.write_data(measurement, tags, fields, timestamp)
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[{self.__class__.__name__}] Error: {e}")
        
        self.influx_writer.close()
        print(f"[{self.__class__.__name__}] Thread finished.")

    def add_to_queue(self, measurement, tags, fields, timestamp):
        """Adds a data point to the writing queue."""
        self.queue.put((measurement, tags, fields, timestamp))
