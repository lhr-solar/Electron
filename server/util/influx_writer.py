import influxdb_client
from influxdb_client import Point
from influxdb_client.client.write_api import WriteOptions
from influxdb_client.client.exceptions import InfluxDBError
import os
import datetime
import logging

logger = logging.getLogger(__name__)

class InfluxDBWriter:
    def __init__(self, client: influxdb_client.InfluxDBClient, bucket: str):
        """
        Initializes the writer with a shared InfluxDB client and a specific target bucket.
        """
        self.client = client
        self.bucket = bucket
        self.org = client.org
        
        write_options = WriteOptions(
            batch_size=500,
            flush_interval=1000,
            jitter_interval=200,
            retry_interval=5000
        )
        
        self.write_api = self.client.write_api(write_options=write_options)
        self.delete_api = self.client.delete_api()
        self.query_api = self.client.query_api()
        self.buckets_api = self.client.buckets_api()

    def check_connection(self):
        """Checks the connection to the InfluxDB server."""
        try:
            return self.client.ping()
        except Exception as e:
            logger.error(f"Connection check failed: {e}")
            return False

    def backup_and_clear_bucket(self):
        """
        Backs up all data from the writer's target bucket and then clears it.
        """
        backup_bucket_name = self.bucket
        if not backup_bucket_name.startswith("debug"):
            logger.error(f"SAFETY VIOLATION: Attempted to clear a non-debug bucket ('{backup_bucket_name}'). Aborting.")
            return

        try:
            if not self.buckets_api.find_bucket_by_name(backup_bucket_name):
                logger.info(f"Bucket '{backup_bucket_name}' not found. Skipping backup and clear operation.")
                return
        except InfluxDBError as e:
            if e.response.status == 404:
                logger.info(f"Bucket '{backup_bucket_name}' not found. Skipping backup and clear operation.")
                return
            else:
                logger.error(f"Error checking for bucket '{backup_bucket_name}': {e}. Aborting clear operation.")
                return

        log_dir = "logs"
        os.makedirs(log_dir, exist_ok=True)
        timestamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d_%H%M%S")
        backup_file_path = os.path.join(log_dir, f"{backup_bucket_name}_backup_{timestamp}.lp")

        logger.info(f"Backing up bucket '{backup_bucket_name}' to '{backup_file_path}'...")
        try:
            query = f'from(bucket: "{backup_bucket_name}") |> range(start: 0)'
            result = self.query_api.query_stream(query)
            
            count = 0
            skip_keys = {'_start', '_stop', '_time', '_measurement', '_field', '_value'}
            with open(backup_file_path, "w") as f:
                for record in result:
                    p = Point(record.get_measurement()).time(record.get_time())
                    for key, value in record.values.items():
                        if key in skip_keys:
                            continue
                        p = p.tag(key, value)
                    p = p.field(record.get_field(), record.get_value())
                    f.write(p.to_line_protocol() + "\n")
                    count += 1
            logger.info(f"Backup complete. {count} records saved.")

        except InfluxDBError as e:
            if e.response.status == 404:
                 logger.info(f"No data found in bucket '{backup_bucket_name}' to back up.")
            else:
                logger.error(f"Error during backup: {e}. Aborting clear operation.")
                return

        logger.info(f"Clearing bucket '{backup_bucket_name}'...")
        try:
            measurement_query = f'import "influxdata/influxdb/schema" schema.measurements(bucket: "{backup_bucket_name}")'
            tables = self.query_api.query(measurement_query, org=self.org)
            measurements = [row.values["_value"] for table in tables for row in table.records]

            if not measurements:
                logger.info(f"No measurements found in bucket '{backup_bucket_name}'. Nothing to clear.")
                return

            start = "1970-01-01T00:00:00Z"
            stop = datetime.datetime.now(datetime.UTC)
            
            for measurement in measurements:
                predicate = f'_measurement="{measurement}"'
                self.delete_api.delete(start, stop, predicate, bucket=backup_bucket_name, org=self.org)
            
            logger.info(f"Bucket '{backup_bucket_name}' cleared successfully.")
        except Exception as e:
            logger.error(f"Error clearing bucket: {e}")

    def write_data(self, measurement, tags, fields, timestamp):
        point = {"measurement": measurement, "tags": tags, "fields": fields, "time": timestamp}
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def close(self):
        logger.info(f"Closing InfluxDB writer for bucket '{self.bucket}' and flushing buffer.")
        self.write_api.close()
        # Do not close the client here, as it's shared.
