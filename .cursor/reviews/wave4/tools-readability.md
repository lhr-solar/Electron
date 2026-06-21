# Wave 4 — Readability Review: MDC v3 TOOLS track

Reviewer: readability-reviewer  
Scope: `Embedded-Sharepoint/can/mdc/tools/`, `can/mdc/lib/`, `docs/`, `.github/`, `deploy/mdc2grafana.mjs`

---

## Findings

### Naming

`Embedded-Sharepoint/can/mdc/lib/mdc-bits.mjs:31` — `signalBitIndices` and `occupiedBits` are identical (line 40-42: alias via one-liner) but both exported; the dual export is intentional for tool vs. validator audiences, but the file-level JSDoc says "shared by mdc-validate, the editor grid, and live validation" and doesn't mention generate_can_headers — add it to the consumers list so the purpose of the alias is traceable. — Add `generate_can_headers` to the consumer list in the file-level JSDoc and document that `occupiedBits` is the semantic-validator alias.

`Embedded-Sharepoint/can/mdc/lib/mdc-bits.mjs:1` — File-level JSDoc still says "Follows the cantools/DBC startBit convention" — `startBit` is the old v2 name; v3 uses `start`. — Change "startBit convention" to "`start` field convention (v3: `signal.start`)" to avoid confusing new readers.

`Embedded-Sharepoint/can/mdc/lib/mdc-bits.mjs:31-36` — `signalBitIndices` silently falls back to old v2 field names (`signal.startBit ?? 0`, `signal.lengthBits ?? 0`, `signal.byteOrder ?? "little_endian"`) alongside v3 names. This is a migration shim but it is undocumented — a reader cannot tell if the fallbacks are intentional long-term or a leftover. — Add a `// ponytail: v2 fallback shim — remove after v2 docs purge` comment to the fallback operands.

`Embedded-Sharepoint/can/mdc/tools/mdc-busload.mjs:22` — `printTable` refers to `net.protocol` in the template string (`net.protocol, configured ${cfg}`), but `computeBusLoad` in `lib/busload.mjs` derives the protocol label from `fd_baudrate != null` and stores it as `net.protocol` in the result. Fine internally, but the column header reads "protocol" while the value is a derived string (`"canfd"` or `"can"`). The label column heading is not printed; readers of the printTable output see the value inline with no header row for the speed table. This is a formatting clarity gap. — Add a `/* derived: "can" | "canfd" */` inline comment on the `computeBusLoad` result's `protocol` field in `lib/busload.mjs:108` so consumers understand it is not raw MDC data.

`Embedded-Sharepoint/can/mdc/tools/dbc2mdc.py:33` — `_DEFAULT_CYCLE_TIME_MS = 1000` is used on line 302 as a fallback when a non-triggered message has no `cycle_time`. The constant name is clear, but its usage site (line 299-302) silently inserts a default without warning the user — a DBC that lacks `GenMsgCycleTime` will get cycle_time=1000 with no log output. This means bus-load estimates will silently use 1 Hz for unconfigured messages. — Emit a `dbc2mdc: info:` (or warning) per affected message so users know the 1000 ms default was injected; alternatively document the silent default in the docstring.

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:97` — `Signal(**{k: v for k, v in kwargs.items() if v is not None})` silently drops `False`, `0`, `[]`, and `""` values from the cantools Signal constructor. Concretely: `is_signed=False` and `is_fd=False` and `receivers=[]` are dropped because cantools defaults them correctly — but `minimum=0` and `maximum=0` (valid physical bounds) would also be dropped, causing silent loss of range constraints at zero. — Use `if v is not None` only on fields that are truly optional; pass `minimum`/`maximum` unconditionally or use `{k: v for k, v in kwargs.items() if v is not None or k in {"minimum", "maximum"}}`.

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:150` — Same `v is not None` filter applied to `Message(**...)` (line 150). `cycle_time=0` (a message with a zero cycle_time, which is already a semantic error but not impossible) would be silently dropped. Lower severity than the Signal case, but the same pattern. — Same fix as above for `cycle_time`.

