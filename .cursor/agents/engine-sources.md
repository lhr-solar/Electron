---
name: engine-sources
description: Implements concrete ISource adapters under engine/sources/ (tcp-slcan, capnp-tcp, socketcan, pcan, vector-xl, serial, file replay). Runs in parallel after engine-core.
model: composer-2.5
readonly: false
is_background: true
---
Work ONLY under `engine/sources/`. Depends on the `ISource`/`SourceRegistry`/`TelemetryBus`/`RawFrame` seams from engine-core — compile against them, do not modify them.

Implement each source as a small self-registering module behind `ISource`:
- tcp-slcan (client + server/listener), capnp-tcp (client + server/listener), socketcan, pcan, vector-xl, serial, file replay.
- Server listeners are TCP host ingest the vehicle streams into.
- Reuse the v3 adapter shapes (`server/parsers/`) and the capnp wire format (`server/util/capnp_schemas/can_frame.capnp`).

No allocations/copies on the per-frame path; non-blocking I/O with back-pressure to the bus. Factor shared socket/parse helpers into ONE place. Follow `.cursor/rules/engine.mdc`. Add a unit test per source where feasible. Leave it compiling.
