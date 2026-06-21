# AGENTS.md — CAN Re-Platform

Shared manual for every agent (CLI subagents, in-session subagents, and humans) working on the re-platform. The old Python stack (`server/`, `client/`, `grafana/`) has been **removed** now that the re-platform is complete; it lives in git history if a pattern needs to be recovered.

## Repo layout

| Dir | Stack | Owner agent |
|-----|-------|-------------|
| `engine/` | C++20 **ingest/decode** engine (CMake + vcpkg): `sources/ bus/ decode/ config/ binding/` + nanobind module. NO HTTP, NO sinks. | engine-builder / engine-core / engine-decode / engine-sources / engine-sinks-api(binding) |
| `backend/` | **Python API** (FastAPI REST+WS) + sinks (Influx/SQLite/file); wraps the C++ engine via the `can_engine` nanobind module | server-builder |
| `app/` | Tauri 2 + React 19 + Vite 8 (Rolldown) + Mantine: `src/workspaces/{telemetry,analytics,mdc-editor}`, `src-tauri/` | app-builder |
| `Embedded-Sharepoint/can/mdc/` | `schema/`, `lib/`, `tools/` (`bundle-mdc-schema`, `validate-mdc`, `dbc2mdc`, `mdc2cheaders`, `mdc-validate`, `mdc-busload`), `examples/` (validator fixtures), `docs/` (submodule, branch `custom_mdc`) | mdc-builder |
| `Embedded-Sharepoint/can/vehicles/` | Per-vehicle DBCs + MDC projects (`HighNoon`, `Daybreak`, `lhr-ev1`, …) (submodule) | mdc-builder |
| `deploy/` | server `docker-compose.yml` (backend + Grafana + DB) + provisioning | server-builder |

**Architecture (post-pivot):** the C++ engine does ingest + MDC decode only (the hot path) and is exposed in-process to Python via a **nanobind** module. The **Python `backend/`** is the API (REST/WS) and owns the sinks — easy to use and expand. Desktop = Tauri spawns the Python backend (**Nuitka**-compiled to a native binary, bundling the C++ module) as the sidecar; server = the same backend headless. The React UI always talks to the Python backend over WS/REST. Packaging stays as small as reasonable: lean Python deps, Nuitka compilation, small compiled module.

**Dual delivery of the app (same build, two runtimes):** the React app runs (a) inside Tauri on the **user/desktop** side, and (b) **served as a static site by the Python server** in server mode (browser / server→client) — identical viewports + controls both ways. Tauri-only APIs are feature-detected so the browser build works. **Server side** additionally: hosts a **TCP slcan listener** (reads the incoming vehicle stream → decode → DB), serves the static web app, and hosts its **own Grafana** instance. **User/desktop side** takes inputs from any source adapter → DB → Grafana, with the same viewports. Role-aware UI exposes all controls for both sides.

## The four contracts (the seams that enable parallel work)

Tracks must not block each other. These artifacts are the only cross-track coupling — keep them stable and never redefine them silently:

1. **`Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json`** — the MDC protocol (project → vehicle → network → message → signal; tags, typed `attributeDefinitions`, display hints, alarms, computed signals). Generated from the modular sources under `Embedded-Sharepoint/can/mdc/schema/mdc.schema.json` + `Embedded-Sharepoint/can/mdc/schema/defs/`. Decoder, editor, and tooling consume the **bundle**; edit the modular sources and run `node Embedded-Sharepoint/can/mdc/tools/bundle-mdc-schema.mjs`.
2. **REST + WS API contract** (`backend/API_CONTRACT.md`, **Python-owned**) — REST for config / MDC spec CRUD / start-stop / **events** (named start-stop markers); WS for live batches + status (incl. `active_event`). The `live_message_batch` and `status` payload shapes are now defined by `backend/API_CONTRACT.md` (originally mirrored from the old Python stack, since removed).
3. **`engine/config.schema.json`** — `role: desktop|server`, `sources[]`, `sinks[]`, `bus`, `api`, `server.listeners[]`. (Engine consumes `sources`/`bus`/`role`/`listeners`; the Python backend consumes `sinks`/`api`.)
4. **Engine binding API** — the `can_engine` nanobind surface the Python backend calls: `EngineHandle(config)`, `start()`, `stop()`, `poll_batch(timeout_ms) -> list[dict] | None` (GIL released while waiting), `status() -> dict`, `load_mdc(spec)`. The seam between the C++ engine and the Python backend.

