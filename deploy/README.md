# Deploy — server stack

The headless server stack: one **Python backend** (`role: server`) that serves
the web app + REST/WS API + the **TCP slcan listener** the vehicle streams into,
plus **InfluxDB** (sink) and **Grafana** (dashboards). The server hosts
everything — browser clients load the SAME app + viewports the desktop uses.

```
vehicle ──slcan over TCP:8187──▶ backend (role: server) ──▶ InfluxDB
                                    │  serves app/dist + REST/WS at :8350
browser ──http://host:8350────────▶┘
Grafana :3000 ──queries──▶ InfluxDB   (dashboards generated from the MDC spec)
```

## Files

```
deploy/
  docker-compose.yml        backend + influxdb + grafana
  Dockerfile.backend        2-stage: build app/dist (node) -> python runtime
  generate-dashboards.sh    mdc2grafana -> grafana-dashboards/ (run before up)
  .env.example              copy to .env, fill secrets/ports
  grafana/provisioning/     datasource (env-templated) + dashboard provider
  grafana-dashboards/       generated dashboards (gitignored, mounted into Grafana)
```

## Bring the stack up

```sh
cp deploy/.env.example deploy/.env      # then edit secrets + ports
deploy/generate-dashboards.sh           # mdc2grafana -> deploy/grafana-dashboards
docker compose -f deploy/docker-compose.yml up --build
```

Validate the compose file without starting anything:

```sh
docker compose -f deploy/docker-compose.yml config
```

| Service | Port (host → container) | URL |
|---------|------------------------|-----|
| backend | `${BACKEND_PORT}` → 8350 | REST/WS API **and the web app** |
| backend | `${SLCAN_PORT}` → 8187 | TCP slcan listener (vehicle connects here) |
| influxdb | 8086 → 8086 | InfluxDB v2 |
| grafana | `${GRAFANA_PORT}` → 3000 | Grafana UI |

## Where the web app is served

The backend serves the built React app at **`http://localhost:${BACKEND_PORT}/`**
(default `:8350`) — same origin as the API. It comes from `app/dist`, built in
the backend image's first stage and configured by `server.webRoot` in
`backend/examples/server.config.json`. If `app/` isn't in the build context, the
backend serves a placeholder page and still boots; the API stays usable.

## How the vehicle connects to the TCP listener

The engine runs a **`tcp-slcan` listener** (server-mode ingest), wired purely via
config in `backend/examples/server.config.json`:

```json
"server": { "listeners": [ { "type": "tcp-slcan", "host": "0.0.0.0", "port": 8187 } ] }
```

The vehicle's CAN gateway opens a TCP connection to **`host:${SLCAN_PORT}`** (8187)
and pushes slcan ASCII frames. The engine accepts, frames, decodes against the
MDC spec, and fans decoded batches out to WS clients + the Influx sink. No
backend code is transport-aware — change the listener entirely through config.

## Grafana provisioning

- **Datasource:** `grafana/provisioning/datasources/influx.yml`, reusing the
  shape of the reference `grafana/provisions/datasources/influx.yml`. The token /
  org / bucket are injected from the environment (`.env` → compose), so no secret
  lives in the file.
- **Dashboards:** generated from the MDC spec by `deploy/mdc2grafana.mjs` via
  `generate-dashboards.sh` into `grafana-dashboards/`, mounted read-only into
  Grafana and loaded by the `dashboards.yml` file provider. Regenerate after the
  MDC spec changes (provider re-reads on a 30s poll) — do not hand-edit the JSON.

## Local, no-Docker (SQLite)

For a laptop run without Docker/Influx, swap the sink to SQLite and run uvicorn
directly. Make a local config (copy `backend/examples/server.config.json`) with:

```json
"sinks": [ { "type": "sqlite", "path": "telemetry.db" } ]
```

then:

```sh
BACKEND_CONFIG=path/to/local.config.json \
  uvicorn backend.main:app --host 0.0.0.0 --port 8350
```

The web app, REST/WS API, and TCP listener all still run; only the sink and
Grafana differ (point Grafana at the SQLite file separately, or skip it).
