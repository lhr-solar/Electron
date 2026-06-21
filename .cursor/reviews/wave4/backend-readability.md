# Wave 4 Readability Review — Backend Track

Reviewer: readability-reviewer subagent
Date: 2026-06-19
Scope: `backend/` (all source files; entirely new/untracked vs. `v3` branch base)
Contract refs: `.cursor/plans/mdc-v3/contract.md`, `.cursor/plans/mdc-v3/brief-backend.md`

---

## Findings

### engine.py

`backend/engine.py:71` — `FakeEngine._try_load_example_mdc` reads `spec.get("metadata", {}).get("name", …)` but the v3 flat root has no `metadata.name`; the vehicle name is the root `name` field. Comment and real lookup disagree with the v3 schema. — Change to `spec.get("name", self._vehicle)` and update the comment.

`backend/engine.py:84` — `FakeEngine.load_mdc` repeats the same stale `spec.get("metadata", {}).get("name", …)` lookup as above. — Same fix: `spec.get("name", self._vehicle)`.

`backend/engine.py:42-49` — `EngineHandle` is declared as both a `Protocol` and the class name used by callers (`can_engine.EngineHandle(config)` in `test_decode_parity.py:226`). The protocol class shadows the concrete nanobind class's name in type annotations. A reader cannot tell whether `EngineHandle` is the protocol or the C++ class. — Rename the protocol to `EngineProtocol` (or `_EngineProtocol` if internal) to eliminate the ambiguity.

`backend/engine.py:87-116` — `FakeEngine.poll_batch` is 30 lines in a single method but the logic is trivial; no split needed. Fine as-is.

### mdc_io.py

`backend/mdc_io.py:36-39` — The fragment glob expression is verbose and slightly misleading: the `f.name.endswith(".mdc.json")` guard is redundant after `f.suffix == ".json"` only when `.mdc.json` is the double-extension — but `f.suffix` returns `.json` for both `foo.json` and `foo.mdc.json`, so the suffix check alone doesn't filter correctly. The intent is clear but could confuse a reader. — Replace with the single unambiguous check `f.name.endswith(".mdc.json") and f.name != "project.mdc.json"`, dropping the `f.suffix` arm.

`backend/mdc_io.py:12-24` — `_merge_network_fragment` raises `ValueError` with f-string origin paths, which is a raw Python exception; callers in `load_mdc_project` let it propagate unwrapped to the endpoint layer. This is consistent with the rest of the module but the docstring (module-level) doesn't say whether `load_mdc_project` can raise `ValueError`. — Add a one-line `Raises:` note to the `load_mdc_project` docstring.

### mdc_dbc.py

`backend/mdc_dbc.py:55-80` — `export_dbc` silently swallows `DbcToolError` from `_export_subprocess` and falls back to the inline path (`pass  # ponytail: …`). The ponytail comment is present, but an operator watching logs sees no indication the subprocess failed and the fallback kicked in. — Add a `logger.warning(...)` before `pass` so the fallback is observable.

`backend/mdc_dbc.py:160-177` — `_signal` kwargs dict is built with `or None` guards for optional fields and then filtered with `{k: v for k, v in kwargs.items() if v is not None}`. This correctly drops falsy optionals, but `is_multiplexer=False` is a valid semantic value that would be silently filtered when the signal is not a multiplexer. The cantools `Signal` constructor default is `None` for `is_multiplexer`, so filtering `False` out is correct — but the intent is non-obvious. — Add a `ponytail:` comment on the filter line explaining that cantools distinguishes `None` (plain signal) from `False` (explicitly non-multiplexer), and `False` is excluded intentionally.

`backend/mdc_dbc.py:172` — `"is_multiplexer": bool(sig.get("is_multiplexer")) or None` coerces `False` to `None` (since `False or None` is `None`). This means a signal with `is_multiplexer: false` in MDC drops the key entirely (filtered below), which is the cantools default anyway — but the expression reads as if it could preserve `False`. The `or None` idiom is confusing here. — Replace with `sig.get("is_multiplexer") or None` (no bool coercion) so the semantics are the same but the code is shorter and the intent (pass `None` when absent/falsy) is clearer.

`backend/mdc_dbc.py:1-6` — Module docstring says "falls back to an inline cantools builder (ponytail: duplicate until the tools track ships `mdc2dbc.py`)". The word "duplicate" is misleading — it's not a duplicate of existing code; it's an inline implementation that substitutes for the not-yet-shipped tool. — Replace "duplicate" with "inline fallback".

### schemas.py

