import influxdb_client
from influxdb_client.client.write_api import WriteOptions
from influxdb_client.client.exceptions import InfluxDBError
import os
import datetime
import logging

logger = logging.getLogger(__name__)

class InfluxDBWriter:
    def __init__(self, url, token, org, bucket):
        self.url = url
        self.token = token
        self.org = org
        self.bucket = bucket
        self.client = influxdb_client.InfluxDBClient(url=self.url, token=self.token, org=self.org)
        
        write_options = WriteOptions(
            batch_size=500,
            flush_interval=200,
            jitter_interval=0,
            retry_interval=5000,
            max_retries=5,
            max_retry_delay=30000,
            exponential_base=2
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

    def backup_and_clear_bucket(self, backup_bucket_name):
        """
        Backs up all data from a bucket to a local file and then clears the bucket.
        """
        if self.bucket != backup_bucket_name:
            logger.warning(f"Safety check failed: Bucket to clear '{backup_bucket_name}' does not match writer's target bucket '{self.bucket}'. Aborting clear.")
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
        except Exception as e:
            logger.error(f"An unexpected error occurred while checking for bucket: {e}. Aborting clear operation.")
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
            with open(backup_file_path, "w") as f:
                for record in result:
                    measurement = record.get_measurement()
                    tags = "".join([f",{key}={value}" for key, value in record.values.items() if key not in ['_start', '_stop', '_time', '_measurement', '_field', '_value']])
                    field = f"{record.get_field()}={record.get_value()}"
                    time_ns = record.get_time().timestamp() * 1e9
                    line = f"{measurement}{tags} {field} {int(time_ns)}"
                    f.write(line + "\n")
                    count += 1
            logger.info(f"Backup complete. {count} records saved.")

        except InfluxDBError as e:
            if e.response.status == 404:
                 logger.info(f"No data found in bucket '{backup_bucket_name}' to back up.")
            else:
                logger.error(f"Error during backup: {e}. Aborting clear operation.")
                return
        except Exception as e:
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
                logger.info(f"  - Deleting measurement: {measurement}")
                predicate = f'_measurement="{measurement}"'
                self.delete_api.delete(start, stop, predicate, bucket=backup_bucket_name, org=self.org)
            
            logger.info(f"Bucket '{backup_bucket_name}' cleared successfully.")
        except Exception as e:
            logger.error(f"Error clearing bucket: {e}")

    def write_data(self, measurement, tags, fields, timestamp):
        """
        Writes a data point to the internal buffer. The client handles batching and sending.
        """
        point = {
            "measurement": measurement,
            "tags": tags,
            "fields": fields,
            "time": timestamp
        }
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def close(self):
        logger.info("Closing InfluxDB writer and flushing buffer.")
        self.write_api.close()
        self.client.close()
