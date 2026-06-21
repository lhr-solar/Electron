# API Contract (REST + WebSocket)

> **POST-PIVOT OWNERSHIP:** this API is implemented by the **Python `backend/`**
> (FastAPI), not C++/Drogon. This is the authoritative copy (relocated here from
> `engine/api/`); the wire shapes below are unchanged. The C++ engine has no HTTP
> server — it feeds the backend in-process via the `can_engine` nanobind module.

One of the four project contracts. The React app builds its client against this
document. **Mirror the v3 payload shapes** — the `live_message_batch` and
`status` shapes match the Python v3 stack (`server/services/telemetry.py`,
`server/app.py`) so the UI port is a transport swap, not a data-model rewrite.

- **Base URL:** `http://{api.host}:{api.port}` (defaults `127.0.0.1:8350`, see
  `engine/config.schema.json`).
- **WebSocket:** `ws://{api.host}:{api.port}/ws`.
- **Encoding:** UTF-8 JSON everywhere.
- **Static web app (server mode only):** when `role == server`, the same origin
  also serves the built React app (`server.webRoot`, default `app/dist`) so
  browser clients load the SAME app + viewports the desktop uses. `GET /` returns
  `index.html`; hashed bundles are under `/assets/*`; any other non-`/api`,
  non-`/ws` GET falls back to `index.html` (SPA routing). In `role == desktop`
  (Tauri sidecar) nothing static is mounted — Tauri serves the bundle. If the
  build is missing, `/` returns a placeholder page (the API stays usable).
- **Compatibility:** additive only. New fields may appear; clients must ignore
  unknown fields. Existing field names/types never change silently.

> Transport note: The previous Python stack used Socket.IO named events (`live_message_batch`,
> `status`). The engine uses **raw WebSocket**, so every server→client message is
> wrapped in a typed envelope (below). The *payloads* are unchanged from v3.

---

## WebSocket

### Server → client envelope

Every frame the server pushes uses this envelope. `type` replaces the Socket.IO
event name; `payload` is the unchanged v3 data.

```json
{
  "type": "live_message_batch | status",
  "payload": "<type-specific, see below>"
}
```

### `live_message_batch`

Emitted on a fixed cadence (v3: every 100 ms, batches up to 200 messages).
`payload` is an **array** of decoded-message objects.

```json
{
  "type": "live_message_batch",
  "payload": [
    {
      "timestamp_ns": 1718053123456789000,
      "raw_packet": "t1A4380F1C2",
      "can_id_hex": "0x1A4",
      "message_name": "BMS_Status",
      "sender": "BMS",
      "network": "powertrain",
      "vehicle": "Mcqueen",
      "signals": { "PackVoltage": 398.2, "State": "Active" },
      "units": { "PackVoltage": "V" },
      "array_index": 3
    }
  ]
}
```

Per-message fields:

| Field | Type | Notes |
|-------|------|-------|
| `timestamp_ns` | integer | Capture time, ns since epoch. |
| `raw_packet` | string | Raw on-wire frame (slcan text in v3). |
| `can_id_hex` | string | Arbitration id, e.g. `"0x1A4"`. |
| `message_name` | string \| null | `null` when the id is unknown / undecodable. |
| `sender` | string | ECU name; `"not_found"` when unknown. |
| `network` | string | Bus/network name; `"not_found"` when unknown. |
| `vehicle` | string | Active vehicle/spec name. |
| `signals` | object | `{ signalName: number \| string }`. Empty `{}` when undecodable. |
| `units` | object | `{ signalName: string }`. Present on decoded messages; omit when none. |
| `array_index` | integer | **Optional.** Present only for array/multiplexed messages; the index this frame fills. |

### `status`

Emitted on connect, on change, and on a health-poll interval. `payload`:

