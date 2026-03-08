# Telemetry UI / CAN Parsing

Setup and run the app from scratch.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Docker & Docker Compose

## 1. Build the client

```bash
cd client
npm install
npm run build
cd ..
```

## 2. Start InfluxDB and Grafana (Docker)

```bash
cd grafana
docker compose -f docker-compose.yml up -d
cd ..
```

After InfluxDB init scripts finish (they create buckets and the Grafana datasource), restart only the Grafana container so it picks up the provisioned datasource:

```bash
cd grafana
docker compose restart grafana
cd ..
```

## 3. Create Python venv and run the server

```bash
python3 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
.venv/bin/uvicorn server.app:asgi_app --host 0.0.0.0 --port 4000
```

## Access

- **Telemetry UI:** http://localhost:4000
- **Grafana:** http://localhost:3000 (admin / lhrs2025!)
- **InfluxDB:** http://localhost:8086

## Optional: .env

Copy `.env.example` to `.env` and configure:

- `INFLUX_TOKEN` – InfluxDB API token (get from InfluxDB UI after first run)
- `GRAFANA_URL` – Grafana base URL (default: http://127.0.0.1:3000)
- `DBC_DIR`, `LOG_DIR`, `TRASH_DIR` – Paths for DBC files, logs, trash
