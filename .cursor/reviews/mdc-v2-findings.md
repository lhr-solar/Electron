# MDC v2 (Wave 2) — Consolidated Review Findings

Input for the Wave 3 refactorer. Apply **without behavior change** except the explicitly-flagged real bugs. Keep all builds/tests green (`node tools/mdc-validate.mjs`, `pytest tools/tests`, `npm --prefix app run build`, `npm --prefix app run test -- --run`). `mdc/`, `tools/`, `app/` are untracked — no git diff.

Status: **collecting** — mdc-builder track in (readability/deadcode/test-writer); dry-builder + editor quartet (readability/deadcode/dry/test-writer) pending.

---

## mdc-builder track (`mdc/` + `tools/`)

### Real bugs — FIX (verify behavior with the tools tests)
1. **`tools/dbc2mdc.py` `_multiplexer` (~L191-201):** passes the cantools `Signal` object to `sanitize_id()` instead of `mux_signal.name` — latent wrong-output. Fix to use `.name`.
2. **`tools/dbc2mdc.py` `_message_to_mdc` (~L282):** the `any(getattr(s, "multiplexer_signal", None) …)` heuristic fires on *standard* mux too and can incorrectly set `multiplexing.extended = true`. Trust the authoritative `ext_mux` flag derived from `MultiplexExtEnabled` exclusively.
3. **`tools/dbc2mdc.py` `_attribute_definitions` (~L105-130, line ~110):** `DBName` leaks into `attributeDefinitions[]` (contract §5 says SKIP). Filter `_SKIP_ATTRS` in addition to `_NATIVE_ATTRS`. **When fixed, update `tools/tests/test_dbc2mdc_attrs.py`** `test_ba_def_maps_to_attribute_definitions` — the `set(elcon_defs) == {"BusType","DBName","MultiplexExtEnabled","SPN"}` assertion must drop `DBName`.

### Cleanup / dead code / readability
4. `dbc2mdc.py:34 _FLOAT_WIDTHS` — `16` in `{16,32,64}` is dead (cantools never emits 16-bit float); drop or `ponytail:` note.
5. `dbc2mdc.py:97-102 _resolve_attr_value` — `definitions.get(str(attr))` else-branch is unreachable / silently returns `None` for unexpected types; tighten or document.
6. `dbc2mdc.py:213-215 _signal_to_mdc` — float→unsigned identity downgrade is a **silent data transformation**; emit a stderr warning (data-loss guard, not lazy about this).
7. `dbc2mdc.py:156 _kind` → rename `_signal_kind`.
8. `dbc2mdc.py:247-285 _message_to_mdc` — ~40 lines; extract the mux-detection block (L276-284) for testability.
9. `dbc2mdc.py:263` — delete the narration comment ("cyclic messages need a period…").
10. `dbc2mdc.py:162-170 _conversion` — docstring says scale/offset/choices but the table branch discards linear coefficients; document the intentional loss.
11. `dbc2mdc.py:320-325 _merge_attr_definitions` — first-wins collision is silent; name the policy + upgrade path in a comment.
12. `dbc2mdc.py:344 build_project` — `name=vehicle_id` makes name==id in folder-mode import, losing the human-readable folder name; consider keeping the folder name.

### Schema + docs staleness
13. `mdc/schema/defs/project-meta.json:48-49` — `min`/`max` description "int/float only" is stale; `hex` also accepts them.
14. `mdc/schema/mdc.schema.json:12` — `schemaVersion` example still `"1.0.0"` → `"2.0.0"`.
15. `mdc/examples/lhr-ev1/project.mdc.json:83` — `"BusType": "CAN"` on a CAN FD network; should be `"CAN FD"`.
16. `mdc/examples/lhr-ev1/project.mdc.json:327-328` — `MCU_Drive` omits `isExtended`/`transmissionType` while peers set them; make consistent.
17. `mdc/docs/mdc-overview.md:99` — "defaults to cyclic + cycleTimeMs 1000" is *importer* (dbc2mdc) behavior, not schema; clarify.
18. `mdc/schema/defs/annotations.json:12` — description references `allOf` which lives in `hierarchy.json`; minor clarity.

### Tests added (keep green)
- `tools/tests/test_dbc2mdc_attrs.py` (4 tests, pass) + `tools/tests/fixtures/attr_import.dbc` (synthetic: signal SPN, native send/cycle/frame, CustomEnum dedup, node attr). `pytest`+`cantools` are now installed in the env.

### DRY (mdc-builder)
19. `dbc2mdc.py:71-78 _dedupe_enum_values` — 7-line seen-set loop → replace with stdlib `list(dict.fromkeys(values))`; delete the helper (ponytail).
20. `dbc2mdc.py sanitize_id` vs `mdc2cheaders.mjs sanitize` — do NOT unify (different languages + format targets: MDC allows `-`/128-cap, C forbids `-`); add a one-line comment noting the divergence is intentional.

Status: **mdc-builder track COMPLETE** (readability/deadcode/dry/test-writer all in).

---

## mdc-editor track (`app/src/workspaces/mdc-editor/`)

