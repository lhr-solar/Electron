# DRY Review — engine/ Wave 3 (Wave 4 review pass)

Scope: all untracked files under `engine/` (entire directory is new/untracked on branch `v3`).
Focus: `engine/decode/MdcSpec.cpp`, `engine/decode/Decoder.cpp`, `engine/decode/BitExtract.h`, `engine/decode/DecoderTest.cpp`.

---

## Findings

### F1 — Major: repeated `if (contains + is_array) for … push_back` pattern (~14 sites)

`engine/decode/MdcSpec.cpp:51-52` — `if (c.contains("numerator") && c["numerator"].is_array()) for (... : c["numerator"]) conv.numerator.push_back(v.get<double>())` — first instance of the guard-and-iterate idiom; propose `template<typename T, typename F> void parseJsonArray(const json& obj, std::string_view key, std::vector<T>& out, F fn)` used at every site below

`engine/decode/MdcSpec.cpp:53-54` — identical guard-and-iterate for `"denominator"` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:125-126` — `if (m.contains("signals") && m["signals"].is_array()) for (... : m["signals"]) msg.signals.push_back(parseSignal(s))` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:127-128` — same pattern for `"computedSignals"` / `parseComputed` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:137-138` — senders in `parseContainedMessage`: `if (m.contains("senders") && m["senders"].is_array()) for (... : m["senders"]) msg.senders.push_back(s.get<std::string>())` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:151-152` — senders in `parseMessage` (exact copy-paste of lines 137-138) — same `parseJsonArray` helper; see also F2

`engine/decode/MdcSpec.cpp:161-162` — `"elementSignals"` in `parseMessage` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:165-166` — `"contained_messages"` / `parseContainedMessage` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:173-174` — `"valueTables"` in `parseNetwork` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:175-176` — `"messages"` in `parseNetwork` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:177-178` — `"computedSignals"` in `parseNetwork` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:195-196` — `"valueTables"` in `loadMdcSpecFromString` — same `parseJsonArray` helper

`engine/decode/MdcSpec.cpp:201-202` — `"networks"` in `loadMdcSpecFromString` — same `parseJsonArray` helper

---

### F2 — Exact copy-paste: `senders` parsing block duplicated verbatim

`engine/decode/MdcSpec.cpp:137-138` vs `engine/decode/MdcSpec.cpp:151-152` — two-line `senders` guard-and-iterate block is identical in `parseContainedMessage` and `parseMessage`; the only difference is the call site — propose `static void parseSenders(const json& obj, std::vector<std::string>& out)` called from both, or subsume under the F1 `parseJsonArray` helper

---

### F3 — Repeated pair-of-array parsing: numerator / denominator in `parseConversion`

`engine/decode/MdcSpec.cpp:51-54` — two consecutive identical 2-line guard-and-iterate blocks that differ only in the JSON key (`"numerator"` vs `"denominator"`) and target vector (`conv.numerator` vs `conv.denominator`); the F1 `parseJsonArray` helper eliminates both; alternatively a local `auto readCoeffs = [&](std::string_view key, auto& vec){ … }` lambda collapses the pair in place without a top-level helper

---

### F4 — Sign-extension / raw-integer extraction duplicated across two functions

`engine/decode/Decoder.cpp:103-106` (`extractRawInt`) — `(sp.kind == SignalKind::Signed) ? signExtend(bits, sp.length) : static_cast<std::int64_t>(bits)` — inline ternary that replicates the Signed and Unsigned branches of the `switch(sp.kind)` in `decodeOne` (lines 256-268); `extractRawInt` intentionally omits the Float branch (correct for mux/array-index use), but the Signed-vs-Unsigned raw-integer logic is a structural copy — propose `inline std::int64_t bitsToRawInt(std::uint64_t bits, SignalKind kind, std::uint32_t length)` in `BitExtract.h` (already the shared header for hot-path primitives) that handles Signed with `signExtend` and Unsigned/Float-treated-as-unsigned with a cast; both `extractRawInt` and the `rawInt` assignment inside `decodeOne`'s switch collapse to a single call

---

## Proposed shared helpers (summary)

| Helper | Location | Replaces |
|--------|----------|---------|
| `template<typename T,typename F> void parseJsonArray(const json&, std::string_view, std::vector<T>&, F)` | `MdcSpec.cpp` anonymous namespace (or a new `ParseUtils.h`) | F1: all 13 guard-and-iterate sites |
| `void parseSenders(const json&, std::vector<std::string>&)` | subsumed by `parseJsonArray` above | F2: duplicate senders block |
| `inline std::int64_t bitsToRawInt(std::uint64_t bits, SignalKind, std::uint32_t length)` | `engine/decode/BitExtract.h` | F4: `extractRawInt` ternary + `rawInt` assignments in `decodeOne` switch |

The F3 pair (numerator/denominator) is resolved by the same `parseJsonArray` helper from F1.
