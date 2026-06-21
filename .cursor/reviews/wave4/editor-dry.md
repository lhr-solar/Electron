# DRY Review — Wave 3 mdc-editor changes

Scope: `app/src/workspaces/mdc-editor/` (all files untracked, treated as Wave-3 additions).
Review date: 2026-06-19.

---

## Findings

`app/src/workspaces/mdc-editor/components/SignalEditor.jsx:55` — inline hex `<label>/<input className="mdc-input mono">` (formatHex + parseHexInt) for SPN repeated verbatim at `MessageEditor.jsx:59` (frame_id), `MessageEditor.jsx:195` (message header_id), `MessageEditor.jsx:209` (contained-message header_id), `AttributeEditor.jsx:79` (hex attribute) — proposed shared helper: `HexField({ label, value, onChange, min, max })` added to `fields.jsx`, wrapping the formatHex/parseHexInt + mdc-input mono pattern

`app/src/workspaces/mdc-editor/components/ComputedSignalEditor.jsx:22` — every row (name, comment, expr, unit, is_signed, is_float, dependsOn) is a raw `<label>/<input>` or `<label>/<div><input type="checkbox">` bypassing the existing `TextField` / `CheckField` / `NumberField` primitives in `fields.jsx`; the identical structural pattern is used correctly in `SignalEditor.jsx`, `NodeEditor.jsx`, `NetworkEditor.jsx` — proposed shared helper: no new helper needed; replace raw inputs with existing `TextField` / `CheckField` from `fields.jsx`

`app/src/workspaces/mdc-editor/components/NetworkEditor.jsx:63` — environment-variable rows use raw `<input className="mdc-input">` / `<select className="mdc-select">` / inline `type="number"` inputs for name, type, unit, initial_value, access_type, access_node, and comment, duplicating what `TextField` / `SelectField` / `NumberField` already do in `fields.jsx` — proposed shared helper: no new helper needed; replace with existing `TextField` / `SelectField` / `NumberField`

`app/src/workspaces/mdc-editor/components/NetworkEditor.jsx:124` — CSV-array round-trip `(arr ?? []).join(', ')` / `parseCsvList(e.target.value)` repeated for `access_node` (NetworkEditor:124), `multiplexer_ids` (SignalEditor:135), `senders` in contained messages (MessageEditor:216), `dependsOn` (ComputedSignalEditor:44) — proposed shared helper: `CsvField({ label, value, onChange, mono })` in `fields.jsx`, accepting `string[]` value and calling `onChange(parseCsvList(raw))`

`app/src/workspaces/mdc-editor/components/MessageEditor.jsx:39` — add / remove / indexed-update callback triplet (`addX`, `removeX`, `updateX(i, key, value)`) + `items.filter((_, j) => j !== i)` guard duplicated for signal_groups (MessageEditor:39–42), contained_messages (MessageEditor:44–50), environment_variables (NetworkEditor:19–25), attributeDefinitions (ProjectEditor:15–21) — proposed shared helper: `useEditableList(items, update, fieldPath)` hook returning `{ addItem, removeItem, updateItem }`, where `addItem(defaultItem)` and `removeItem(i)` call `update([fieldPath], ...)` and `updateItem(i, key, value)` calls `update([fieldPath, i, key], value)`

`app/src/workspaces/mdc-editor/components/MessageEditor.jsx:151` — inline separator style `{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--mdc-line-soft)' }` repeated on every editable-list item div in MessageEditor (lines 151, 205), NetworkEditor (line 62), ProjectEditor (line 86); minor margin variant (12 vs 14 vs 16) is incidental — proposed shared helper: CSS utility class `.mdc-list-item` in `mdc-editor.css` with `margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--mdc-line-soft);`