`backend/schemas.py:55` — Comment `# --- Named events (additive API contract; not part of engine/config schemas) ---` accurately describes the split. The `EventStart` and `Event` Pydantic models live here alongside the schema-validation logic, which is a mild conceptual mix (validation vs. data models). Not a clarity blocker since the file is short (71 lines), but worth noting if the file grows.

No other findings in `schemas.py`.

### state.py

`backend/state.py:88-94` — `Store._path` uses `os.path.basename(spec_id)` for path traversal safety. This is correct but silently accepts `spec_id` values that contain path separators (basename strips them). The guard `if not safe or safe != spec_id` catches this and raises — good. The comment "is not a valid id" in the error message is less helpful than saying *why* it's invalid. — Change the detail string to `f"{spec_id!r} must not contain path separators"`.

`backend/state.py:32-35` — `_deep_merge` fits on one long line, which is correct per ponytail. No finding.

### telemetry.py

`backend/telemetry.py:51-61` — `_update_cache` is clear. The inline comment `# cache key "vehicle::sender" …` is useful context; keep it.

`backend/telemetry.py:121-143` — `status_payload` is 22 lines spanning two helper calls and an inline `ponytail:` comment. It's at the border of "doing one thing", but does not warrant a split at this size.

`backend/telemetry.py:110-119` — `broadcast` catches bare `Exception` and removes the dead client. Fine for resilience, but `except Exception` silently eats errors on healthy clients too (e.g. a programming error in the send lambda). — Add a `logger.debug("ws client send failed, dropping", exc_info=True)` so failures are visible at debug level without flooding production logs.

### main.py

`backend/main.py:96-109` — `import_dbc_endpoint`: the `vehicle_id` parameter is typed `str | None = None` with no `Query(...)` annotation; FastAPI will treat it as a query param by inference, which is correct. However, unlike `list_events` where `alias="from"` is needed, there's no annotation at all. Not a bug, but inconsistent with the rest of the file where query params are usually implicit. Acceptable as-is.

`backend/main.py:40-41` — `_bad_request` raises inside the function. The name `_bad_request` implies it returns the HTTP exception, but it actually raises. — Rename to `_raise_bad_request` for clarity, or annotate `-> Never`.

`backend/main.py:129-138` — `start()`: `validate_config` is imported inside the function body. The module-level import of `ValidationError` from `.schemas` is already present at line 17; adding a second inner import of `validate_config` is inconsistent. — Move the `validate_config` import to the top-level `.schemas` import at line 17.

### events.py

`backend/events.py:36-37` — `EventsService.list` method parameter names are `from_ns` / `to_ns` but the REST endpoint uses `from_` / `to` (FastAPI alias). The service layer uses the semantic names — good. No finding.

No other readability issues in `events.py`.

### webapp.py

