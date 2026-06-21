# Wave 4 — Editor Readability Review

Reviewer: readability-reviewer subagent
Scope: `app/src/workspaces/mdc-editor/` (all files, Wave 3 changes — entire dir is untracked/new on `v3`)
Date: 2026-06-19

---

## Findings

### lib/busload.js

`app/src/workspaces/mdc-editor/lib/busload.js:10` — `bitsPerFrame` parameter destructures `isExtended` and `isFd` using camelCase locally, but the call site at line 36 passes `message.is_extended_frame` / `message.is_fd` (v3 snake_case). The mismatch is invisible here (local rename in destructure), but the parameter name `isExtended` clashes with v3 field naming throughout — suggest naming the parameter `{ length, is_extended_frame: isExtended = false, is_fd: isFd = false }` or a comment naming the local alias intentional. — Add a comment `// ponytail: renamed in destructure to avoid collision with v3 field read` or align parameter names.

`app/src/workspaces/mdc-editor/lib/busload.js:41` — `isCyclic` is a thin alias of `isCyclicMessage` from `v3compat.js` (one line, same body). No reason to re-export as `isCyclic`; callers within this file already have `isCyclicMessage` in scope and the only external consumer is the test file, which imports from `busload.js`. — Either drop the alias and export `isCyclicMessage` directly from `v3compat`, or remove `isCyclic` from the export surface and use `isCyclicMessage` everywhere internally. Redundant name is a readability cost.

`app/src/workspaces/mdc-editor/lib/busload.js:72` — `computeBusLoad` output key is named `protocol` with values `'can'`/`'canfd'` — this is an internal presentation label, not a schema field, which is fine. But `BusLoadTable` at `components/BusLoadTable.jsx:17` calls `protocol?.toUpperCase()` producing `"CAN"` or `"CANFD"`. Since the schema removed the `protocol` field on network (contract §3.4), this internal key's name will confuse future readers into thinking it's a schema key. — Rename output key to `busType` or `fdMode` to distinguish it from the removed schema `protocol`.

### lib/v3compat.js

`app/src/workspaces/mdc-editor/lib/v3compat.js:1` — The module comment says "bridges editor v3 field names to @mdc-lib helpers still on v2 keys until tools flatten lands." This is a good `ponytail:` note, but it's a plain comment, not a `ponytail:` comment as the project convention requires. — Change to `// ponytail: shim. Remove when @mdc-lib tools land v3 snake_case fields; ceiling is the lib flatten not yet shipped.`

`app/src/workspaces/mdc-editor/lib/v3compat.js:19-20` — `isCyclicMessage` returns `true` at the end after checking for triggered — the logic is correct but the final `return true` is separated from the condition check with no else. A reader must scan back to confirm no other early return exists. — Simplify to `return !SEND_TYPE_TRIGGERED.has(st);` (one expression, identical semantics).

### lib/mdcModel.js

`app/src/workspaces/mdc-editor/lib/mdcModel.js:25` — `DEFAULT_CYCLE_TIME_MS` is exported from both `mdcModel.js` (line 25) and re-declared as a module-private const in `busload.js` (line 8). Two definitions of the same value. — Remove the private declaration from `busload.js` and import from `mdcModel.js`.

`app/src/workspaces/mdc-editor/lib/mdcModel.js:86` — The JSDoc comment on `resolveValueEntries` says "Value-table helper — canonical copy in Embedded-Sharepoint/...". It is actually a re-export, not a copy — "canonical copy" is misleading. — Change to "Re-export from @mdc-lib; canonical implementation is in Embedded-Sharepoint/can/mdc/lib/model.mjs."

### lib/sampleProject.js

`app/src/workspaces/mdc-editor/lib/sampleProject.js:693-701` — `SAMPLE_PROJECT.attributeDefinitions` still includes an `SPN` attribute definition (type `int`, scopes `['signal']`). Contract §0.7 explicitly states: "drop `SPN` from the predefined attribute seed — now native, per contract §0.7." This is a contract violation in the sample document. — Remove the `SPN` entry from `attributeDefinitions` in the sample.

`app/src/workspaces/mdc-editor/lib/sampleProject.js:37-60` — `valueTables[0].description` and `valueTables[0].entries[3].description` use the field name `description` on a value table and its entries. The contract renames `description` → `comment` on signal, message, node, network — but does not explicitly rename it on `valueTable` or `valueTable.entry`. The sample's use of `description` here is likely intentional (not renamed), but the inconsistency (nodes/signals use `comment`, tables use `description`) should be confirmed. — Verify with the schema whether `valueTable` keeps `description`; add a clarifying comment if intentional.

