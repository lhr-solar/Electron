# HighNoon Grafana Dashboard Build Spec (READ FULLY BEFORE BUILDING)

You are building ONE provisioned Grafana dashboard JSON for the LHR "HighNoon" solar car
realtime telemetry system. Follow this spec EXACTLY so all dashboards are consistent and valid.

## 0. Ground truth data reference
The complete list of CAN messages -> InfluxDB series is in:
`scripts/highnoon_schema.md` (human) and `scripts/highnoon_schema.json` (machine).
READ IT. Only use measurements/fields that exist there. Do NOT invent signal names.

## 1. Data model (InfluxDB 2.x, Flux)
- bucket: `telemetry_main`, org: `LHRS`.
- **measurement** = uppercase hex CAN id, NO `0x` prefix (e.g. `422`, `B`, `1806E5F4`). From schema.
- **_field** = the CAN signal name (e.g. `MC_BusCurrent`). Plus every point has a `raw_packet` field (ignore it).
- tags on every point: `vehicle` (="HighNoon"), `network`, `sender`, `message_name`.
- **ARRAY messages** additionally have an `idx` tag (string) = the array index (module/tap/channel).
  For array messages, the index signal is NOT a field; it becomes the `idx` tag. Bin by `idx`, never combine.

## 2. Datasource — use this EXACT block everywhere a datasource is referenced
```json
{ "type": "influxdb", "uid": "influxdb_main" }
```
Every panel and every template variable MUST set this datasource. Do NOT use `${DS_INFLUXDB}` or `__inputs`.

## 3. Dashboard-level JSON (required top-level keys)
- `"id": null`
- `"uid"`: unique, kebab, prefix `hn-` (e.g. `hn-overview`, `hn-motor`). MUST be unique across all dashboards.
- `"title"`: `"HighNoon — <Name>"`.
- `"tags"`: `["HighNoon", "<system>"]` (e.g. `["HighNoon","motor"]`).
- `"schemaVersion": 39`, `"version": 1`, `"editable": true`, `"graphTooltip": 1`, `"timezone": "browser"`.
- `"refresh": "1s"` (realtime).
- `"time": { "from": "now-5m", "to": "now" }`.
- `"timepicker": { "refresh_intervals": ["1s","2s","5s","10s","30s","1m","5m"] }`.
- `"templating": { "list": [] }` (hardcode vehicle filter in queries; no variables needed).
- `"annotations": { "list": [ { "builtIn": 1, "datasource": {"type":"grafana","uid":"-- Grafana --"}, "enable": true, "hide": true, "iconColor": "rgba(0, 211, 255, 1)", "name": "Annotations & Alerts", "type": "dashboard" } ] }`.
- `"panels": [ ... ]`.
- Do NOT include `__inputs`, `__requires`, or `__elements`.

## 4. Panel layout
- Grid is 24 units wide. Give every panel a unique integer `id` and a `gridPos {h,w,x,y}`.
- Use `row` panels (`"type": "row"`) to group sections; give rows a title and collapse=false.
- Keep panels readable: stats w>=3, timeseries w>=8/12, tables/heatmaps w>=8.

## 5. Flux query templates (targets)
Every target: `{ "datasource": {"type":"influxdb","uid":"influxdb_main"}, "refId": "A", "query": "<FLUX>" }`.

### 5a. Time series (analog signal over the dashboard time range)
```flux
from(bucket: "telemetry_main")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._measurement == "422")
  |> filter(fn: (r) => r._field == "MC_BusCurrent")
  |> filter(fn: (r) => r.vehicle == "HighNoon")
  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)
  |> yield(name: "MC_BusCurrent")
```
Use `fn: mean` for analog, `fn: last` for discrete/state signals.

### 5b. Current value (stat / gauge) — short lookback + last()
```flux
from(bucket: "telemetry_main")
  |> range(start: -30s)
  |> filter(fn: (r) => r._measurement == "1")
  |> filter(fn: (r) => r._field == "Main_Battery_Voltage")
  |> filter(fn: (r) => r.vehicle == "HighNoon")
  |> last()
```

### 5c. Array binned — one series per module/tap/channel (group by idx)
```flux
from(bucket: "telemetry_main")
  |> range(start: -30s)
  |> filter(fn: (r) => r._measurement == "B")
  |> filter(fn: (r) => r._field == "BPS_Voltage_Tap_Data")
  |> filter(fn: (r) => r.vehicle == "HighNoon")
  |> group(columns: ["idx"])
  |> last()
```
For time series per module, use 5a form + `|> group(columns:["idx"])` (returns one line per idx).

### 5d. Data age (seconds since last sample) — for staleness indicators
```flux
from(bucket: "telemetry_main")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "1")
  |> filter(fn: (r) => r._field == "Main_Battery_Voltage")
  |> filter(fn: (r) => r.vehicle == "HighNoon")
  |> last()
  |> map(fn: (r) => ({ _value: (float(v: uint(v: now())) - float(v: uint(v: r._time))) / 1000000000.0 }))
  |> keep(columns: ["_value"])
```
Display as stat, unit `s`, thresholds: green 0, yellow 2, red 5. Title like "Pack V age".

