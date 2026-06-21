# Wave 4 — Engine Readability Review

Reviewer: readability-reviewer (parent agent)
Scope: `engine/decode/` — Wave-3 uncommitted changes (entire `engine/` is untracked).
Context: `contract.md` §3 (field map), `brief-engine.md`.

---

## Findings

### MdcSpec.h

engine/decode/MdcSpec.h:45 — `SignalDef::startBit` keeps the old v2 camelCase name while the JSON key it reads is now `start` (contract §3.1). The struct field should be renamed `start` to match cantools `Signal.start`; same for `lengthBits` → `length`. The mismatch is silent: Decoder.cpp copies `sig.startBit` → `sp.startBit` / `sig.lengthBits` → `sp.length`, so the decoder is fine, but a reader following "struct mirrors schema" gets confused when the struct name and the JSON key differ. — Rename `SignalDef::startBit` → `start`, `SignalDef::lengthBits` → `length`; update Decoder.cpp copy sites (`sp.startBit = sig.startBit` → `sp.startBit = sig.start`, etc.).

engine/decode/MdcSpec.h:80 — `MessageDef::id` keeps v2 name while the JSON key is now `frame_id` (contract §3.3). Same silent mismatch as above. — Rename `MessageDef::id` → `frame_id`; update Decoder.cpp (`plan->id = msg.id` → `plan->id = msg.frame_id`).

engine/decode/MdcSpec.h:81 — `MessageDef::extended` should be `is_extended_frame` (contract §3.3 `is_extended_frame`). `MessageDef::fd` should be `is_fd`. — Rename both fields to match the schema keys exactly; prevents "extended" meaning different things in the struct vs the JSON.

engine/decode/MdcSpec.h:8-17 — File header comment says schema hierarchy is `project -> vehicle -> ...` but v3 flattened the root (no `vehicles[]`). The comment is stale after the Wave-3 flatten. — Update to `project (root) -> network -> message -> signal`; remove the `vehicle` tier.

engine/decode/MdcSpec.h:101-104 — `VehicleDef` struct is now a synthetic implementation detail (the JSON no longer has `vehicles[]`; `loadMdcSpecFromString` manufactures one). Keeping it as an exported public type with no comment misleads readers into thinking the schema still has vehicles. — Add a comment: `// Synthesized from the flat v3 root; not a schema type.`; or collapse it into `MdcSpec` directly (ponytail preferred, but touches Decoder.cpp traversal).

### MdcSpec.cpp

engine/decode/MdcSpec.cpp:32-30 — The file opens two separate `namespace engine { ... }` blocks with a file-level close and reopen between them (lines 7–30 close, lines 32–207 reopen). This is legal C++ but unusual and confusing — a reader scanning for the closing brace of the first block finds it before `loadMdcSpecFromString`. — Merge into a single `namespace engine { ... }` block.

engine/decode/MdcSpec.cpp:65 — `conversionFromNative`: the identity check `scale == 1.0 && offset == 0.0` is a floating-point equality on doubles read from JSON. Exact equality works for the integer defaults (1 and 0) but silently misclassifies `scale: 1.0000000001` as `Linear`. The `ConversionKind` distinction is an internal optimization; the mismatch is low-risk but worth naming. — Add a `ponytail:` comment: `// ponytail: exact == works for JSON integer defaults 1/0; non-default scales that happen to equal 1.0 are also fine (factor=1 linear == identity).`

engine/decode/MdcSpec.cpp:154 — `parseMessage` reads `msg.multiplexorSignal` from `m["multiplexing"].value("multiplexorSignal", ...)` using the old camelCase key `multiplexorSignal`. The contract §3.3 says `message.multiplexing` is a "kept MDC extension" with key `multiplexorSignal` — this is correct per contract. However `brief-engine.md §4` says Decoder uses `msg.multiplexorSignal` while `parseSignal` now fills `multiplexer_signal` (snake_case, signal-level). The two paths are distinct (message-level summary vs signal-level field) but the different casing in the same file (`multiplexorSignal` vs `multiplexer_signal`) is a readability hazard. — Add a comment at the `multiplexorSignal` read site: `// message-level multiplexing summary (kept MDC extension); not renamed — distinct from signal-level multiplexer_signal.`

### Decoder.cpp

engine/decode/Decoder.cpp:63 — `constexpr std::size_t kMaxSlots = 512;` — the comment says `<= bits in a 64-byte frame` which is correct (64 × 8 = 512). But the constant is used to cap `plan->slotCount` at load time AND to size the `std::array<double, kMaxSlots> slots` on the stack in `decodeOne`. A 512-element `double` array is 4 KiB on the stack per call; fine for now, but worth naming the ceiling. — Add a `ponytail:` comment: `// ponytail: 4 KiB stack frame per decode call; upgrade path = heap-allocated slot buffer in MessagePlan if stack overflow is observed on embedded targets.`

engine/decode/Decoder.cpp:164 — `plan->slotCount = std::min(msg.signals.size(), kMaxSlots);` — `slotCount` is set but never read in `decodeOne` or anywhere else in Decoder.cpp. The actual slot bound used in `decodeOne` is `if (i < slots.size())` (line 272), which checks against the fixed `kMaxSlots` array size, not `plan->slotCount`. The field appears dead. — Either remove `slotCount` from `MessagePlan` or add a comment explaining why it's reserved for future use (e.g. pre-sizing an external buffer). If dead, delete it.