Changing a contract is an architect action: update the schema, note it here, and notify dependent tracks.

## Behavioral rules

Generic coding standards: `.cursor/rules/ponytail.mdc` (simplicity/YAGNI) and `.cursor/rules/karpathy-guidelines.mdc` (surgical changes, clarity). Project-specific: `.cursor/rules/00-global.mdc` and per-domain `*.mdc`.

**Git:** never push unless the user explicitly asks (`.cursor/rules/git.mdc`). Pulling, fetching, and switching/creating branches are fine without asking. Commits also require explicit user request.

Engine-specific: no allocations/copies on the decode hot path (see `engine.mdc`).

## Frontend: Vite 8 / Rolldown (required)

`app/` builds on **Vite 8** (Rolldown). See `.cursor/rules/app.mdc` for scaffold and override details.

## Orchestration model

Two axes (see `.cursor/plans/Parallel Agent Orchestration`):
- **Build wave** (parallel): engine / app / server / mdc builders, each scoped to its dir.
- **Lifecycle gates** (per step): architect (contracts + briefs) → builders → readonly reviewers (readability / deadcode / perf / dry) → refactorer (applies findings) → integrator (merge + build + test + contract check).

Agent definitions live in `.cursor/agents/*.md`; standards in `.cursor/rules/*.mdc`. A bash runner for parallel CLI execution is in `scripts/agents/run.sh` (optional — in-session Task subagents are the default mechanism for this build).

### Model tiers

Each subagent sets `model` explicitly in `.cursor/agents/*.md` frontmatter. Do not use `inherit`.

| Tier | Model ID | Agents |
|------|----------|--------|
| **Think** | `claude-opus-4-8-thinking-high` | architect, readability-reviewer, deadcode-reviewer, perf-reviewer, dry-reviewer |
| **Build** | `composer-2.5` | engine-builder, engine-core, engine-decode, engine-sources, engine-sinks-api, app-builder, app-shell, app-theme, server-builder, mdc-builder, mdc-editor, refactorer, integrator, test-writer |

### Parallel dispatch (orchestrator rules)

**Maximize reasonable parallelism.** The orchestrator must **not** spawn one subagent per loop tick or serialize independent work. Launch a **full wave** of independent agents in **one message** (multiple parallel Task tool calls in a single assistant turn). See `.cursor/rules/orchestration.mdc` (always applied).

**Golden rules:**
1. One tick = one **wave**, not one agent.
2. Default to **maximum reasonable fan-out** — only stay sequential for true dependency chains.
3. Anti-pattern: spawn → wait → spawn next. That is the main bottleneck.

**Parallel (same message):**

| Situation | Spawn together |
|-----------|----------------|
| Contracts ready; multiple tracks have work | All **relevant** top-level builders for this step |
| `engine-core` done | `engine-decode` + `engine-sources` + `engine-sinks-api` |
| `app-shell` done | `app-theme` + `mdc-editor` |
| A track finished building | All 4 reviewers for that track |
| N tracks each have a diff | Up to **4 × N** reviewers (all quartets at once) |
| A track just built | `test-writer` **with** that track's reviewers |
| Phase 0 contracts | MDC schema + API + config writers when separate briefs exist |

**Skip / narrow (do not spawn blindly):**
- No diff → skip reviewers for that worktree (`git diff --quiet`).
- Trivial diff (docs-only, no logic) → `readability-reviewer` only.
- No pending work for a track → omit that builder; do **not** omit independent agents that *do* have work.

**Sequential (dependencies between waves):**
`architect` → builders / sub-tracks → reviewers + test-writer → `refactorer` → `integrator`.

The orchestrator plans, delegates, and updates plan todos + the build log. It does not write product code.

## Lineage (old Python stack removed — see git history)

The re-platform reused these patterns from the now-removed Python stack; recover from git history if needed:

- Adapter pattern + factory → C++ `ISource`: `server/parsers/_parser_abc.py`, `server/util/async_parser_factory.py`.
- Decode/live pipeline + `live_message_batch` shape: `server/util/async_processor.py`, `server/services/telemetry.py`.
- Cap'n Proto wire format: `server/util/capnp_schemas/can_frame.capnp`.
- Config/role concepts: `server/config.py`.

Still present (git submodule): the MDC v0 spec model + viewer in `Embedded-Sharepoint/can/canspec-ui/` that the MDC editor evolved from.
