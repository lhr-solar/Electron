import influxdb_client
from influxdb_client.client.write_api import SYNCHRONOUS
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
        """
        if self.bucket != backup_bucket_name:
            print(f"[{self.__class__.__name__}] Safety check failed: Bucket to clear '{backup_bucket_name}' does not match writer's target bucket '{self.bucket}'. Aborting clear.")
            return

        # 1. Create backup directory
        log_dir = "logs"
        os.makedirs(log_dir, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file_path = os.path.join(log_dir, f"{backup_bucket_name}_backup_{timestamp}.lp")

        # 2. Query and stream data to the backup file
        print(f"[{self.__class__.__name__}] Backing up bucket '{backup_bucket_name}' to '{backup_file_path}'...")
        try:
            query = f'from(bucket: "{backup_bucket_name}") |> range(start: 0)'
            result = self.query_api.query_stream(query)
            
            count = 0
            with open(backup_file_path, "w") as f:
                for record in result:
                    # This is a simplified conversion to line protocol.
                    # A more robust solution would handle data types more carefully.
                    measurement = record.get_measurement()
                    tags = "".join([f",{key}={value}" for key, value in record.values.items() if key not in ['_start', '_stop', '_time', '_measurement', '_field', '_value']])
                    field = f"{record.get_field()}={record.get_value()}"
                    time = record.get_time().timestamp() * 1e9 # to nanoseconds
                    line = f"{measurement}{tags} {field} {int(time)}"
                    f.write(line + "\n")
                    count += 1
            print(f"[{self.__class__.__name__}] Backup complete. {count} records saved.")

        except Exception as e:
            print(f"[{self.__class__.__name__}] Error during backup: {e}. Aborting clear operation.")
            return

        # 3. Clear the bucket
        print(f"[{self.__class__.__name__}] Clearing bucket '{backup_bucket_name}'...")
        try:
            start = "1970-01-01T00:00:00Z"
            stop = datetime.datetime.utcnow().isoformat("T") + "Z"
            self.delete_api.delete(start, stop, f'_measurement/.*/', bucket=backup_bucket_name, org=self.org)
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
