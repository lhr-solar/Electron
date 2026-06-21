# Wave 4 Dead-Code Review — backend/ (MDC v3)

Scope: all files under `backend/` (entire directory is untracked / new on branch v3).
Focus: unused imports, dead branches, unreachable code, shadowed/inert mixin members, duplicated inline imports.

---

## Findings

backend/sinks/__init__.py:12 — `import aiosqlite` is a top-level eager import in the Sink protocol/factory module, but `aiosqlite` is only consumed by `_open_sqlite` (line 37), which is only called by `SqliteSink` and `SqliteEventStore`; importing it here forces the aiosqlite package to load even when only influx or file sinks are active — move the import inside `_open_sqlite` (already a lazy-import pattern used by `make_sink`)

backend/sinks/influx.py:30+87 — `InfluxSink` inherits `_HealthyMixin` but overrides `healthy()` with its own implementation using `self._connected`; the mixin's `_healthy: bool = True` class attribute (defined in `_HealthyMixin`) is never read or written inside `InfluxSink`, making the inherited attribute dead weight — either drop the `_HealthyMixin` inheritance on `InfluxSink` and keep only `self._connected`, or replace `self._connected` with `self._healthy` to actually use the mixin

backend/state.py:91-93 — `from .schemas import ValidationError` is re-imported inside `_path()` even though `ValidationError` is already imported at the module top (line 17); the duplicate inline import is dead/redundant — remove the inner import, the outer one already satisfies it

backend/main.py:133 — `from .schemas import validate_config` is imported lazily inside the `/api/start` handler body even though the `schemas` module is already imported at the top (`from .schemas import EventStart, ValidationError`); `validate_config` should be added to the top-level import — the inline import is dead indirection

backend/sinks/__init__.py:47-52 — `_active_from_dict(events)` is a module-level function with a single call site: `_MemoryEventMixin._active_event()` (line 68); it is a trivial linear scan inlinable as `next((ev for ev in self._events.values() if ev.get("end_ts_ns") is None), None)` — the extracted function adds a layer with no reuse and is a ponytail target for deletion

backend/engine.py:140-146 — `engine_is_native()` re-executes `import can_engine` independently from `make_engine()`; it exists solely for `test_smoke.py:18` to skip; the same check could be done by catching `ImportError` from `make_engine()` itself or by exposing a flag set at import time — as written the function is a second redundant import attempt that diverges from `make_engine`'s code path
