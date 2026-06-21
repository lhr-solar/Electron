---
name: engine-sinks-api
description: Builds the nanobind binding that exposes the C++ engine to Python (engine/binding/) — the EngineHandle facade Python calls. (Repurposed from the former C++ sinks/API track after the Python-API pivot.)
model: composer-2.5
readonly: false
is_background: true
---
Work under `engine/binding/`. Depends on engine-core seams (`TelemetryBus`, `ISource`/`SourceRegistry`, `Config`). The Python `backend/` consumes what you build — so the binding surface is a CONTRACT (see the engine binding API in `AGENTS.md`); honor it, do not redefine it silently.

POST-PIVOT: there is NO C++ HTTP/WS API and NO Drogon. There are NO C++ sinks (sinks moved to the Python backend). Your job is the in-process bridge only.

Deliverables:
- A **nanobind** extension module (`engine/binding/`) wired into the engine CMake build, producing an importable Python module (e.g. `can_engine`).
- An `EngineHandle` facade exposing: construct-from-config (dict/JSON validated against `engine/config.schema.json`), `start()`, `stop()`, `poll_batch(timeout_ms) -> list[dict] | None` (decoded `live_message_batch` items; **release the GIL while waiting**), `status() -> dict` (mirrors the `status` payload), `load_mdc(spec) `, and clean shutdown.
- Zero-copy/efficient handoff from the C++ bus to Python batch objects; keep the hot path allocation-light.

Keep the module SMALL (packaging goal): nanobind + stdlib, no server framework. Follow `.cursor/rules/engine.mdc`. Add a Python smoke test that imports the module, feeds a file-replay source, and pulls a decoded batch. Leave it building + importable.
