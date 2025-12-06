#!/bin/bash
set -e

# --- Ensure jq is installed ---
if ! command -v jq &> /dev/null; then
    echo ">>> jq not found, installing..."
    if [ -f /etc/alpine-release ]; then
        # Alpine Linux
        apk add --no-cache jq
    elif [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        apt-get update && apt-get install -y jq
    else
        echo "ERROR: Unsupported OS, please install jq manually"
        exit 1
    fi
fi

echo ">>> Waiting for InfluxDB..."
sleep 5

ORG="LHRS"

echo ">>> Creating additional buckets..."
influx bucket create -n debug -o "$ORG" --retention 24h
influx bucket create -n scratch -o "$ORG" --retention 168h

echo ">>> Creating Grafana read-only token (buckets + queries)..."
GRAFANA_TOKEN=$(
  influx auth create \
    --description "grafana-read" \
    --read-buckets \
    --read-telegrafs \
    --org "$ORG" \
    --json | jq -r '.token'
)

echo "Grafana token created: $GRAFANA_TOKEN"

echo ">>> Writing Grafana datasource provisioning file..."
mkdir -p /shared-provisioning/datasources

cat >/shared-provisioning/datasources/influx.yml <<EOF
apiVersion: 1

datasources:
  - name: InfluxDB
    type: influxdb
    access: proxy
    url: http://influxdb:8086
    jsonData:
      version: Flux
      organization: "$ORG"
      defaultBucket: "telemetry_main"
    secureJsonData:
      token: "$GRAFANA_TOKEN"
EOF

chmod 755 "/shared-provisioning"
chown 472:472 "/shared-provisioning"

chmod 644 "/shared-provisioning/datasources/influx.yml"
chown 472:472 "/shared-provisioning/datasources/influx.yml"


echo ">>> InfluxDB initialization complete!"
