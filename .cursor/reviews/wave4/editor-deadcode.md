# Dead-code review — Wave 3 mdc-editor

Reviewer: dead-code pass only. Product code untouched.
Scope: `app/src/workspaces/mdc-editor/` (all files, untracked Wave-3 work on branch `v3`).
Contract refs: `.cursor/plans/mdc-v3/contract.md` §3–§8, `brief-editor.md`.

---

## Findings

### 1. Unused import: `DEFAULT_CYCLE_TIME_MS` in `mdcModel.js` re-exported but shadowed in `busload.js`

`app/src/workspaces/mdc-editor/lib/mdcModel.js:25` — `DEFAULT_CYCLE_TIME_MS` is exported from `mdcModel.js` and imported in `MessageEditor.jsx`. In `busload.js` a local `const DEFAULT_CYCLE_TIME_MS = 1000` is declared (line 8) instead of importing the shared constant. The two values agree today but the local copy is dead duplication — suggested fix: delete the local declaration in `busload.js` and import from `mdcModel.js`.

### 2. Dead prop `dbcImportRef` — `useRef` assigned to hidden `<input>` but never read back

`app/src/workspaces/mdc-editor/MdcEditorWorkspace.jsx:38` — `const dbcImportRef = useRef(null)` is declared and bound to the DBC import `<input ref={dbcImportRef}>` (line 242), but `dbcImportRef.current` is never read anywhere in the file. The `e.target.value = ''` reset at the end of `importDbc` (line 173) makes the ref unnecessary. Suggested fix: remove the `useRef` import alias and the `ref` attribute; the reset already uses `e.target.value`.

### 3. Dead branch in `entitySubtitle` — `entity.description` fallback is unreachable for non-project kinds

`app/src/workspaces/mdc-editor/components/DetailPanel.jsx:22` — `entitySubtitle` returns `entity.comment ?? entity.description` for all non-project kinds. The v3 contract renames `description` → `comment` on every entity (signal, message, network, node). In a valid v3 document, `entity.description` will always be `undefined` for those kinds, making the `?? entity.description` branch dead. The fallback silently masks v2 docs loaded without `v3compat` migration. Suggested fix: drop `?? entity.description`; add a `ponytail:` comment if intentional backward-compat is desired.

### 4. `SPN` attribute definition still present in `predefinedAttributes.js` seed — removed per contract §0.7

`app/src/workspaces/mdc-editor/lib/predefinedAttributes.js:40–53` — The `SPN` entry (`name: 'SPN', type: 'int', scopes: ['signal']`) is explicitly listed in contract §0.7 as "drop `SPN` from the seed — now native". It still appears in `PREDEFINED_CAN_ATTRIBUTES`. The "Load predefined CANdb++ attributes" button in `ProjectEditor` will seed `SPN` as an attribute definition, duplicating the native `signal.spn` field. Suggested fix: delete the `SPN` block from `PREDEFINED_CAN_ATTRIBUTES`.

### 5. `SPN` attribute definition also present in `sampleProject.js` — contradicts contract §0.7

`app/src/workspaces/mdc-editor/lib/sampleProject.js:693–703` — The sample project's `attributeDefinitions` array includes an `SPN` entry identical to the one in `predefinedAttributes.js`. Per contract §0.7, `SPN` is now native (`signal.spn`); including it as an attribute definition in the sample teaches the wrong v3 shape to anyone using the sample as a reference. Suggested fix: delete the `SPN` block from `SAMPLE_PROJECT.attributeDefinitions`.

### 6. Unused `isCyclic` re-export wrapper in `busload.js`

`app/src/workspaces/mdc-editor/lib/busload.js:41–43` — `export function isCyclic(message) { return isCyclicMessage(message); }` is a one-line pass-through that wraps `isCyclicMessage` from `v3compat.js`. No file in `mdc-editor/` imports `isCyclic` from `busload.js`; all callers inside `busload.js` itself use `isCyclicMessage` directly (lines 47, 75, 85). Suggested fix: delete `isCyclic`; if external callers need a stable export name, re-export directly (`export { isCyclicMessage as isCyclic }`).

### 7. `MessageEditor.jsx` — `SelectField` prop `options={ENUMS.transport}` passes raw strings, no `includeEmpty`; "none" state is unrepresentable

`app/src/workspaces/mdc-editor/components/MessageEditor.jsx:83` — The `transport` select uses `options={ENUMS.transport}` which renders `['single', 'isotp', 'multiframe']`. The schema marks `transport` optional (many messages in `sampleProject.js` omit it), but the select has no empty/`—` option and no `includeEmpty` prop. A user cannot clear `transport` to `undefined` through the UI. This is also a dead branch: any message without `transport` will render the select defaulting to `'single'` visually but the document field stays `undefined` — a mismatch. Suggested fix: add `includeEmpty` to the `SelectField` or treat `''` as `undefined` in the onChange.

### 8. `ValidationPanel.jsx` — `summary.warnings` used as a truthy check but `summarizeIssues` always returns a number (never falsy for 0)

`app/src/workspaces/mdc-editor/components/ValidationPanel.jsx:9` — `summary.valid ? (summary.warnings ? 'warn' : 'ok') : 'err'`. When `summary.warnings === 0` the condition `summary.warnings ?` is falsy — this is intentional and correct. However the same `summary.warnings` check is made redundant by the explicit `summary.warnings > 0` guard on line 11 which is the authoritative branch. No dead code per se, but the ternary on line 9 evaluates `summary.warnings` as a boolean while the note on line 11 treats it as a count — two different idioms for the same value. Not a bug, but a readability inconsistency worth noting.

  → **Downgrade to note, not a finding.**

### 9. `busload.js` — `bitsPerFrame` parameter destructures `isExtended` / `isFd` from the call site argument but `messageBitsPerSecond` passes v3 field names under different aliases

`app/src/workspaces/mdc-editor/lib/busload.js:10` — `bitsPerFrame({ length, isExtended = false, isFd = false })` uses camelCase aliases internally. At line 33–36, `messageBitsPerSecond` maps `message.is_extended_frame` → `isExtended` and `message.is_fd || networkIsFd(network)` → `isFd`. The API of `bitsPerFrame` itself is not a v3 public field — it is a pure math function with its own parameter names. Not dead code, not a v2 leak. No finding.

---

## Summary

| # | File | Type | Severity |
|---|------|------|----------|
| 1 | `lib/busload.js:8` | Duplicate constant (local shadow of shared export) | Low |
| 2 | `MdcEditorWorkspace.jsx:38` | Dead `useRef` (ref never read) | Low |
| 3 | `components/DetailPanel.jsx:22` | Dead `?? entity.description` branch (v2 field on v3 entity) | Medium |
| 4 | `lib/predefinedAttributes.js:40–53` | Stale `SPN` attribute definition (contract §0.7: now native) | High |
| 5 | `lib/sampleProject.js:693–703` | Stale `SPN` attribute definition in sample doc (same contract violation) | High |
| 6 | `lib/busload.js:41–43` | Unused `isCyclic` pass-through wrapper | Low |
| 7 | `components/MessageEditor.jsx:83` | Missing `includeEmpty` on `transport` select — `undefined` unreachable via UI | Medium |
