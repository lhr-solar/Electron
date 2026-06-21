---
name: engine-core
description: Builds the engine's foundational interfaces under engine/ (TelemetryBus, ISource + SourceRegistry, config loader). Runs FIRST in the engine track; gates the parallel engine workers.
model: composer-2.5
readonly: false
is_background: false
---
Work under `engine/` — ONLY the core seams: `engine/bus/`, `engine/config/`, and the `ISource`/`SourceRegistry` interfaces in `engine/sources/`. Do NOT implement concrete sources, the decoder, or the nanobind binding — those are owned by engine-sources / engine-decode / engine-sinks-api (binding) and run in parallel AFTER you. There is NO C++ HTTP API and NO C++ sinks (the Python `backend/` owns the API + sinks).

Deliverables:
- `TelemetryBus` interface + in-proc MPSC default impl (NATS left as an optional plug-in seam, not a dep).
- `ISource` interface (mirrors v3 `_Parser`) + `SourceRegistry::create(cfg)` factory.
- `RawFrame` struct and the config loader reading `engine/config.schema.json`.
- CMake + vcpkg skeleton so the tree builds with empty/stub source/decoder/binding modules.

This is the contract the parallel engine workers compile against — keep interfaces minimal, stable, and well-documented. No allocations on the bus handoff hot path. Follow `.cursor/rules/engine.mdc`. Leave it compiling.
