# Wave 4 Dead-Code Review — MDC v3 Tools Track

Reviewed files:
- `Embedded-Sharepoint/.github/check_duplicate_can_ids.py`
- `Embedded-Sharepoint/.github/validate_dbc_generation.py`
- `Embedded-Sharepoint/.github/workflows/check-dbc.yml`
- `Embedded-Sharepoint/can/canspec-ui/src/data.ts`
- `Embedded-Sharepoint/can/mdc/lib/busload.mjs`
- `Embedded-Sharepoint/can/mdc/lib/mdc-bits.mjs`
- `Embedded-Sharepoint/can/mdc/lib/mdc-load.mjs`
- `Embedded-Sharepoint/can/mdc/lib/mdc-validate-shared.mjs`
- `Embedded-Sharepoint/can/mdc/lib/model.mjs`
- `Embedded-Sharepoint/can/mdc/tools/bundle-mdc-schema.mjs`
- `Embedded-Sharepoint/can/mdc/tools/dbc2mdc.py`
- `Embedded-Sharepoint/can/mdc/tools/generate_can_headers.mjs`
- `Embedded-Sharepoint/can/mdc/tools/mdc-busload.mjs`
- `Embedded-Sharepoint/can/mdc/tools/mdc-validate.mjs`
- `Embedded-Sharepoint/can/mdc/tools/mdc-v2-to-v3.mjs`
- `Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py`
- `Embedded-Sharepoint/can/mdc/docs/mdc-overview.md`
- `Embedded-Sharepoint/docs/DBC.md`
- `Embedded-Sharepoint/docs/usingDBCs.md`
- `deploy/mdc2grafana.mjs`

---

## Findings

### 1. Stale tool name in schema description string

`Embedded-Sharepoint/can/mdc/schema/mdc.schema.json:5` — `description` string still lists `mdc2cheaders` (the deleted tool) instead of `generate_can_headers` — update description string to replace `mdc2cheaders` with `generate_can_headers`

`Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json:5` — same stale `mdc2cheaders` reference in the bundled schema description — regenerate bundle after fixing the source schema (or fix both)

`Embedded-Sharepoint/can/mdc/docs/mdc-overview.md:8` — tool list still names `mdc2cheaders` which was deleted; the replacement is `generate_can_headers.mjs` — replace `mdc2cheaders` with `generate_can_headers`

`Embedded-Sharepoint/can/mdc/docs/mdc-overview.md:266` — same stale tool name in the "How each consumer uses MDC" section — replace `mdc2cheaders generates C headers` with `generate_can_headers.mjs generates C headers`

### 2. Dead v2-compat fallback aliases in `mdc-bits.mjs`

`Embedded-Sharepoint/can/mdc/lib/mdc-bits.mjs:31` — `signal.startBit ?? 0` is a v2 field alias; v3 exclusively uses `signal.start`. No v2 document can reach this code through the validated loader, so this branch is dead for any v3 project — remove the `?? signal.startBit` fallback

`Embedded-Sharepoint/can/mdc/lib/mdc-bits.mjs:32` — `signal.lengthBits ?? 0` same v2 alias; v3 always has `signal.length` — remove the `?? signal.lengthBits` fallback

`Embedded-Sharepoint/can/mdc/lib/mdc-bits.mjs:33` — `signal.byteOrder ?? "little_endian"` same v2 alias; v3 always has `signal.byte_order` — remove the `?? signal.byteOrder` fallback

### 3. Dead v2 field fallback in `deploy/mdc2grafana.mjs`

`deploy/mdc2grafana.mjs:89` — `sig.comment ?? sig.description ?? ""` has a dead fallback: `sig.description` is a v2 field name; v3 uses `sig.comment`. All projects loaded via `loadProject` pass schema validation that requires `comment`, so `sig.description` is always `undefined` — remove `?? sig.description`

`deploy/mdc2grafana.mjs:46-47` — `sig.min` / `sig.max` fallbacks are v2 field names (v3 uses `sig.minimum` / `sig.maximum`); they are dead for validated v3 documents — remove `?? sig.min` on line 46 and `?? sig.max` on line 47

### 4. Unused `loadAndValidate` export in `mdc-load.mjs`

`Embedded-Sharepoint/can/mdc/lib/mdc-load.mjs:122-127` — `loadAndValidate` is exported but no caller in any tool, test, or app file within the changed or in-scope code uses it (all tools call `loadProject` + `compileSchema` separately) — remove the export (or at minimum, not a public API that is exercised)

### 5. Unused exports in `busload.mjs` not consumed by any in-scope caller