```json
{
  "type": "status",
  "payload": {
    "service_running": true,
    "influx_connected": true,
    "grafana_active": false,
    "grafana_url": "http://127.0.0.1:3000",
    "parser_status": "running",
    "parser_connection_state": true,
    "error_message": null,
    "dbc_errors": [],
    "influx_bucket": "debug",
    "vehicle": "Mcqueen",
    "active_event": null
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `service_running` | boolean | Engine pipeline running. |
| `influx_connected` | boolean | Influx sink reachable. |
| `grafana_active` | boolean | Grafana health (server mode). |
| `grafana_url` | string | Grafana base URL. |
| `parser_status` | string | Source status: `idle \| running \| error \| finished`. Mirrors `SourceStatus.status`. |
| `parser_connection_state` | boolean \| null | Source link state; `null` until known. |
| `error_message` | string \| null | Set when `parser_status == "error"`. |
| `dbc_errors` | string[] | MDC/DBC load/parse errors for the UI. |
| `influx_bucket` | string | Active Influx bucket. |
| `vehicle` | string | Active vehicle/spec name. |
| `active_event` | object \| null | **Optional.** Currently active named event marker, or `null`. Same shape as the [Event](#event) model. |

### Client → server

| Type | Payload | Effect |
|------|---------|--------|
| `request_cache` | none | Server replies with `signal_cache` (full current message cache, keyed `"vehicle::sender"` → `can_id_hex` → message object). |
| `reset_cache` | none | Clears the server-side message cache. |

`signal_cache` envelope mirrors the cache built in v3 `_update_cache` (same
per-message object shape as `live_message_batch` items, grouped by sender).

---

## REST

JSON request/response bodies. Non-2xx returns
`{ "error": { "title": string, "detail": string } }`.

### Config CRUD — `engine/config.schema.json`

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/config` | — | Current effective config (validates against `config.schema.json`). |
| `PUT` | `/api/config` | full config | Replaces config; `400` with validation error on schema violation. |
| `PATCH` | `/api/config` | partial config | Merges into current config. |

### MDC spec CRUD — `mdc/schema/mdc.schema.json` (v3 flat root)

MDC documents are **v3 flat-root** specs: one document = one vehicle. Root fields
include `schemaVersion` (`"3.0.0"`), `id`, optional `name`/`description`/`metadata`/
`attributeDefinitions`/`valueTables`/`attributes`, and required `networks[]`. Cantools-
shaped field names apply throughout (`frame_id`, `start`/`length`, `byte_order`,
`is_signed`/`is_float`, `scale`/`offset`, `comment`, `baudrate`/`fd_baudrate`, etc.).
See `Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json`.

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/mdc` | — | List available MDC specs (`{ id, metadata }[]`). |
| `GET` | `/api/mdc/{id}` | — | Full v3 MDC document. |
| `PUT` | `/api/mdc/{id}` | MDC document | Create/replace; validates against the v3 MDC schema. |
| `DELETE` | `/api/mdc/{id}` | — | Remove a spec. |

#### DBC import/export (REST only)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/api/mdc/import-dbc` | multipart `file` (`.dbc` upload); optional query `vehicle_id` | `{ "spec": <v3 MDC document> }` — validated before return. `400` on import/validation failure. |
| `POST` | `/api/mdc/export-dbc` | v3 MDC document; optional query `network_id` (required when `networks[]` has more than one entry) | `{ "dbc": string, "warnings": string[] }` — `warnings` lists best-effort lossy drops (`mdc2dbc: warning: …`). `400` on validation/export failure. |

`import-dbc` runs `Embedded-Sharepoint/can/mdc/tools/dbc2mdc.py` (cantools-backed).
`export-dbc` runs `mdc2dbc.py` when present, otherwise an inline cantools fallback.
Both require the optional `tools` extra (`cantools`) or a working tool script on disk.

