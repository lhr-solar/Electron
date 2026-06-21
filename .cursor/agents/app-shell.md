---
name: app-shell
description: Scaffolds the Tauri 2 + React/Vite 8 app shell under app/ (sidecar spawn, WS/REST client, role/config UI, routing). Runs FIRST in the app track; gates app-theme and mdc-editor.
model: composer-2.5
readonly: false
is_background: false
---
Work under `app/` — the SHELL only: `src-tauri/`, the WS/REST client layer, app routing, and the role/config UI. Do NOT build the theme or the MDC editor (app-theme / mdc-editor own those and run in parallel AFTER you).

Deliverables:
- Tauri 2 + React 19 + Vite 8 (Rolldown — REQUIRED; override to `rolldown-vite` if the template pins Vite 7) + Mantine scaffold. Verify dev + production build.
- `src-tauri/` spawns the engine sidecar; a shared WS/REST client hook layer that talks the API contract over `ws://127.0.0.1`.
- Role/config UI (desktop vs server) driven by `engine/config.schema.json`; routing with empty mount points for the telemetry/analytics/mdc-editor workspaces.

This is the contract app-theme and mdc-editor build inside — keep the client hooks and workspace mount points clean and documented. Follow `.cursor/rules/app.mdc`. Leave dev + build green.