`Embedded-Sharepoint/can/mdc/lib/busload.mjs:121-128` — `busLoadForNetwork` is exported but is not imported by any tool in `can/mdc/tools/` or `deploy/`; only the app editor would be a potential consumer, but it is outside the scope of this track's changed files — flag as potentially dead if the app does not import it

`Embedded-Sharepoint/can/mdc/lib/busload.mjs:131-134` — `formatSpeed` is exported but is not consumed by any file in `can/mdc/tools/`, `deploy/`, or any other changed file — flag as dead in the tools track context

### 6. Stale schema prefix fallback in `mdc-load.mjs`

`Embedded-Sharepoint/can/mdc/lib/mdc-load.mjs:28` — `"https://schemas.lhr.dev/mdc/2025-06/"` is listed as a second `SCHEMA_ID_PREFIXES` entry for backward-compat with old `$schema` URLs, but no MDC file in the repo uses this prefix (confirmed: no `.mdc.json` in `Embedded-Sharepoint/` sets `$schema` to this URL); the v3 canonical prefix is `https://lhrsolar.org/lhrs-mdc/3.0.0/` — remove the 2025-06 fallback prefix if v2 documents will not be loaded through this loader (migration is handled by `mdc-v2-to-v3.mjs` before loading)

### 7. `cantools` dependency installed by CI but not used in CI Python scripts

`Embedded-Sharepoint/.github/workflows/check-dbc.yml:29` — `pip install -r requirements.txt` installs `cantools` (and MkDocs, etc.) for the `check-dbc` job, but neither `check_duplicate_can_ids.py` nor `validate_dbc_generation.py` import `cantools` anymore after the v3 rewrite — the job should install a minimal requirements file (just `pytest` if needed, or nothing) rather than the full doc-build `requirements.txt`; `cantools` is a dead dep for this CI step

### 8. `cross-file duplicate` code path removed but comment left as misleading stub

`Embedded-Sharepoint/.github/check_duplicate_can_ids.py:52-53` — the cross-file duplicate check block was removed but replaced with a comment `# Cross-network within same vehicle doc: same frame_id on different networks is OK / # Cross-file duplicate check: same vehicle file shouldn't repeat — already covered above`; the `can_id_map` dict is still populated (line 49: `can_id_map[(mdc, net_id, can_id)].append(msg_name)`) but then never iterated — `can_id_map` is a dead variable; it is built but never read — remove the `can_id_map` dict and its append call, or add the cross-file loop back if the check is still desired

### 9. Stale DBC paths in unchanged docs (not in diff scope but flagged as v2 residue)

`Embedded-Sharepoint/docs/gen-dbc-table.py:6` — hardcodes `DBC_DIR = Path("can/dbc/Mcqueen")` which no longer exists (vehicles moved to `can/vehicles/`); and `mkdocs.yml` still references `docs/gen-dbc-table.py` — this script is dead code referencing a deleted path

`Embedded-Sharepoint/docs/CanSetup.md:*` / `Embedded-Sharepoint/docs/nav.md:*` — still link to `dbcEditor.md` (the DBC editor doc for the deleted middleware dbc-editor), which is a stale doc path pointing to a deleted subtree (`middleware/dbc-editor/` was deleted in this change set)

### 10. `validate_dbc_generation.py` derives wrong header extension for `.mdc.json` inputs

`Embedded-Sharepoint/.github/validate_dbc_generation.py:39` — `header_path = mdc_file.with_suffix(".h")` on a file named `HighNoon.mdc.json` produces `HighNoon.mdc.h`, not `HighNoon.h`; this matches the actual file present (`HighNoon.mdc.h` exists), so this is consistent, but it is likely unintentional — verify the generate_can_headers output path uses `-o` with the same `mdc.h` suffix or update the derivation to strip both `.json` and `.mdc` suffixes (i.e. `mdc_file.with_name(mdc_file.stem.removesuffix('.mdc') + '.h')`)

---

## Summary

| Category | Count |
|---|---|
| Stale tool name in docs/schema strings (`mdc2cheaders` → `generate_can_headers`) | 4 |
| Dead v2 field aliases in lib code | 4 |
| Dead v2 field fallbacks in deploy tool | 3 |
| Unused exported symbols (tools track) | 3 |
| Dead variable (`can_id_map` never read) | 1 |
| Stale CI dependency (`cantools` in check-dbc job) | 1 |
| Stale doc/nav paths (non-diff but v2 residue) | 2 |
| Ambiguous header extension derivation | 1 |
| **Total** | **19** |