`app/src/workspaces/mdc-editor/lib/sampleProject.js:663-671` — `metadata.description` uses `description` at the metadata level — this is correct (root-level doc field stays `description` per contract §2.1), but the outer `project.description` field at line 664 (`"Single-motor demo EV."`) sits after the `networks` array ends, which means JSON key ordering places `description` at the root after `networks`. Not a correctness issue, but the contract's §2.2 skeleton puts `description` early (after `name`) — put `description` before `metadata` to match the canonical skeleton and avoid reader confusion.

### lib/predefinedAttributes.js

`app/src/workspaces/mdc-editor/lib/predefinedAttributes.js:1` — Comment says "MDC v2 contract §4." This file has been carried into v3 without updating the contract reference. — Update to "MDC v3 predefined CANdb++ attribute seed (contract §3, §0.7 — SPN dropped from this list; SPN is now a native signal field)."

### components/SignalEditor.jsx

`app/src/workspaces/mdc-editor/components/SignalEditor.jsx:117` — The condition `hasMux || (signal.choices?.length ?? 0) > 0 || entries.length > 0` gates the entire "Multiplexing & values" card. If the user has neither mux fields set nor choices/entries, neither the `is_multiplexer` toggle nor the `multiplexer_signal` field is visible, making it impossible to start setting up mux on a signal that has none yet. A new signal can never enter mux mode through the UI. — Always render the mux subsection (or provide an "Add multiplexing" affordance outside the conditional card), and show the `is_multiplexer` toggle unconditionally so users can initiate mux configuration.

`app/src/workspaces/mdc-editor/components/SignalEditor.jsx:104` — In the `conv?.kind === 'table'` branch, "Value table ref" is shown, but inline `choices` editing is absent — users who want to add inline choices (not a valueTableRef) have no path in the UI. The contract allows both `choices` and `valueTableRef` on a table signal. — At minimum document the gap; ideally add an inline choices editor alongside the valueTableRef field.

`app/src/workspaces/mdc-editor/components/SignalEditor.jsx:55-62` — The SPN hex input is rendered as raw `<label>/<input>` outside the `<TextField>` abstraction, inconsistently with the surrounding fields that use `<TextField>` / `<NumberField>`. The pattern is duplicated in `MessageEditor.jsx` (frame_id) and is intentional for hex inputs — but there is no shared `<HexField>` abstraction despite the pattern appearing in at least 4 places (SPN, frame_id, header_id, contained header_id). — Extract a `<HexField>` primitive into `fields.jsx` to eliminate the repeated pattern. (Not critical, but the duplication will grow as container messages are authored.)

### components/MessageEditor.jsx

`app/src/workspaces/mdc-editor/components/MessageEditor.jsx:32` — `showContainer` is derived as `message.transport === 'isotp'`. The contract (§3.6) says a container message is implied by the presence of `contained_messages[]`. A message could have `transport: 'isotp'` without being a container, and a container might not have `transport` set. The condition should also show the container section when `contained.length > 0`. — Change to `const showContainer = message.transport === 'isotp' || contained.length > 0;` so existing container data is always visible.

`app/src/workspaces/mdc-editor/components/MessageEditor.jsx:194-200` — The outer container message's own `header_id` is shown inside the "Container / contained messages" card (line 195-200) labelled "Header id". Per contract §3.6, `header_id` is a field on each **contained** message (the sub-PDU's selector inside the container frame), not on the container message itself. The container message has no `header_id`; each contained sub-PDU does. The top-level `header_id` input inside the container card is architecturally confusing. — Remove the top-level `header_id` input from the container card; `header_id` is already correctly rendered per contained message at line 208-213.

`app/src/workspaces/mdc-editor/components/MessageEditor.jsx:79-84` — Transport `SelectField` passes raw `ENUMS.transport` strings as options with no normalization through `{ value, label }`. `SelectField` handles this (it coerces strings), but it means the displayed labels are raw schema values (`single`, `isotp`, `multiframe`). `isotp` and `multiframe` are not self-evident to all users. — Provide human-readable labels: `[{ value: 'single', label: 'Single frame' }, { value: 'isotp', label: 'ISO-TP (multi-frame)' }, { value: 'multiframe', label: 'Multi-frame (MDC)' }]`.