### Lifecycle

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/api/start` | — | Starts the pipeline. `400` `{error}` if pre-start validation fails (mirrors v3 `validate_start_config`). |
| `POST` | `/api/stop` | — | Stops the pipeline. |
| `GET` | `/api/status` | — | One-shot `status` payload (same shape as the WS `status` payload). |

### Named events (time-range markers)

Event metadata stored alongside telemetry (not in the engine). Active while
`end_ts_ns` is `null`. Timestamps are nanoseconds since epoch.

#### Event

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Opaque id assigned by the server. |
| `name` | string | Human-readable label. |
| `start_ts_ns` | integer | Start time, ns since epoch. |
| `end_ts_ns` | integer \| null | End time; `null` while active. |
| `tags` | string[] | Optional categorization tags. |
| `note` | string | **Optional.** Free-text note. |

```json
{
  "id": "a1b2c3d4e5f6",
  "name": "Hot lap",
  "start_ts_ns": 1718053123456789000,
  "end_ts_ns": null,
  "tags": ["session", "driver-a"],
  "note": "Qualifying run"
}
```

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/api/events` | `{ "name": string, "tags"?: string[], "note"?: string }` | Started [Event](#event). Starting a new event auto-stops any prior active event. |
| `POST` | `/api/events/{id}/stop` | — | Stopped [Event](#event). `404` if unknown. |
| `GET` | `/api/events?from=&to=` | — | Events overlapping the window (`from`/`to` in ns; both optional). Array of [Event](#event). |
| `GET` | `/api/events/active` | — | Active [Event](#event) or JSON `null`. |

Persistence follows the configured sink: SQLite `events` table (sqlite sink or
local default), Influx `telemetry_events` measurement (influx sink), JSONL
append (file sink).

### Static web app (server mode)

Mounted only when `role == server`; registered AFTER all `/api` + `/ws` routes so
the SPA catch-all never shadows them.

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/` | `index.html` of `server.webRoot` (placeholder page if the build is absent). |
| `GET` | `/assets/{file}` | Hashed JS/CSS bundles from `{webRoot}/assets`. |
| `GET` | `/{any}` | SPA fallback → `index.html` (deep links / refresh) when no real file matches. |

`server.webRoot` (`engine/config.schema.json`, default `app/dist`, repo-root
relative) configures the served directory.

---

## Local settings + Embedded-Sharepoint sync

Additive routes for the user-local `~/.electron` data checkout, user settings, and
the derived vehicle list. See `.cursor/plans/local-settings/contract.md` for the full
design (path resolution, `.electron` layout, dev-flag seeding, git-op table).

- All routes are under `/api` (so the server-mode SPA catch-all never shadows them).
- The data checkout lives at `can_home()/sharepoint/can` (`can_home()` = `CAN_HOME`
  env, default `~/.electron`); `CAN_ROOT` overrides the resolved `can/` path.
- Git ops shell out to the **user's own git** (their SSH/HTTPS credentials); a single
  in-process lock serializes them.
- **Errors** use the standard `{ "error": { "title": string, "detail": string } }`
  shape; git failures put git stderr verbatim in `error.detail`.
- **Ingest guard:** mutating sharepoint routes (`clone`, `fetch`, `pull`, `push`,
  `checkout`, `discard`, `branches` create, `stash` save/pop) return `409`
  `{ "error": { "title": "Ingest active", ... } }` while CAN ingest is running.

### Sharepoint (git) — `/api/sharepoint`

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/sharepoint/status` | — | **StatusBody** (below). Never guarded. |
| `POST` | `/api/sharepoint/clone` | `{ remoteUrl?, branch?, repair?: bool }` | StatusBody. `repair:true` removes `sharepoint/` then re-clones. Defaults from settings. |
| `POST` | `/api/sharepoint/fetch` | — | StatusBody (`git fetch --all --prune`). |
| `POST` | `/api/sharepoint/pull` | — | StatusBody (`git pull --ff-only`). |
| `POST` | `/api/sharepoint/push` | `{ branch? }` | `{ "pushed": true, "branch": string, "stderr": string }`. `400` `{error}` (git stderr) on no-upstream/auth failure — no interactive prompt. |
| `POST` | `/api/sharepoint/checkout` | `{ branch: string, dirty?: "stash"\|"discard" }` | StatusBody. Dirty tree without `dirty` → `409` `{ error.title: "Working tree dirty" }`. |
| `POST` | `/api/sharepoint/discard` | — | StatusBody (`git checkout -- can` + `git clean -fd can`, scoped to `can/`). |
| `GET` | `/api/sharepoint/branches` | — | **BranchesBody** (fetch + list). |
| `POST` | `/api/sharepoint/branches` | `{ name: string, checkout?: bool=true }` | StatusBody (`git checkout -b` / `git branch`). |
| `POST` | `/api/sharepoint/stash` | `{ op: "save"\|"pop"\|"list", message? }` | StatusBody (`save`/`pop`) or **StashListBody** (`list`, not guarded). |

**StatusBody**
```json
{
  "gitInstalled": true,
  "cloned": true,
  "branch": "custom_mdc",
  "dirty": false,
  "canRootExists": true,
  "remoteUrl": "https://github.com/lhr-solar/Embedded-Sharepoint.git",
  "commit": "a1b2c3d"
}
```
| Field | Type | Notes |
|-------|------|-------|
| `gitInstalled` | boolean | `git --version` succeeds. |
| `cloned` | boolean | `sharepoint/.git` exists. |
| `branch` | string \| null | Current branch; `null` if not cloned. |
| `dirty` | boolean | Working tree (scoped to `can/`) has changes. |
| `canRootExists` | boolean | `can_root()` exists and is a valid checkout (has `vehicles/`). |
| `remoteUrl` | string | From settings (`sharepoint.remoteUrl`). |
| `commit` | string \| null | Short HEAD sha; `null` if not cloned. |

**BranchesBody**
```json
{ "current": "custom_mdc", "local": ["custom_mdc", "main"], "remote": ["origin/custom_mdc", "origin/main"] }
```

**StashListBody**
```json
{ "stashes": [ { "ref": "stash@{0}", "message": "WIP on custom_mdc: ..." } ] }
```

### Settings — `/api/settings`

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/settings` | — | **SettingsBody** (fully seeded). |
| `PUT` | `/api/settings` | partial SettingsBody | Merged SettingsBody (persisted to `settings.json`). |

**SettingsBody**
```json
{
  "defaultVehicle": null,
  "defaultReadBitrate": 500000,
  "sharepoint": {
    "remoteUrl": "https://github.com/lhr-solar/Embedded-Sharepoint.git",
    "branch": "custom_mdc"
  }
}
```
| Field | Type | Notes |
|-------|------|-------|
| `defaultVehicle` | string \| null | Vehicle id for ingest + MDC viewer default; `null` = first available. |
| `defaultReadBitrate` | integer | Default read bitrate (bit/s). |
| `sharepoint.remoteUrl` | string | Clone/push remote. |
| `sharepoint.branch` | string | Default branch for clone. |

Defaults seed from dev env flags on first run (`CAN_DEV_DEFAULT_VEHICLE`,
`CAN_DEV_DEFAULT_BITRATE`, `CAN_DEV_SHAREPOINT_REMOTE`, `CAN_DEV_SHAREPOINT_BRANCH`);
persisted user values win, flags only fill unset keys, missing/corrupt file re-seeds.

### Vehicles — `/api/vehicles`

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/api/vehicles` | — | **VehicleEntry[]** — dirs under `can_root()/vehicles/` with `*.dbc` or `*.mdc.json`. |
| `POST` | `/api/vehicles` | `{ name: string }` | VehicleEntry — creates empty `can_root()/vehicles/<name>/`. `409` if exists; `400` if name has path separators. **No delete endpoint.** |

**VehicleEntry**
```json
{ "id": "Daybreak", "hasDbc": true, "hasMdc": false }
```

> The HTTP/WS server is built by the **Python backend** (`server-builder` track)
> using FastAPI. This document fixes the wire contract so the app track builds
> its client in parallel. The app client uses the `{type, payload}` envelope
> above (reconcile any `{event, data}` remnants in `app/src/lib`).
