import influxdb_client
from influxdb_client.client.write_api import SYNCHRONOUS
from influxdb_client.client.exceptions import InfluxDBError
import os
import datetime

class InfluxDBWriter:
    def __init__(self, url, token, org, bucket):
        self.url = url
        self.token = token
        self.org = org
        self.bucket = bucket
        self.client = influxdb_client.InfluxDBClient(url=self.url, token=self.token, org=self.org)
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.delete_api = self.client.delete_api()
        self.query_api = self.client.query_api()
        self.buckets_api = self.client.buckets_api()

    def check_connection(self):
        """Checks the connection to the InfluxDB server."""
        try:
            return self.client.ping()
        except Exception as e:
            print(f"[{self.__class__.__name__}] Connection check failed: {e}")
            return False

    def backup_and_clear_bucket(self, backup_bucket_name):
        """
        Backs up all data from a bucket to a local file and then clears the bucket.
        If the bucket does not exist, the operation is skipped.
        """
        if self.bucket != backup_bucket_name:
            print(f"[{self.__class__.__name__}] Safety check failed: Bucket to clear '{backup_bucket_name}' does not match writer's target bucket '{self.bucket}'. Aborting clear.")
            return

        try:
            bucket_exists = self.buckets_api.find_bucket_by_name(backup_bucket_name)
            if not bucket_exists:
                print(f"[{self.__class__.__name__}] Bucket '{backup_bucket_name}' not found. Skipping backup and clear operation.")
                return
        except InfluxDBError as e:
            if e.response.status == 404:
                print(f"[{self.__class__.__name__}] Bucket '{backup_bucket_name}' not found. Skipping backup and clear operation.")
                return
            else:
                print(f"[{self.__class__.__name__}] Error checking for bucket '{backup_bucket_name}': {e}. Aborting clear operation.")
                return
        except Exception as e:
            print(f"[{self.__class__.__name__}] An unexpected error occurred while checking for bucket: {e}. Aborting clear operation.")
            return

        log_dir = "logs"
        os.makedirs(log_dir, exist_ok=True)
        timestamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d_%H%M%S")
        backup_file_path = os.path.join(log_dir, f"{backup_bucket_name}_backup_{timestamp}.lp")

        print(f"[{self.__class__.__name__}] Backing up bucket '{backup_bucket_name}' to '{backup_file_path}'...")
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
            print(f"[{self.__class__.__name__}] Backup complete. {count} records saved.")

        except InfluxDBError as e:
            if e.response.status == 404:
                 print(f"[{self.__class__.__name__}] No data found in bucket '{backup_bucket_name}' to back up.")
            else:
                print(f"[{self.__class__.__name__}] Error during backup: {e}. Aborting clear operation.")
                return
        except Exception as e:
            print(f"[{self.__class__.__name__}] Error during backup: {e}. Aborting clear operation.")
            return

        print(f"[{self.__class__.__name__}] Clearing bucket '{backup_bucket_name}'...")
        try:
            start = "1970-01-01T00:00:00Z"
            # Pass the datetime object directly to the client library
            stop = datetime.datetime.now(datetime.UTC)
            self.delete_api.delete(start, stop, "", bucket=backup_bucket_name, org=self.org)
            print(f"[{self.__class__.__name__}] Bucket '{backup_bucket_name}' cleared successfully.")
        except Exception as e:
            print(f"[{self.__class__.__name__}] Error clearing bucket: {e}")

    def write_data(self, measurement, tags, fields, timestamp):
        point = {
            "measurement": measurement,
            "tags": tags,
            "fields": fields,
            "time": timestamp
        }
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def close(self):
        self.write_api.close()
        self.client.close()