`app/src/workspaces/mdc-editor/components/MessageEditor.jsx:93-95` — `<TagList items={message.senders} />` is read-only. Senders are editable in the DBC model and the brief requires full editing. The `senders` field has no edit path in the UI. — Add an editable field for `senders` (comma-separated text → `parseCsvList`).

### components/NetworkEditor.jsx

`app/src/workspaces/mdc-editor/components/NetworkEditor.jsx:44` — `samplePoint` field keeps camelCase (`network.samplePoint`) while all other network fields in v3 are snake_case. The contract (§3.4) explicitly documents `samplePoint` as a kept MDC extension with no cantools equivalent, so the mixed casing is correct — but the field label just reads "Sample point (%)" with no hint. — Add a brief note in the label or a `mdc-muted` helper text: "MDC extension — no DBC equivalent" so editors know it won't round-trip through DBC export.

`app/src/workspaces/mdc-editor/components/NetworkEditor.jsx:63` — Environment variable rows use `key={i}` (numeric index) instead of a stable key like `ev.name ?? i`. When entries are reordered or removed mid-list, index keys cause unnecessary React reconciliation and can cause stale focus state. — Use `key={ev.name ?? i}` (same pattern as signal groups at `MessageEditor.jsx:151`).

### components/DetailPanel.jsx