### mdc2dbc Lossy-Warning Coverage

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:55-64` — Contract §8.2 lossy list item 8: `raw_initial`/`raw_invalid`/`invalid` — `raw_initial` and `raw_invalid` are warned (line 61-62), but `invalid` is warned separately on line 63 with the message `"invalid dropped (not DBC-expressible)"`. This is correct. However, the contract says `raw_initial`/`raw_invalid`/`invalid` are grouped as one item with "limited DBC round-trip" reasoning, while only `invalid` is truly not expressible. The warning for `raw_initial`/`raw_invalid` reads "limited DBC round-trip" which is accurate but vague — readers don't understand what limited means. — Expand to: `"raw_initial/raw_invalid dropped — only GenSigStartValue (physical initial) is DBC-expressible; raw values are not"`.

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:56` — The rational-conversion warning says "exporting scale/offset only" — accurate — but does not tell the user *what* is lost (the nonlinear numerator/denominator polynomial). — Change to: `"rational conversion dropped (DBC is linear-only); exporting linear scale/offset approximation only — physical values will differ"`.

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:44` — `warn(f"valueTableRef {ref!r} on signal {sig.get('name')!r} unresolved — choices omitted")` — this warning is for an unresolved `valueTableRef` (contract §8.2 item 9), but item 9 says a resolved ref is *lossless* (materialised as VAL_TABLE_) and only an *unresolved* one warrants a warning. The warning text correctly says "choices omitted" for the unresolved case. However there is no corresponding log line for the *resolved* materialisation path — a user has no confirmation that a resolved tableRef was successfully expanded. — Add an `info:` or debug note when a tableRef resolves successfully, so round-trip verification is possible.

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:117-118` — `message.multiplexing` (the MDC extension object) is warned as dropped: `"message.multiplexing extension dropped (cantools infers from signals)"`. The parenthetical "cantools infers from signals" is accurate but may be confusing — readers might think multiplexing info is lost entirely. — Rephrase to: `"message.multiplexing summary dropped — per-signal is_multiplexer/multiplexer_signal/multiplexer_ids are exported; the MDC-only summary block is not DBC-expressible"`.

### Function Size / Structure

`Embedded-Sharepoint/can/mdc/tools/dbc2mdc.py:370-411` — `_network_from_dbc` does five things: load the DB, derive FD, call `_bus_bitrates`, build the network dict, collect nodes, collect env_vars, collect attribute definitions. At 42 lines it is at the upper limit of comfortable reading but not egregiously large. No split needed, but the function signature comment (there is none) would help. — Add a one-line docstring: "Load a DBC, emit an MDC network dict and the project-level attribute definitions."

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:153-207` — `_build_database` is 55 lines. It builds messages, nodes, buses, env_vars, and dbc_specifics. The env_var loop (lines 178-193) duplicates the `type_map` dict inline, which is fine, but it is non-obvious that this map inverts `_ENV_TYPE_MAP` from dbc2mdc. — Extract the inline `type_map` to a module-level constant `_MDC_TO_ENV_TYPE = {v: k for k, v in _ENV_TYPE_MAP.items()}` and import `_ENV_TYPE_MAP` from dbc2mdc (or redeclare at module top). As written, reader must mentally verify the inversion is correct.

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:210-214` — `export_network` calls `db.as_dbc_string()` (line 212) and then immediately calls `cantools.database.dump_file(db, ...)` (line 213). The `as_dbc_string()` call's return value is discarded — this appears to be dead code or an accidental left-in call. — Remove the `db.as_dbc_string()` line or assign its result if it has a side effect you depend on; as written it is confusing and wasteful.

### Comment Hygiene

`Embedded-Sharepoint/can/mdc/lib/mdc-load.mjs:7-11` — JSDoc says "A project on disk is a folder: a required `project.mdc.json` plus optional per-network `*.mdc.json` fragments" — this is the v2 folder convention. In v3 a project is typically a *single* `<vehicle>.mdc.json` flat file; `project.mdc.json` in a folder is still supported. The doc is misleadingly v2-centric. — Update to: "A project is either a single `*.mdc.json` (preferred v3 layout) or a folder with `project.mdc.json` plus optional per-network fragments merged by `network.id`."

`Embedded-Sharepoint/can/mdc/tools/generate_can_headers.mjs:4` — JSDoc says "Replaces the legacy Embedded-Sharepoint/can/generate_can_headers.py" — the legacy file has been deleted; this historical note is now dead context for readers who join the project cold. — Remove the "Replaces…" line; it answers a question nobody will ask once the old file is gone.