engine/decode/Decoder.cpp:91-94 — `applyConversion` Rational branch: the variable name `k` is used as both the loop variable and the polynomial coefficient. This is idiomatic Horner's but `k` reads as an index. — Rename to `coeff` for the coefficient in each loop.

engine/decode/Decoder.cpp:189-199 — `resolver` lambda captures `msg` by reference; it is defined inside `build()` which is called on load (not hot path), so this is correct. But the lambda's local variable `name` (line 190) shadows the outer `std::string_view name` parameter of the lambda itself — the outer parameter is also called `id` on line 189, so no actual shadowing occurs, but the pattern `std::string_view name = id;` followed by overwriting `name` on the dot-split path is confusing. — Rename the lambda parameter to `ref` or `sigRef` and the local to `bare` to make the two parts of `"Message.Signal"` obvious.

engine/decode/Decoder.cpp:272 — `if (i < slots.size())` — `slots.size()` is always `kMaxSlots` (it's a `std::array<double, kMaxSlots>`); `i` iterates `plan.signals` which is already capped at `kMaxSlots` by `slotCount` assignment at build time (though `slotCount` itself is unused, the `MessagePlan::signals` vector won't exceed the input `msg.signals` which could theoretically exceed `kMaxSlots` for a pathological spec). — Either assert `i < kMaxSlots` at build time and remove the runtime check, or keep the check and add a comment explaining the cap. As-is, the guard is silently implied and the relationship between `kMaxSlots`, `slotCount`, and `slots.size()` requires tracing three sites to understand.

engine/decode/Decoder.cpp:338 — `if (plan->extended != f.extended) continue;` — the comment `// 11- vs 29-bit id mismatch` is accurate. But the `f.extended` field on `RawFrame` is not populated by most sources (a grep of the sources directory shows it defaults to `false`). This means all plans with `extended = true` will be silently skipped for every frame from sources that don't set the flag. — Add a `ponytail:` comment or a TODO noting that `RawFrame.extended` must be set by sources for this filter to work; otherwise remove the filter.

### BitExtract.h

engine/decode/BitExtract.h:65 — `pos + 15 - static_cast<int>(bit)` is the Motorola sawtooth jump to the next byte's MSB. The `15` is a magic number: it equals `8 + 7` (advance one byte, then go to bit 7). — Add an inline comment: `/* +8 for next byte, +7 for MSB = +15 */` or name a `constexpr int kMotorolaByteJump = 15;`.

engine/decode/BitExtract.h:100 — `(127 - 15 - e + 1)` in `halfToDouble` subnormal path: three magic numbers (`127` = float32 exponent bias, `15` = float16 exponent bias, `+1` is off-by-one correction for the implicit leading 1 after normalization). Correct, but dense. — Add a comment: `/* float32 bias(127) - half bias(15) - normalization adjustment + 1 */` or inline `constexpr` names.

engine/decode/BitExtract.h:87 — `0x8000u`, `0x1Fu`, `0x3FFu` in `halfToDouble` are well-known IEEE-754 half-precision masks. No comments. A reader who doesn't know the half format will need to verify externally. — Add brief field labels as a single-line comment block: `// half sign[15], exp[14:10], mantissa[9:0]` before the extractions.

### DecoderTest.cpp

engine/decode/DecoderTest.cpp:82 — `std::uint8_t i = 0;` used as loop counter in `frame()` helper — `i` shadows the outer loop variable name and the loop increments `f.data[i++]` where `i` is both the index and the counter, so the type `uint8_t` is intentional but the name `i` reads as a generic index, not a byte counter. — Rename to `idx` or `byteCount` to distinguish it from the range-for loop variable.

engine/decode/DecoderTest.cpp:203-204 — Rational conversion test vector `{1, 0}` numerator and `{10}` denominator represents `(1*x + 0) / 10 = x/10`, so `Torque = raw / 10`. The test then checks `Torque = 123.4` from bytes `{0xD2, 0x04}` which is `0x04D2 = 1234` in LE, and `1234 / 10 = 123.4`. This is correct but the rational coefficients aren't commented. — Add a comment: `// rational: (1*raw + 0) / 10` so the intent is checkable without doing the Horner math.

---

## Summary

- **Naming drift** (3 findings): `SignalDef::startBit/lengthBits`, `MessageDef::id/extended/fd` retain v2 camelCase while the JSON keys are now v3 snake_case. Low bug risk (the copy sites still work), high readability cost.
- **Dead field** (1 finding): `MessagePlan::slotCount` is set but never consumed.
- **Magic numbers** (3 findings): `kMaxSlots` stack-size ceiling, Motorola `+15` jump, IEEE-754 half masks.
- **Stale comment** (1 finding): header doc still mentions `vehicles[]` hierarchy.
- **Minor** (4 findings): double `namespace` block, Horner variable name, resolver lambda naming, `VehicleDef` not marked as synthetic.