`backend/webapp.py:93-97` — `_spa_fallback`: path traversal guard is `web_root in candidate.parents`. This works for strict parents but would block serving `index.html` itself (it's not its own parent). Since that route is already handled by the `/` handler, this is fine. Non-obvious: — Add a one-line comment `# candidate must be inside web_root (not web_root itself) to avoid serving outside the dir`.

### sinks/events.py

`backend/sinks/events.py:70-79` — `_filter_overlap` is a module-level helper but is only called by `FileEventStore` and `InfluxEventStore`. Fine as a helper — no finding.

`backend/sinks/events.py:169-172` — `FileEventStore.__init__`: the double-extension `.events.jsonl` suffix guard `if base.endswith(".events.jsonl") else f"{base}.events.jsonl"` is unusual. The intent is to accept both a raw base path and a pre-suffixed path. — Add a comment: `# Accept pre-suffixed paths so callers can pass either the base path or the full filename`.

### sinks/__init__.py

`backend/sinks/__init__.py:88-91` — `make_sink`: the `logger.warning("unknown sink type …")` line at the end of the function is unreachable — all returns/exceptions above it mean that branch is never hit. — Either restructure as `else: logger.warning(...)` under the `if/if/if` chain, or use `raise` (but the docstring says return None). Current code: the warning never fires for unknown types, which defeats the intent. This is a logic error that also makes the code misleading. — Add `else: logger.warning(…); return None` replacing the orphaned `return None` at line 92.

### test_decode_parity.py

`backend/tests/test_decode_parity.py:1-8` — Module docstring says "The v3 stack decodes via cantools inside `server/util/can_manager.py`". The `server/` directory has been removed in this re-platform. — Update the docstring to remove the stale `server/` reference; the oracle is a standalone reimplementation.

`backend/tests/test_decode_parity.py:122-133` — `_eval_computed` hard-codes two recognized `expr` strings and raises for anything else. The `# Resolve dependsOn (bare or Message.Signal) against decoded slot values.` comment is accurate. The hard-coding is intentional (test fixture-specific), but a reader might not realize this isn't a general evaluator. — Add `# ponytail: only the two lhr-ev1 computed expressions; this is a test oracle, not a general interpreter.`

`backend/tests/test_decode_parity.py:190-197` — The `frames` dict uses string keys with `@muxN` notation but the code fetches `base = key.split("@")[0]` on the Diagnostics entries. This is clear; no finding.

### test_mdc_v3.py

`backend/tests/test_mdc_v3.py:16-17` — `_V3_EXAMPLE` path points to `examples/lhr-ev1/project.mdc.json` but the brief says the test fixture for decode parity lives at `Embedded-Sharepoint/can/mdc/examples/lhr-ev1/`. Consistent across both test files — no finding.

No other findings in `test_mdc_v3.py`.

### API_CONTRACT.md

`backend/API_CONTRACT.md:27-29` — The transport note says "v3 used Socket.IO named events (`live_message_batch`, `status`)". "v3" here refers to the *old* Python stack (the removed `server/` code), but earlier in the doc "v3" also refers to the MDC schema version 3.0.0. The two uses of "v3" in this short doc create ambiguity. — Replace with "The previous stack used Socket.IO…" or "The removed Python stack used Socket.IO…".

`backend/API_CONTRACT.md:149-156` — The MDC CRUD section says "Cantools-shaped field names apply throughout (`frame_id`, `start`/`length`, `byte_order`, `is_signed`/`is_float`, `scale`/`offset`, `comment`, `baudrate`/`fd_baudrate`, etc.)." This is accurate and useful. No finding.

`backend/API_CONTRACT.md:170` — The export-dbc response says `"warnings": string[]` but the description bullet says `warnings lists best-effort lossy drops`. The contract table and the prose are consistent; no finding.

`backend/API_CONTRACT.md:113-122` — The `status` table lists `note` for the `Event` model as "**Optional.** Free-text note." but `note` is absent from the `status` payload table (lines 110-122) itself — the `active_event` field there just says "Same shape as the Event model". This is fine by reference, but could confuse readers who don't scroll down. — Add a cross-reference note: "See the [Named events → Event](#event) table for the full `active_event` shape."

### pyproject.toml

`backend/pyproject.toml:1` — `name = "lhrs-can-backend"`. Contract §5 documents this name explicitly (the npm-style `@lhrs/can-backend` was rejected for PEP 508 reasons). The actual name is correct and matches the contract. No finding.

`backend/pyproject.toml:29-30` — `package-dir = { "backend" = "." }` maps the `backend` package to the `.` directory, meaning the package root is the `backend/` directory itself. This is correct for the editable install. No finding.

---

## Summary

**Critical (logic or contract correctness):**
- `backend/sinks/__init__.py:88-92` — `make_sink` unreachable `logger.warning` for unknown sink types; `else` branch needed.
- `backend/engine.py:71,84` — `FakeEngine` reads stale `metadata.name` path; v3 flat root stores vehicle name at `spec["name"]`.

**Contract/doc accuracy:**
- `backend/API_CONTRACT.md:27-29` — "v3" refers to two different things in the same document; ambiguous.
- `backend/tests/test_decode_parity.py:7` — Stale `server/` reference in docstring (directory removed).

**Naming / clarity:**
- `backend/engine.py:42` — `EngineHandle` protocol shadows the cantools class name used by callers.
- `backend/main.py:40` — `_bad_request` name implies return, but it raises.
- `backend/main.py:133` — `validate_config` imported inside function body; inconsistent with top-level imports.
- `backend/mdc_dbc.py:5` — "duplicate" in module docstring is misleading.
- `backend/mdc_dbc.py:172` — `bool(sig.get("is_multiplexer")) or None` is opaque; simpler form available.
- `backend/state.py:93` — Error detail message doesn't say *why* the id is invalid.

**Missing intent documentation (non-obvious logic):**
- `backend/mdc_dbc.py:78` — Silent subprocess fallback; should log a warning.
- `backend/mdc_dbc.py:177` — `if v is not None` filter silently drops `is_multiplexer=False`; intent needs a comment.
- `backend/sinks/events.py:172` — Double-extension guard intent not commented.
- `backend/webapp.py:95` — Path traversal guard excludes `web_root` itself; non-obvious without a comment.
- `backend/tests/test_decode_parity.py:122` — Hard-coded `_eval_computed` looks like a general evaluator but isn't.
- `backend/telemetry.py:118` — Bare `except Exception` in broadcast is silent; debug log recommended.
- `backend/mdc_io.py:27` — `load_mdc_project` docstring missing `Raises:` note.