## 6. Units (Grafana `fieldConfig.defaults.unit`)
- Volts -> `volt`; Amps -> `amp`; Watts -> `watt`; Celsius -> `celsius`; percent (0-100) -> `percent`.
- rpm -> `rotrpm`; m/s -> `velocityms`; Hz -> `hertz`; ms -> `ms`; seconds -> `s`;
- PSI -> `pressurepsi`; meters -> `lengthm`; Ah -> `none` (suffix "Ah" via `"unit":"none"` + custom? use `none`); L/min -> `flowlpm`; degrees(angle) -> `degree`.
Set `decimals` sensibly (e.g. 1-3). Set `min`/`max` on gauges from schema range when useful.

## 7. Enum / state signals -> value mappings + color
For any signal that has `choices=` in the schema (faults, contactor states, gear, modes, watchdogs):
- Prefer `stat`, `state-timeline`, or `table` panels (NOT plain timeseries).
- Add `fieldConfig.defaults.mappings` value mappings from the choices, e.g.:
```json
"mappings": [
  { "type": "value", "options": { "0": { "text": "Open",   "color": "red",   "index": 0 },
                                    "1": { "text": "Closed", "color": "green", "index": 1 } } }
]
```
- Fault/limit signals: OK/0 = green, fault/nonzero = red (use thresholds or mappings). Contactor: Closed=green, Open=red for HV enable context (use judgment).
- Use `"colorMode": "background"` on stat panels for state tiles so they read like status lights.

## 8. Module grid "heatmap" (32 modules) — REQUIRED where relevant
Best realtime grid = a **stat** panel returning one series per `idx` (query 5c). Grafana renders
each series as a colored tile in a grid — a live 32-cell heatmap. Config:
- `"type": "stat"`, options: `{ "colorMode": "background", "graphMode": "none", "textMode": "value_and_name", "justifyMode": "auto", "orientation": "horizontal", "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false } }`.
- `fieldConfig.defaults`: set `unit`, `decimals`, `color: {"mode":"continuous-GrYlRd"}` (or thresholds), and
  `"displayName": "M${__field.labels.idx}"` so tiles are labeled M0..M31.
- Give it a wide gridPos (w: 24, h: 8) so all 32 tiles fit.
Also add a **timeseries** (query 5a + group by idx) showing all modules over time (trend), plus
stat tiles for pack min / max / spread using `min`/`max`/`spread` reducers where useful.
(You may ALSO add a Heatmap panel for value distribution, but the stat-grid above is the required deliverable.)

## 9. Example panels (copy structure, adapt)

### Timeseries
```json
{
  "id": 2, "type": "timeseries", "title": "Motor Bus Current",
  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 1 },
  "datasource": { "type": "influxdb", "uid": "influxdb_main" },
  "fieldConfig": { "defaults": { "unit": "amp", "decimals": 1,
    "custom": { "drawStyle": "line", "lineWidth": 1, "fillOpacity": 10, "showPoints": "never", "spanNulls": true },
    "color": { "mode": "palette-classic" } }, "overrides": [] },
  "options": { "legend": { "displayMode": "list", "placement": "bottom", "showLegend": true },
               "tooltip": { "mode": "multi", "sort": "none" } },
  "targets": [ { "datasource": { "type": "influxdb", "uid": "influxdb_main" }, "refId": "A",
    "query": "from(bucket: \"telemetry_main\")\n  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n  |> filter(fn: (r) => r._measurement == \"422\")\n  |> filter(fn: (r) => r._field == \"MC_BusCurrent\")\n  |> filter(fn: (r) => r.vehicle == \"HighNoon\")\n  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)" } ]
}
```

### Stat (current value, with staleness threshold)
```json
{
  "id": 3, "type": "stat", "title": "Pack Voltage",
  "gridPos": { "h": 4, "w": 4, "x": 0, "y": 0 },
  "datasource": { "type": "influxdb", "uid": "influxdb_main" },
  "fieldConfig": { "defaults": { "unit": "volt", "decimals": 1, "noValue": "—",
    "thresholds": { "mode": "absolute", "steps": [ { "color": "red", "value": null }, { "color": "yellow", "value": 90 }, { "color": "green", "value": 100 } ] },
    "color": { "mode": "thresholds" } }, "overrides": [] },
  "options": { "colorMode": "value", "graphMode": "area", "justifyMode": "auto", "orientation": "auto",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false }, "textMode": "auto" },
  "targets": [ { "datasource": { "type": "influxdb", "uid": "influxdb_main" }, "refId": "A",
    "query": "from(bucket: \"telemetry_main\")\n  |> range(start: -30s)\n  |> filter(fn: (r) => r._measurement == \"1\")\n  |> filter(fn: (r) => r._field == \"Main_Battery_Voltage\")\n  |> filter(fn: (r) => r.vehicle == \"HighNoon\")\n  |> last()" } ]
}
```

