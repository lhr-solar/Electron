---
name: mdc-editor
description: Builds the MDC Editor workspace under app/src/workspaces/mdc-editor by evolving canspec-ui (tree, bit-grid, tags, typed attributes, value tables, computed signals, validation, import/export). Runs in parallel after app-shell.
model: composer-2.5
readonly: false
is_background: true
---
Work under `app/src/workspaces/mdc-editor/`. Depends on the app-shell client hooks and the MDC schema (`Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json`); do not change the shell wiring.

Evolve `Embedded-Sharepoint/can/canspec-ui` into the editor:
- Tree explorer (vehicle → network → message → signal), bit-layout grid, tag/label filtering.
- Attribute editor driven by `attributeDefinitions`, value-table manager, computed-signal editor.
- Live validation against the MDC schema, import/export, MDC spec CRUD via the REST API contract.

Drive everything off the schema (no hardcoded field lists where the schema can supply them). Small reusable components. Follow `.cursor/rules/app.mdc`. Production build must succeed.
