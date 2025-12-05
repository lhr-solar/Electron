import influxdb_client
from influxdb_client.client.write_api import SYNCHRONOUS

class InfluxDBWriter:
    def __init__(self, url, token, org, bucket):
        self.client = influxdb_client.InfluxDBClient(url=url, token=token, org=org)
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.bucket = bucket
        self.org = org

    def write_data(self, measurement, tags, fields, timestamp):
        point = {
            "measurement": measurement,
            "tags": tags,
            "fields": fields,
            "time": timestamp
        }
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def close(self):
        self.client.close()