### Real bugs — FIX
E1. **`ProjectEditor.jsx:140-141`** — `int` and `hex` branches both do `Number(v)`; `hex` input should round-trip through `parseInt(v, 16)` (and display via hex). Silent semantic error for the new hex widget. (Cross-check `AttributeEditor.jsx` hex widget + `formatHex` L115-118 truncation guard.)
E2. **`SignalEditor.jsx:100`** — `signal.choices?.length ?? 0 > 0` parses as `?? (0 > 0)` (precedence) → always falsy; the `choices` branch is silently dead. Fix to `(signal.choices?.length ?? 0) > 0`. NOTE: `choices` is a **valid v2 field** (keep it — see reconciliations).
E3. **`MessageEditor.jsx:12-18`** — `j1939FromId` runs for CAN-FD extended frames too; J1939 29-bit layout doesn't apply to FD. Gate the readout to non-FD extended / `VFrameFormat==='J1939PG'`.
E4. **`MdcEditorWorkspace.jsx:74-76, 84-88, 103-104`** — load / save / JSON-import failures are swallowed silently (empty `catch {}`, disappearing spinner). Surface an error to the user (at minimum `console.error` + a visible message). Data-loss guard — not lazy about this.

### Dead code / leftover tagging — CUT
E5. **`lib/sampleProject.js`** — biggest offender: `schemaVersion "1.0.0"`→`2.0.0` (L7); remove entire `tagTaxonomy` block (L17-51); remove scattered `tags`/`categories`/`labels` across entities (L112,125,131,188,191,238,241,…). **Do NOT remove `choices[]`** (L452,461,844) — valid v2 field (reconciliation #2). After editing, **validate sampleProject against `mdc/schema/mdc.schema.bundle.json`** to confirm v2-clean.
E6. `MdcEditorWorkspace.jsx:26-30` — `clone()` structuredClone+JSON fallback is dead (universal since 2022); use bare `structuredClone`.
E7. `AttributeEditor.jsx:31-43` `ProminentAttribute` sub-component + `:45-50` `prominent` prop — speculative abstraction (≈AttributeRow minus styling); collapse to a `className`/inline boolean.
E8. `ProjectEditor.jsx:36-43` + `SignalEditor.jsx:160-167` — two ad-hoc CSV parsers (`updateEnumValues` vs `parseNumList`); consolidate (one keeps strings, one numbers — one shared helper parameterized, or document the split).

### DRY — consolidate (low-risk)
E9. `SignalEditor.jsx:40-45` — inline byte-order options dup `mdcModel.js` `BYTE_ORDER_LABEL`; add `BYTE_ORDER_OPTIONS = Object.entries(BYTE_ORDER_LABEL).map(...)` and import.
E10. `attrUpdate` closure copy-pasted in `MessageEditor.jsx:31`, `NetworkEditor.jsx:13`, `SignalEditor.jsx:27` → one `makeAttrUpdate(update)` in `mdcModel.js`.
E11. `MessageEditor.jsx:15` — name the J1939 magic numbers (`0x7`/`0x3ffff`/`0xff` + shift widths 26/8) as constants.
E12. `ComputedSignalEditor.jsx` (raw inputs), `ValueTableManager.jsx:47-51` (raw number input), `ProjectEditor.jsx:70-76` (raw attr-def name input), `AttributeEditor.jsx:68-75/105-111` (bool/string) — use the `fields.jsx` primitives (`TextField`/`NumberField`/`CheckField`/`SelectField`) for consistency. Apply where low-risk; skip if layout (3-col grid) makes it churny.

### Readability — minor (judgment)
E13. `TreeExplorer.jsx:23` internal `Node` name collides with DOM global + schema node entity → rename. `:46` `openKeys` hardcodes `'v0'`/`'v0n0'` → derive.
E14. `DetailPanel.jsx:25` pointless wrapper `update={(p,v)=>onChangeAt(p,v)}` → pass `onChangeAt`.
E15. `AttributeEditor.jsx:20` bool fallback `''` → `false`. `ProjectEditor.jsx:68` `key={i}` index keys → stable keys.
E16. `validate.js` — no `schemaVersion` check (a `1.0.0` doc passes). Optional: add a v2 check. **Known gap (test-writer):** `validate.js` does not reject `tagTaxonomy`/entity `tags` — out of Wave 1 scope, leave as documented gap (the test asserts current behavior).

### Tests added (keep green)
- `lib/predefinedAttributes.test.js`, `lib/j1939.test.js`, `lib/validate.test.js` (10 tests; 50/50 total pass).

---

## Reconciliations (ORCHESTRATOR — override reviewers where they conflict with the plan/contract)
1. **KEEP `senders`** — the plan's Wave 1 mdc-editor brief says "keep senders/nodes". The deadcode finding to cut the `senders` `TagList` (MessageEditor:52, fields.jsx TagList) is **overridden** — keep senders display.
2. **KEEP `choices`** — `choices[]` on signals is a **valid v2 field** (mutually exclusive with `valueTableRef`; not removed by the contract). The deadcode claim that it's a removed v1 field is **wrong** — do NOT strip it from sampleProject/SignalEditor. Fix the precedence bug E2 so it works; let the bundle schema be the source of truth (validate sampleProject).
3. **DBName fix (mdc-builder #3)** — when removing the `DBName` definition, update `tools/tests/test_dbc2mdc_attrs.py` so `test_ba_def_maps_to_attribute_definitions` no longer expects `DBName`.

## Gate after refactor (both tracks)
- tools: `node tools/mdc-validate.mjs mdc/examples/lhr-ev1/project.mdc.json` clean; `pytest tools/tests` green; `python3 tools/dbc2mdc.py Embedded-Sharepoint/can/dbc/HighNoon/ElconCAN.dbc` validates.
- editor: `npm --prefix app run build` clean; `npm --prefix app run test -- --run` green; sampleProject validates vs the v2 bundle.
