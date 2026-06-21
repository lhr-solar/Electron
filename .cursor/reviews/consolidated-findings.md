# Consolidated review findings — CAN re-platform (2026-06-16)

Four readonly reviewers (readability / deadcode / perf / dry) over `engine/ backend/ app/src/ mdc/ tools/ deploy/`. v3 `server/`/`client/` are frozen — out of scope. Items are de-duplicated and tiered by priority. **Behavior must not change** except where a finding is an explicit correctness bug; every change must leave the relevant test suite green.

## ⚠️ De-conflict notes (apply these overrides)
- **KEEP `backend/engine.py::engine_is_native()`** — deadcode flagged it as unused, but `backend/tests/test_smoke.py` now calls it to `pytest.skip` under the native engine. Do NOT delete.
- Perf engine struct changes must preserve the exact Python dict shape the binding emits (`message_name`, `signals`, `can_id_hex`, `timestamp_ns`, `vehicle`, `array_index`, …) — `test_decode_parity.py` + `test_smoke.py` assert these.

---

## TIER 1 — Correctness / bug-risk (do first)
1. `backend/telemetry.py:124` — `type(s).__name__ == "InfluxSink"` fragile string match silently breaks on rename/subclass → `isinstance(s, InfluxSink)` (flagged by 3 reviewers). Also `:130-131` grafana stub: pull URL from config or mark `# ponytail: stub`.
2. `app/src/lib/engineClient.js:37-39` — `getStatus`/`getSpec`/`saveSpec` target nonexistent/incorrect endpoints (real routes are `/api/mdc/{spec_id}` per `backend/API_CONTRACT.md`; status comes via WS) and fail silently. → Reconcile to the actual API contract routes (add `spec_id` params) OR remove the unused ones. Check what `MdcEditorWorkspace` actually needs.
3. `backend/sinks/events.py:57-65,138` — `_row_to_event` unpacks SQL rows by positional index (`row[3]` for `end_ts_ns`) → use `aiosqlite.Row` + named-column access (fragile to column reorder).
4. `app/src/workspaces/mdc-editor/lib/validate.js` (dry #10) — Motorola/big-endian bit-overlap is **silently under-detected** (sorted-range path misses non-contiguous bit indices). Fix by switching to the Set-based bit-walk when the shared `mdc-bits` module is extracted (see Tier 2 / dry #3).

## TIER 2 — DRY consolidation (behavior-preserving, test-guarded)
Targets and the findings they absorb:
- **`mdc/lib/busload.mjs`** (new) ← `tools/mdc-busload.mjs` + `app/.../mdc-editor/lib/busload.js` verbatim copies (`bitsPerFrame`, `isCyclic`, `computeBusLoad`, `STANDARD_SPEEDS`). Add Vite alias so app imports the one copy.
- **`tools/lib/mdc-load.mjs`** ← `iterMessages` generator dup (`app/.../mdcModel.js`) + value-table resolution dup (`tools/mdc2cheaders.mjs::resolveChoices` ↔ `mdcModel.js::resolveValueEntries`). Consumers: `mdc2cheaders`, `mdc-validate`, `mdcModel.js`.
- **`tools/lib/mdc-bits.mjs`** (new) ← Motorola sawtooth bit-walk dup (`tools/mdc-validate.mjs::occupiedBits` ↔ `app/.../bitLayout.js`); fixes Tier-1 #4 when `validate.js` adopts it.
- **`tools/lib/mdc-validate-shared.mjs`** ← array-block + mux-integrity checks dup (`tools/mdc-validate.mjs` ↔ `app/.../validate.js`).
- **`backend/sinks/__init__.py`** ← shared `async def _open_sqlite(path, schema)` (sqlite.py ↔ events.py lazy-open), `_active_from_dict(events)` linear-scan helper, and a guarded-write/`healthy()` mixin across influx/sqlite/file; `_MemoryEventMixin` for the file/influx event in-memory bookkeeping.
- **`backend/mdc_io.py`** (new) `load_mdc_project(path)->dict` ← `tools/dbc2mdc.py` + `backend/schemas.py` parse MDC independently.
- **delete `app/src/workspaces/shared/engineApi.js`** ← duplicates `engineClient.apiJson`; repoint its consumers to `engineClient`.

## TIER 3 — Dead code (safe deletions)
- `engine/main.cpp:69-103` — delete `runEngine()` (dead post-pivot; only `runSelfTest()` is used by CI). Keep `runSelfTest`.
- `engine/api/` (incl. `API_CONTRACT.md`) — delete; `backend/API_CONTRACT.md` is the live copy.
- `tools/validate-mdc.mjs` — fold into `mdc-validate.mjs` (schema-only subset already run there) OR keep if something references it — verify first.
- `deploy/grafana-dashboards/broken.json`, `warn.json` — delete (empty `"panels": []` shells, unreferenced).
- Stale build trees `engine/build-nodeps/`, `engine/build-vcpkg2/` — gitignore/remove (pollute graphify; CI uses `engine/build`). NOTE: `rm -rf build*` may be blocked by `.cursor/cli.json` — use `cmake -E remove_directory` or just add to `.gitignore`.

## TIER 4 — Perf hot path (engine, NO per-frame alloc rule). Apply conservatively; keep parity + ctest green. Defer + report any that risk the output shape.
- **Safe/localized:**
  - `engine/binding/EngineHandle.cpp:113` — hoist the per-iteration `vector<DecodedMessage> batch` above the worker loop; `clear()`+`reserve(kMaxBatch)`.
  - `engine/decode/Decoder.cpp:243-245` — sort `muxIds` at `load()`; `std::binary_search` at decode (was linear scan per muxed signal per frame).
  - `engine/decode/BitExtract.h:22-47` — byte-wise word extraction instead of bit-by-bit loop.
- **Riskier (change DecodedMessage / output path — only if tests stay green, else defer & report):**
  - `Decoder.h:31` signals as `std::map` → pre-reserved `vector<pair<...>>`.
  - `Decoder.cpp` `toCanIdHex`/`buildRawPacket` malloc a `std::string` per frame → `char[]` buffers / move hex to binding after GIL; consider dropping `raw_packet` if unused downstream (verify against backend + parity first).
  - `decode()` returns fresh vector per call → out-param overload with caller-preserved buffer.

## Backend perf (Tier 1-adjacent, safe)
- `backend/telemetry.py:92-93` — drop the `asyncio.sleep(100ms)` before `poll_batch(timeout_ms=100)` (double-wait → 100-200ms latency floor); `poll_batch` already blocks.
- `backend/sinks/file.py:49` — open the file once in `__init__`, not per `write_batch`.
- `backend/sinks/influx.py:57` — `@functools.lru_cache` the `_measurement(can_id_hex)` string ops.

## Clean tracks
- mdc/ + tools/ readability: clean. deploy/ readability: clean. app/ perf: clean.