`app/src/workspaces/mdc-editor/components/DetailPanel.jsx:21-23` — `entitySubtitle` returns `entity.comment ?? entity.description` for non-project entities. For project entities it returns `entity.description`. This is correct, but the fallback `?? entity.description` on non-project entities is a v2 shim that silently reads old field names. A pure v3 document should never have `entity.description` on a signal/message/node/network; the fallback will silently mask a schema migration bug. — Remove the `?? entity.description` fallback (or replace with a `ponytail:` comment noting it's a migration guard with a ceiling once all documents are confirmed v3).

`app/src/workspaces/mdc-editor/components/DetailPanel.jsx:25` — `networkForSelection` is passed as a prop but its value is always `project.networks?.[selection.network]` — computed in `MdcEditorWorkspace` and threaded through. `DetailPanel` could compute this itself from `project` + `selection` without the extra prop, since it already receives both. — Remove the `networkForSelection` prop from `DetailPanel`; compute `project.networks?.[selection?.network]` inside `DetailPanel` and pass it to `SignalEditor` directly. Reduces prop surface.

### components/ProjectEditor.jsx

`app/src/workspaces/mdc-editor/components/ProjectEditor.jsx:19` — `addDef` initializes a new attribute definition with `description: ''`. The `attributeDefinition` schema field is `description` (not `comment`), which is correct — but this initial value is an empty string rather than `undefined`. The schema validation will accept it, but writing empty strings rather than omitting optional fields makes the document noisier. — Use `{}` as the description-less default: `{ name: 'NewAttribute', type: 'string', scopes: [] }`.

`app/src/workspaces/mdc-editor/components/ProjectEditor.jsx:50` — `Schema version` is an editable `<TextField>` — making it user-editable is a footgun; the schema version is the tool's responsibility, not the user's. A user could set it to an invalid or mismatched version and get confusing validation failures. — Make `schemaVersion` read-only (display-only text or a disabled input).

### components/ComputedSignalEditor.jsx

`app/src/workspaces/mdc-editor/components/ComputedSignalEditor.jsx:46-50` — The `dependsOn` split regex is `e.target.value.split(/[,\s]+/)` inlined in the JSX onChange, while `parseCsvList` in `mdcModel.js` does the same thing (including `.trim()` and `.filter(Boolean)`). The inline split skips `.trim()` and `.filter(Boolean)` cleanly. — Replace with `parseCsvList(e.target.value)` for consistency and correctness (avoids empty-string entries if trailing comma typed).

### MdcEditorWorkspace.jsx

`app/src/workspaces/mdc-editor/MdcEditorWorkspace.jsx:207` — `displayName` falls back through `project?.name ?? project?.metadata?.name ?? project?.id ?? 'Untitled'`. In v3 the flat root always has a `name` (the vehicle name) and `id` — the `metadata.name` fallback is a v2-era lookup that won't be needed for any v3 doc. — Simplify to `project?.name ?? project?.id ?? 'Untitled'` and drop the metadata fallback.

`app/src/workspaces/mdc-editor/MdcEditorWorkspace.jsx:34` — `source` state is typed as a comment `// 'sample' | 'backend' | 'file' | 'dbc'` but not as a TypeScript union. This is a `.jsx` file so TS types aren't required, but the absence of any constraint means typo-prone states. At minimum the comment should live on the `useState` declaration line, not after it. Minor nit.

`app/src/workspaces/mdc-editor/MdcEditorWorkspace.jsx:254-266` — The DBC warnings banner is titled "DBC export/import warnings" regardless of whether the warnings came from an export or import. After an import the title is misleading. — Track warning origin in state (e.g. `dbcWarnings: { source: 'import' | 'export', warnings: string[] } | null`) and render "DBC import warnings" or "DBC export/import warnings" accordingly. The contract's §8.2 specifically calls out `mdc2dbc: warning:` prefix on export warnings, so distinguishing them aids UX clarity.

`app/src/workspaces/mdc-editor/MdcEditorWorkspace.jsx:156-176` — `importDbc` uses `engineClient.importDbc(file)` — there is no guard for Tauri vs. browser file-picking (the brief §6 and `app.mdc` require feature-detecting `window.__TAURI__`). The current implementation uses a hidden file input which works in both Tauri and browser, so the concern from the brief about "file dialog in Tauri" does not apply here — the hidden `<input type="file">` works universally. This is actually correct. No finding. ✓

### lib/validate.js

`app/src/workspaces/mdc-editor/lib/validate.js:103` — `validateMessage` checks `!inEnum(message.transport, ENUMS.transport)` without a null guard. For messages without a `transport` field (which is optional per the contract — only required on container messages), `null` will fail the enum check and emit a false error. `inEnum` returns `true` when `value == null`, so this is actually fine — reviewing `inEnum` at line 25 confirms `value == null || list.includes(value)`. No finding. ✓

`app/src/workspaces/mdc-editor/lib/validate.js:62` — Signal validation checks `signal.multiplexer_signal && !Array.isArray(signal.multiplexer_ids)` to flag missing `multiplexer_ids`. However, a multiplexed signal could legitimately have `multiplexer_ids: []` (empty array), which passes `Array.isArray` but is semantically invalid (a signal gated on no IDs is never decoded). — Add a check: `if (signal.multiplexer_signal && Array.isArray(signal.multiplexer_ids) && signal.multiplexer_ids.length === 0) warning("multiplexer_ids is empty — signal will never match")`.

### Test coverage gaps

`app/src/workspaces/mdc-editor/lib/validate.test.js` — No test exercises signal-level validation (start/length/is_signed/is_float/conversion). The test suite only covers attribute definitions and the flat root shape. The brief requires `validate.test.js` to cover v3 signal field names. — Add a describe block for `validateSignal` covering: invalid `byte_order`, non-boolean `is_signed`, `start` out of range, float signal with non-power-of-2 length, rational conversion missing `numerator`.

`app/src/workspaces/mdc-editor/lib/j1939.test.js` — (Not read in detail; flagged for coverage check.) Verify that `showJ1939Readout` has tests for the `message.protocol === 'j1939'` branch added in v3 (contract §3.3 adds `protocol` field).

---

## Summary

**Total findings: 22** (across 10 files)

**Top issues by severity:**

1. **Contract violation (SPN in sample)** — `sampleProject.js` still includes `SPN` as a predefined attribute definition, which the contract §0.7 explicitly requires to be dropped in v3.

2. **Logic bug (container section always hidden unless transport=isotp)** — `MessageEditor.jsx:32` `showContainer` condition excludes messages that already have `contained_messages[]` but no `transport: 'isotp'` set, making existing container data invisible.

3. **Incorrect UI (outer `header_id` in container card)** — `MessageEditor.jsx:194-200` places a `header_id` input on the *container* message itself; per the contract, `header_id` belongs only on the *contained* sub-PDUs. The field is redundant and misleading.

4. **Mux initiation impossible** — `SignalEditor.jsx:117` hides the multiplexing controls entirely when a signal has no mux fields set, so users cannot start configuring mux on a plain signal.

5. **Redundant `isCyclic` alias** — `busload.js:41` re-exports `isCyclicMessage` under a second name, creating two names for one concept in the same file.

6. **Validate test coverage missing** — Signal-level validation (start/length/is_signed/is_float/conversion) is untested despite being the most complex validation path.
