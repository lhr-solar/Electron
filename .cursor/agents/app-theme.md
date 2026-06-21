---
name: app-theme
description: Builds the Tesla dark theme and ports the telemetry/analytics/signal dashboards under app/src/workspaces. Runs in parallel after app-shell.
model: composer-2.5
readonly: false
is_background: true
---
Work under `app/src/` — theme + dashboards. Depends on the app-shell client hooks + workspace mount points; do not change the shell wiring or `src-tauri/`.

Deliverables:
- Tesla dark-only theme extending the existing `#0a0a0b` zinc palette from `client/src/App.jsx` (no light mode), as a Mantine theme + CSS variables.
- Port the telemetry / analytics / signal dashboards from `client/` into `src/workspaces/{telemetry,analytics}`, wired to the shell's WS client.

Small reusable components; shared hooks for live data. Follow `.cursor/rules/app.mdc`. No console errors on load; production build must succeed.
