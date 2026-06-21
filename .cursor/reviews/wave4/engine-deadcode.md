# Wave 4 — Engine dead-code review

Track: engine (`engine/decode/`, `engine/CMakeLists.txt`, `engine/binding/`)
Reviewer: deadcode-reviewer
Date: 2026-06-19

---

## Findings

engine/decode/MdcSpec.cpp:7–30 and 32–207 — two separate `namespace engine { … }` blocks in the same file (reopened mid-file) — merge into one contiguous namespace block to remove the structural oddity; no semantic impact but it obscures that `readFile` + `loadMdcSpecFromFile` are in a different scope island from the rest.

engine/decode/MdcSpec.h:44–45 — `SignalDef.startBit` / `SignalDef.lengthBits` are v2-era C++ field names (the JSON keys were renamed to `"start"` / `"length"` in v3) — the struct fields are internal-only so no correctness issue, but they mismatch the v3 schema names everywhere; rename to `start` / `length` to match the v3 contract and avoid future confusion.

engine/decode/MdcSpec.h:108 — `MdcSpec.vehicles` is `std::vector<VehicleDef>` but v3 always synthesizes exactly one element (flat root, one-doc-one-vehicle) — the vector is never iterated with more than one entry; keeping it as the brief §5 endorses is fine, but a `ponytail:` comment stating the ceiling (always size 1; upgrade path = multi-doc aggregation) is missing.

engine/decode/MdcSpec.h:29–35 — `Conversion.factor` is set only for `Linear` conversions; for `Rational` conversions `factor` stays at its default `1.0` and is never read in `applyConversion` (the Rational branch uses only `numerator`/`denominator`/`offset`) — `factor` is a dead field in the Rational case; either document this clearly or share the field with `offset` under a union/comment so it doesn't silently mislead future readers.

engine/decode/MdcSpec.cpp:44–58 — `parseConversion` handles `"rational"` and `"table"` but the brief (§2) says `identity` and `linear` branches on the conversion object are dropped in v3; they were removed correctly and are absent — clean, no dead branches remain in this function.

engine/decode/Decoder.cpp:181–183 — multiplexorSlot detection uses `sig.role == MultiplexRole::Multiplexor || sig.name == msg.multiplexorSignal` — the second condition (`sig.name == msg.multiplexorSignal`) is a v2-era fallback that predates `is_multiplexer` / `role` being set directly from the JSON; now that `parseSignal` always derives `role` from `is_multiplexer`, a signal that is the multiplexor will always have `role == Multiplexor`, making the name-based fallback unreachable for well-formed v3 docs — add a `ponytail:` comment naming this as the fallback or remove the name-based branch.

engine/decode/.gitkeep — empty `.gitkeep` marker file remains in `engine/decode/` after real source files were added — dead artifact; delete it.

engine/CMakeLists.txt:78 — `LHR_EV1_PATH` still points to `../Embedded-Sharepoint/can/mdc/examples/lhr-ev1/project.mdc.json`; the brief (§6) confirms this path is correct — no issue, noted for completeness only.

engine/decode/DecoderTest.cpp:81 — loop index `i` is declared `std::uint8_t`; initializer-list frames are all ≤16 bytes in tests so no overflow, but the type should be `std::size_t` to match `f.dlc`'s semantic and avoid a narrowing mismatch — low-severity test-only issue.

---

## Summary

8 findings: 1 dead artifact (`.gitkeep`), 1 dead/unreachable fallback condition (multiplexor name check), 1 dead field in a specific case (`Conversion.factor` for Rational), 2 missing `ponytail:` comments on deliberate simplifications, 1 structural oddity (split namespace), 1 internal field name mismatch (v2 naming on C++ struct), 1 low-severity test type mismatch. No v2→v3 migration debris survives in JSON key reads — all field renames were applied correctly.