`Embedded-Sharepoint/can/mdc/tools/mdc2dbc.py:222-229` — `load_project` in mdc2dbc duplicates the file-selection logic that is already in `can/mdc/lib/mdc-load.mjs:loadProject` (and partially in `mdc2dbc`'s sister tool). The Python version is standalone (no JS import possible), so duplication is intentional — but there is no comment explaining why it doesn't reuse `lib/mdc-load.mjs`. — Add `# ponytail: standalone Python implementation; lib/mdc-load.mjs is the JS canonical` so the duplication intent is clear.

`Embedded-Sharepoint/can/mdc/lib/busload.mjs:27` — `bitsPerFrame` JSDoc says "ISO 11898-1 classic CAN with maximum bit-stuffing; documented FD model with fixed stuff bits + sized CRC". This is accurate but the comment does not cite the standard section or provide the formula derivation. For a safety-adjacent calculation (bus load budgeting on a racing car), a brief derivation reference (or a link) matters. — Consider adding formula source (e.g. "see ISO 11898-1:2015 §10.8" or equivalent) or at minimum the intermediate variable names in the FD branch.

### Docs Accuracy

`Embedded-Sharepoint/can/mdc/docs/mdc-overview.md:8` — The tools list in the opening paragraph still includes `mdc2cheaders` (`mdc2cheaders`), but the tool was renamed to `generate_can_headers.mjs`. — Replace `` `mdc2cheaders` `` with `` `generate_can_headers` `` in the tools list on line 8.

`Embedded-Sharepoint/can/mdc/docs/mdc-overview.md:258-269` — The "How each consumer uses MDC" section (lines 263-268) still says `mdc2cheaders` in the tools bullet: "**Tools:** `dbc2mdc` imports DBC (cantools-backed), `mdc2cheaders` generates C headers…". — Replace `mdc2cheaders` with `generate_can_headers` to match the renamed tool.

`Embedded-Sharepoint/docs/DBC.md:30-31` — The validate step in the "Typical workflow" code block omits the `--schema-only` flag in the comment line but the command itself is correct. Minor. No action needed.

`Embedded-Sharepoint/can/mdc/docs/mdc-overview.md` (overall) — The document correctly states MDC is a superset of DBC and lists `mdc2dbc` as an export path. The import-only narrative is clear. No misleading fidelity claims found. ✓

`Embedded-Sharepoint/docs/usingDBCs.md:57` — "DBC is supported as an **import path** (`dbc2mdc.py`) and **export path** (`mdc2dbc.py`). MDC holds extensions … `mdc2dbc` logs warnings when those are dropped." — Accurate; no misleading fidelity claims. ✓

### deploy/mdc2grafana.mjs

`deploy/mdc2grafana.mjs:47` — `sig.min` and `sig.max` are v2 field names; the correct v3 names are `sig.minimum` and `sig.maximum`. Line 47: `const min = d.scaleMin ?? sig.minimum ?? sig.min;` — the v2 fallbacks `sig.min` / `sig.max` are present as a shim, which is fine during migration, but they are undocumented. — Add `// ponytail: v2 fallback — remove after v2 docs purge` comment inline on line 47 (and line 48 for `sig.max`).

`deploy/mdc2grafana.mjs:89` — `description: sig.comment ?? sig.description ?? ""` — `sig.description` is the v2 name; correct v3 is `sig.comment`. Shim is present but silent. — Add `// ponytail: v2 fallback` comment on this line.

`deploy/mdc2grafana.mjs:107` — `title: project.metadata?.name ? \`${project.metadata.name} — Telemetry\` : "MDC Telemetry"` — readable. However, the v3 flat root has `project.name` as the preferred name field; `project.metadata.name` is also present (duplicate in dbc2mdc `build_project`). The title logic ignores `project.name`. — Prefer `project.name ?? project.metadata?.name ?? "MDC Telemetry"` to avoid depending on the `metadata` sub-object.

### .github CI

`Embedded-Sharepoint/.github/check_duplicate_can_ids.py` — The cross-file duplicate check was **removed** in the rewrite (the comment at line 47 acknowledges this: "Cross-file duplicate check: same vehicle file shouldn't repeat — already covered above"). However the original CI intent was to catch duplicate frame IDs *across* vehicle files. The current logic only checks within a single file. If two vehicle MDC files define the same frame_id on the same network, they are in separate files and the check will miss it. — Add a comment above `main()` noting this limitation: "Cross-file duplicates are not checked; each file is a separate vehicle and cross-vehicle ID collision is allowed." so the deliberate scope reduction is documented.

`Embedded-Sharepoint/.github/validate_dbc_generation.py:45` — `header_path = mdc_file.with_suffix(".h")` — for a file named `HighNoon.mdc.json`, `Path.with_suffix(".h")` strips only the last extension, giving `HighNoon.mdc.h` not `HighNoon.h`. This is a functional bug (the generated header won't be found), not just a readability issue. — Use `mdc_file.with_name(mdc_file.name.replace(".mdc.json", ".h"))` or `mdc_file.parent / (mdc_file.name.split(".")[0] + ".h")`.

---

*Total findings: 21. No product code was modified.*