### State timeline (faults/contactors over time)
```json
{
  "id": 4, "type": "state-timeline", "title": "Contactors",
  "gridPos": { "h": 6, "w": 12, "x": 12, "y": 0 },
  "datasource": { "type": "influxdb", "uid": "influxdb_main" },
  "fieldConfig": { "defaults": { "custom": { "fillOpacity": 80, "lineWidth": 0 },
    "mappings": [ { "type": "value", "options": { "0": { "text": "Open", "color": "red", "index": 0 }, "1": { "text": "Closed", "color": "green", "index": 1 } } } ],
    "color": { "mode": "thresholds" }, "thresholds": { "mode": "absolute", "steps": [ {"color":"red","value":null} ] } }, "overrides": [] },
  "options": { "mergeValues": true, "showValue": "auto", "alignValue": "left", "rowHeight": 0.9, "legend": { "displayMode": "list", "placement": "bottom", "showLegend": true } },
  "targets": [ { "datasource": { "type": "influxdb", "uid": "influxdb_main" }, "refId": "A",
    "query": "from(bucket: \"telemetry_main\")\n  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n  |> filter(fn: (r) => r._measurement == \"1\")\n  |> filter(fn: (r) => r._field == \"HV_Plus_Contactor_State\")\n  |> filter(fn: (r) => r.vehicle == \"HighNoon\")\n  |> aggregateWindow(every: v.windowPeriod, fn: last, createEmpty: false)" } ]
}
```

### Table (per-idx binned latest, colored cells)
```json
{
  "id": 5, "type": "table", "title": "Module Voltages (table)",
  "gridPos": { "h": 10, "w": 8, "x": 0, "y": 10 },
  "datasource": { "type": "influxdb", "uid": "influxdb_main" },
  "fieldConfig": { "defaults": { "unit": "volt", "decimals": 3, "custom": { "cellOptions": { "type": "color-background" }, "align": "center" },
    "color": { "mode": "continuous-GrYlRd" } }, "overrides": [] },
  "options": { "showHeader": true, "cellHeight": "sm", "footer": { "show": false } },
  "targets": [ { "datasource": { "type": "influxdb", "uid": "influxdb_main" }, "refId": "A",
    "query": "from(bucket: \"telemetry_main\")\n  |> range(start: -30s)\n  |> filter(fn: (r) => r._measurement == \"B\")\n  |> filter(fn: (r) => r._field == \"BPS_Voltage_Tap_Data\")\n  |> filter(fn: (r) => r.vehicle == \"HighNoon\")\n  |> group(columns: [\"idx\"])\n  |> last()\n  |> keep(columns: [\"idx\", \"_value\"])\n  |> group()\n  |> sort(columns: [\"idx\"])" } ]
}
```

### Stat grid = the 32-module heatmap (REQUIRED for module dashboards)
```json
{
  "id": 6, "type": "stat", "title": "Module Voltage Heatmap (live)",
  "gridPos": { "h": 8, "w": 24, "x": 0, "y": 1 },
  "datasource": { "type": "influxdb", "uid": "influxdb_main" },
  "fieldConfig": { "defaults": { "unit": "volt", "decimals": 3, "displayName": "M${__field.labels.idx}",
    "color": { "mode": "continuous-GrYlRd" }, "min": 2.5, "max": 4.2 }, "overrides": [] },
  "options": { "colorMode": "background", "graphMode": "none", "justifyMode": "auto", "orientation": "horizontal", "textMode": "value_and_name",
    "reduceOptions": { "calcs": ["lastNotNull"], "fields": "", "values": false } },
  "targets": [ { "datasource": { "type": "influxdb", "uid": "influxdb_main" }, "refId": "A",
    "query": "from(bucket: \"telemetry_main\")\n  |> range(start: -30s)\n  |> filter(fn: (r) => r._measurement == \"B\")\n  |> filter(fn: (r) => r._field == \"BPS_Voltage_Tap_Data\")\n  |> filter(fn: (r) => r.vehicle == \"HighNoon\")\n  |> group(columns: [\"idx\"])\n  |> last()" } ]
}
```

## 10. HARD RULES
- Output ONLY a single valid JSON file at your assigned path. No trailing commas. Valid JSON (double quotes).
- Escape newlines in Flux as `\n` inside JSON strings (queries are one JSON string).
- Every panel + target references datasource uid `influxdb_main`.
- Unique `id` per panel (ints) and unique dashboard `uid`.
- Never combine array/idx series into one line — always `group by idx` (bin per module/tap/channel).
- Only use real measurements/fields from `scripts/highnoon_schema.md`.
- Prefer real signals; do not fabricate. If a metric needs math (e.g. power=V*I), you MAY compute in Flux with join/map, but only if straightforward — otherwise show V and I separately.
- Realtime: refresh 1s, time now-5m..now, short lookback for stats.
- After writing, re-read your JSON and verify it parses (mentally or note it) and follows this spec.
```
