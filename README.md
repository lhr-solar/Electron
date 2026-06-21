# CAN Platform

Re-platform of the CAN ingest/decode/telemetry stack. Polyglot monorepo:

| Dir | Stack | What it is |
|-----|-------|------------|
| `engine/` | C++20 (CMake + vcpkg, nanobind) | Hot-path ingest + MDC decode, exposed to Python as the `can_engine` module. No HTTP, no sinks. |
| `backend/` | Python 3.11 (FastAPI) | REST/WS API + sinks (Influx/SQLite/file); wraps the C++ engine. Runs as a Tauri sidecar or headless server. |
| `app/` | Tauri 2 + React + Vite 8 | Desktop app and (same build) the browser UI served by the backend. |
| `Embedded-Sharepoint/can/mdc/` | JSON Schema + Node ESM | The MDC protocol — schema + `lib/` + `tools/` (`bundle`, `validate`, `dbc2mdc`, `mdc2cheaders`); the decode contract (git submodule). |
| `Embedded-Sharepoint/can/vehicles/` | DBC + JSON | Per-vehicle DBCs + MDC projects (submodule). |
| `deploy/` | Docker Compose | Server stack: backend + Grafana + InfluxDB; `mdc2grafana.mjs` (dashboards from the MDC spec). |

See **`AGENTS.md`** for the architecture, the four contracts, and the orchestration model.

## Build / run

```bash
# Engine (C++ module + tests)
cmake -S engine -B engine/build && cmake --build engine/build && ctest --test-dir engine/build

# Backend (Python API; needs the can_engine module on PYTHONPATH)
python -m venv backend/.venv && backend/.venv/bin/pip install -e "backend[dev]"
backend/.venv/bin/pytest backend/tests
backend/.venv/bin/python backend_sidecar.py          # serve API on 127.0.0.1:8350

# App (desktop / web UI)
npm --prefix app install && npm --prefix app run dev

# MDC tools
npm --prefix Embedded-Sharepoint/can/mdc install && npm --prefix Embedded-Sharepoint/can/mdc run validate

# Server stack
docker compose -f deploy/docker-compose.yml up -d
```

## Build into one desktop app

The engine, Python backend, and Tauri frontend ship as a **single native app**: Tauri
bundles the React UI + a self-contained backend binary, and spawns that binary as a
sidecar at runtime. The sidecar has the C++ engine compiled into it, so the installer is
the only thing a user needs.

```
C++ engine ──cmake──▶ can_engine*.so
                          │  (--include-module)
Python backend ─Nuitka─▶ backend-<triple>   (one binary: API + engine + schemas)
                          │  (tauri externalBin)
React UI ──vite──▶ dist ──┴─tauri build─▶ installer (.dmg/.app, .msi/.exe, .deb/.AppImage)
```

One command (chains all three stages):

```bash
./scripts/build-app.sh
```

Prerequisites: `cmake` + a C++20 compiler, `backend/.venv` with `pip install -e "backend" "nuitka[onefile]" ordered-set`, Node 20+, and the **Rust toolchain** (`rustup`, required by Tauri). Output lands in `app/src-tauri/target/release/bundle/`.

Stages individually, if you need them:

```bash
cmake -S engine -B engine/build -DCMAKE_BUILD_TYPE=Release && cmake --build engine/build  # 1
backend/.venv/bin/python backend/build_sidecar.py                                          # 2
npm --prefix app run tauri build                                                           # 3
```

## Canonical build/dep locations

One home per concern — do not recreate these at the repo root (all git-ignored):

- Python env → `backend/.venv`
- JS deps → `app/node_modules`, `Embedded-Sharepoint/can/mdc/node_modules`
- C++ build → `engine/build`
- App build output → `app/dist`, Tauri → `app/src-tauri/target`
- Knowledge graph → `graphify-out/`
