# CAN Backend

Python REST + WebSocket API and sinks. Wraps the C++ engine in-process via the
`can_engine` nanobind module. Wire contract: [`API_CONTRACT.md`](./API_CONTRACT.md).

## Layout

```
backend/
  main.py        FastAPI app — REST routes + /ws WebSocket
  webapp.py      role-gated static web-app serving (server mode: app/dist + SPA)
  telemetry.py   pipeline: poll engine -> cache -> fan-out to WS + sinks (~100ms)
  engine.py      guarded can_engine import + FakeEngine replay fallback
  state.py       config (desktop default or BACKEND_CONFIG file) + MDC spec store
  schemas.py     config + MDC validation against the bundled JSON Schemas
  sinks/         Sink protocol + influx (default), sqlite, file
  examples/      server.config.json — role:server (TCP slcan listener + Influx)
  tests/         pytest smoke test (status + WS live_message_batch)
```

## Run

```sh
pip install -e backend           # lean runtime deps
pip install -e "backend[dev]"    # + pytest/httpx for tests
uvicorn backend.main:app --host 127.0.0.1 --port 8350
python -m backend.main           # equivalent; uses api.host/port from config
```

REST: `GET/PUT/PATCH /api/config`, `GET /api/mdc` + `GET/PUT/DELETE /api/mdc/{id}`,
`POST /api/start`, `POST /api/stop`, `GET /api/status`. WS at `/ws`.

## Server mode (headless host)

The same app boots headless with `role: server`. Point `BACKEND_CONFIG` at a
config file; `${VAR}` placeholders expand from the environment (so secrets like
the Influx token never live in the file):

```sh
INFLUX_TOKEN=... BACKEND_CONFIG=backend/examples/server.config.json \
  uvicorn backend.main:app --host 0.0.0.0 --port 8350
```

In server mode the backend additionally:

- **Serves the web app** at `/` from `server.webRoot` (default `app/dist`,
  repo-root relative) with SPA fallback — same app + viewports the desktop uses.
  Missing build → placeholder page, never a crash. See `webapp.py`.
- **Runs the TCP slcan listener.** The vehicle's slcan stream is ingested by the
  engine's `tcp-slcan` listener, wired purely through config — no backend code
  knows about transports. In `backend/examples/server.config.json` it's a
  `server.listeners[]` entry (`type: tcp-slcan`, `host: 0.0.0.0`, `port: 8187`),
  the schema's server-ingest contract (`engine/config.schema.json` → `server`).
  The backend hands the whole config to `can_engine`; the engine binds/accepts.

Desktop mode (no `BACKEND_CONFIG`, `role: desktop`) serves no static files —
Tauri serves the bundle — and uses local sources, not listeners.

The full stack (backend + Grafana + InfluxDB in Docker) lives in `deploy/`.

## Engine import is guarded

`engine.make_engine(config)` tries `import can_engine` and returns a real
`EngineHandle`. If the native module is absent (CI, this sandbox, a dev box with
no native build), it logs a warning and returns `FakeEngine`, which replays a
sample `live_message_batch` so the backend boots and tests pass.

**Swap in the real engine:** build/install `can_engine` so `import can_engine`
succeeds — no code change needed.

## Sinks

Implement the `Sink` protocol (`write_batch`, `close`, `healthy`) and add a branch
in `sinks/make_sink`. Adding a sink is Python-only. Writes run on the telemetry
task (off the request path), batched per poll. Configured via the `sinks[]` array
in the engine config (`engine/config.schema.json`): `influx` (default), `sqlite`,
`file`.

## Tests

```sh
pytest backend/tests
```

## Packaging (Nuitka sidecar)

Desktop/Tauri packaging compiles this backend to a native sidecar that bundles
`can_engine`. Script: `backend/build_sidecar.py` (wrapper: `scripts/build-backend.sh`).

```sh
# 1. Build the engine binding first (produces engine/build/binding/can_engine*.so)
cmake -B engine/build -S engine -DCMAKE_BUILD_TYPE=Release && cmake --build engine/build

# 2. Nuitka-compile → app/src-tauri/binaries/backend-<rust-target-triple>[.exe]
pip install -e backend nuitka ordered-set
python backend/build_sidecar.py
```

Output name matches Tauri `externalBin` base `backend` + host triple. See the script
docstring for Nuitka flags and how `can_engine` is staged on `PYTHONPATH`. Keep
heavy analytics (`backend[analytics]`: pandas/numpy) out of the desktop bundle.
```
