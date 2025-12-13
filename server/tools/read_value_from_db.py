import influxdb_client
import logging
from server.config import settings

CAN_ID_HEX = "242"
FIELD_NAME = "MC_BusCurrent"   # Example: The specific signal you want to read

# Set the time range for the query (e.g., '1h', '30m', '7d')
TIME_RANGE = "1h"
# ---------------------

# --- Setup Logging ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def query_and_analyze():
    """
    Connects to InfluxDB, queries for a specific field from a specific CAN ID,
    and prints the values and statistics.
    """
    config = settings.get_effective_config()
    if not config:
        logger.error("Could not load configuration.")
        return

    logger.info(f"Connecting to InfluxDB at {config['INFLUX_URL']}...")
    try:
        client = influxdb_client.InfluxDBClient(
            url=config['INFLUX_URL'],
            token=config['INFLUX_TOKEN'],
            org=config['INFLUX_ORG']
        )
        query_api = client.query_api()
        logger.info("Connection successful.")
    except Exception as e:
        logger.error(f"Failed to connect to InfluxDB: {e}")
        return

    # Use the bucket that corresponds to the current input mode
    bucket = config['INFLUX_BUCKET']
    
    logger.info(f"Querying for Measurement: '{CAN_ID_HEX}', Field: '{FIELD_NAME}' in Bucket: '{bucket}' for the last {TIME_RANGE}")

    # Construct the Flux query
    query = f'''
    from(bucket: "{bucket}")
      |> range(start: -{TIME_RANGE})
      |> filter(fn: (r) => r["_measurement"] == "{CAN_ID_HEX}")
      |> filter(fn: (r) => r["_field"] == "{FIELD_NAME}")
    '''

    try:
        tables = query_api.query(query, org=config['INFLUX_ORG'])
        
        values = []
        numeric_values = []

        for table in tables:
            for record in table.records:
                value = record.get_value()
                values.append(value)
                # Try to convert to a number for stats
                try:
                    numeric_values.append(float(value))
                except (ValueError, TypeError):
                    # This value is not a number, so we'll skip it for stats
                    pass
        
        if not values:
            logger.warning("No data found for the specified CAN ID and Field.")
            return

        logger.info(f"--- Found {len(values)} Data Points ---")
        for v in values:
            print(v)

        if numeric_values:
            logger.info("--- Numeric Statistics ---")
            logger.info(f"  - Count: {len(numeric_values)}")
            logger.info(f"  - Min:   {min(numeric_values)}")
            logger.info(f"  - Max:   {max(numeric_values)}")
            logger.info(f"  - Avg:   {sum(numeric_values) / len(numeric_values):.2f}")

    except Exception as e:
        logger.error(f"An error occurred during the query: {e}", exc_info=True)
    finally:
        logger.info("Closing InfluxDB client.")
        client.close()

if __name__ == "__main__":
    query_and_analyze()
