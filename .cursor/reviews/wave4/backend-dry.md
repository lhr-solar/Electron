# Wave 4 DRY Review — backend track

## Findings

backend/mdc_dbc.py:107-216 — `_warn()` + `_choices()` + `_signal()` + `_export_inline()` duplicate the entire MDC→cantools mapping already implemented in `Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py` (`warn()`, `_resolve_choices()`, `_mdc_signal_to_cantools()`, `_mdc_message_to_cantools()`, `_build_database()`); the tool is present (`_MDC2DBC.is_file()` resolves true at runtime), so the inline fallback is practically dead; proposed shared helper: delete `_export_inline` and raise `DbcToolError` in `_export_subprocess`'s except clause instead of silently falling back

backend/mdc_dbc.py:128-131 — flat `tables` dict built by iterating `spec.get("valueTables")` + `network.get("valueTables")` duplicates the same two-level lookup in `mdc2dbc.py:35-45` (`_resolve_choices`) and `test_decode_parity.py:105-112` (`_label_tables`); proposed shared helper: extract a `resolve_value_table(ref, network, project) -> dict[int,str] | None` in a thin `backend/mdc_utils.py` (Python) and reuse in both `_choices()` and the test oracle, mirroring JS `model.mjs:resolveValueEntries`

backend/mdc_dbc.py:133-141 — `_choices()` closure resolves signal choices/valueTableRef to `dict[int,str]`, duplicating `test_decode_parity.py:115-119` (`_resolve_labels`) which does the same lookup; both would collapse into the shared helper above

backend/mdc_dbc.py:143-177 — `_signal()` closure rebuilds the cantools `Signal` kwarg dict independently from `mdc2dbc.py:48-97` (`_mdc_signal_to_cantools`); the tool version is more complete (warns on `raw_initial`, `raw_invalid`, `invalid`; handles `initial`; guards mux fields individually) while the inline version silently drops those; gap closes if `_export_inline` is deleted

backend/mdc_dbc.py:179-215 — message/node/bus building loop duplicates `mdc2dbc.py:100-207` (`_mdc_message_to_cantools` + `_build_database`); the tool handles `signal_groups`, `environment_variables`, `multiplexing` warning, and `j1939` protocol that the inline version silently omits; same resolution as above (delete inline fallback)
