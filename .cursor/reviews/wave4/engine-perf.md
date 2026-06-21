# Wave 4 PERF Review — Engine Track (Wave 3 changes)

Reviewer: perf-reviewer · Wave 4 · Jun 19 2026  
Scope: `engine/` working-tree additions (all untracked). Focus on per-frame hot path, map lookups, string ops, numeric branching, container/mux decode, and work that should be load-time-only but is per-frame.

---

## Hot-path findings (per-frame decode path)

`engine/decode/Decoder.h:33` — `DecodedMessage::units` is `std::map<std::string, std::string>` (red-black tree): every signal with a non-empty unit causes a heap-allocated tree-node insertion + string key copy per frame. Fix: replace with `std::vector<std::pair<std::string_view, std::string>>` using stable plan storage for the key, or at minimum `std::unordered_map`; units are append-only per frame so ordered iteration is unused.

`engine/decode/Decoder.cpp:233-236` — `decodeOne` copies four stable `MessagePlan` strings (`message_name`, `sender`, `network`, `vehicle`) into fresh `std::string` fields on every frame. Plan storage is stable for the engine session (owned by `Impl::plans`). Fix: change those four `DecodedMessage` fields to `std::string_view` pointing into the plan; the `optional<string_view>` pattern works for `message_name`.

`engine/decode/Decoder.cpp:276,279` — `m.signals.emplace_back(sp.name, ...)` copies `SignalPlan::name` (a `std::string`) per signal per frame. `SignalPlan` objects are stable in `plan->signals` (heap-allocated via `unique_ptr<MessagePlan>`). Fix: change `SignalPlan::name` to `std::string_view` into the corresponding `SignalDef::name`, which is itself stable in `MdcSpec`; wire up at `build()` time.

`engine/decode/Decoder.cpp:239-240` — `std::array<double, 512> slots; slots.fill(std::nan(""))` zeroes all 512 doubles (4 KB) on every frame regardless of actual signal count. At 10 kfps this is ~40 MB/s of write bandwidth for the fill alone. `plan.slotCount` already tracks the real count. Fix: `std::fill_n(slots.data(), plan.slotCount, std::nan(""))`.

`engine/decode/Decoder.cpp:257-268` — in the `Float` branch, `rawInt = static_cast<std::int64_t>(rawNum)` is computed unconditionally, but `rawInt` is only consumed if `sp.labels != nullptr`. Most float signals have no labels. Fix: compute `rawInt` only inside the `if (sp.labels)` block; hoist the signed/float `rawInt` computation to the label branch only.

`engine/decode/Decoder.cpp:115,322` — `byNetwork` outer key is `std::string`; every call to `decode()` hashes `f.bus` (a heap or SSO string) via `unordered_map::find`. For short bus names this is SSO-safe, but the hash still runs per frame. Fix: at `build()` time assign each network a `uint32_t` index and store a `bus_name → index` flat map; carry an integer `bus_id` on `RawFrame` (sources fill it at publish time from a shared registry). Eliminates the per-frame string hash on the dispatch hot path.

`engine/decode/Decoder.cpp:74-80` — `formatRawPacket` writes into `m.raw_packet` (a `std::string` member of a freshly constructed `DecodedMessage`). For 64-byte CAN-FD frames the formatted string is `"<29-bit-id>#<128 hex chars>"` ≈ 137 chars, well above SSO (~15 chars on libstdc++/libc++). This causes a heap allocation per FD frame. Fix: pre-allocate `raw_packet` storage in `DecodedMessage` as a `char[]` + length field, or carry the pre-formatted string in `MessagePlan` for the id-hex part and only append the data bytes into a reusable buffer.

`engine/decode/Decoder.cpp:228` — `decodeOne` returns `DecodedMessage` by value, constructing it fresh each call with new `std::vector` (signals), `std::map` (units), and multiple `std::string` allocations. The caller appends to `out` (already using the out-param pattern). Fix: pass a `DecodedMessage&` scratch into `decodeOne` and clear-then-fill it rather than construct-then-return; the outer loop already reuses `decodeScratch_` across batches — extend that discipline to the inner per-plan slot.

`engine/decode/Decoder.cpp:181-183` — the multiplexor-slot search does two independent checks: `sig.role == MultiplexRole::Multiplexor` (from the signal's own field) **and** `sig.name == msg.multiplexorSignal` (from the message-level summary). For non-multiplexed messages both checks run on every signal in the build loop. Harmless at load time, but the double-check means the build writes `plan->multiplexorSlot` for signals that satisfy either condition separately — the `||` may produce a duplicate assignment if both fields are set consistently. Recommend a single authority (prefer `role == Multiplexor` per the contract §6 mapping) and drop the name-fallback check to remove ambiguity.

---

## Multiplexing path

`engine/decode/Decoder.cpp:247-248` — `std::binary_search(sp.muxIds.begin(), sp.muxIds.end(), muxRaw)` is correct and O(log N) after the build-time `sort`. No issue if `muxIds` stays small (DBC mux values). For extended mux with large expanded `multiplexer_ids[]` arrays (contract §6 ponytail note), binary search is still fine but the `muxIds` vector itself will be large; the sort at `build()` is the right place to pay that cost.

---

## Load-time findings (not hot-path but scale with spec size)

`engine/decode/Decoder.cpp:137-141` — `resolveLabels` does a linear scan of `net.valueTables` (then `spec.valueTables`) per signal that has a `valueTableRef`. For specs with many signals sharing a handful of tables (e.g. a J1939-heavy database), this is O(signals × tables) at load. Fix: at `build()` entry, build a `unordered_map<string_view, const ValueTable*>` index over both table sets, then resolve in O(1).

`engine/decode/Decoder.cpp:196-198` — the `resolver` lambda scans `msg.signals` linearly per identifier in each computed signal expression. For messages with many signals and complex expressions this is O(signals × expr_refs) at load. Fix: build a `unordered_map<string_view, int>` of signal name → slot index once per message before compiling expressions.

`engine/decode/MdcSpec.cpp:47` — `const std::string kind = c.value("kind", std::string{})` copies the `"kind"` value into a heap string for two `==` comparisons. Load-time only, but `std::string_view` (or `nlohmann::json`'s `get<std::string_view>()` with SAX access) avoids the copy. Same pattern at `MdcSpec.cpp:95`: `s.value("byte_order", std::string{"little_endian"}) == "big_endian"` constructs two temporaries for a single bool.

`engine/decode/MdcSpec.cpp:138` — `parseContainedMessage` copies all `senders[]` strings into `MessageDef::senders`; the decoder only ever uses `senders.front()`. Load-time only, but wasteful for large sender lists. Fix: store only the first sender in the contained-message parse path.

---

## Container / ISO-TP path

`engine/decode/Decoder.cpp:144-153` — the `ponytail:` comment correctly gates container decode behind presence (no fixture yet). No immediate concern, but when the container path is activated: selecting a `containedMessage` by `header_id` will require a per-frame scan of `MessageDef::contained` (or a precomputed `header_id → MessageDef*` map). Precompute the map at `build()` time to avoid a per-frame linear scan over contained-message lists.

---

## Binding / Python boundary

`engine/binding/bindings.cpp:40-48` — `toBatchItem` iterates `m.signals` (a `vector<pair<string, SignalValue>>`) and `m.units` (a `std::map`) to populate Python dicts. The `map` iteration does tree traversal. If the `units` type changes to a flat vector (finding 1 above), iteration becomes a tight loop. No GIL release here — this is on the Python consumer thread, not the decode thread — but the map traversal adds unnecessary overhead in the GIL-held section.

---

## No finding

`engine/decode/BitExtract.h` — extraction routines are allocation-free, inline, and loop over only the bytes used. No issue.  
`engine/decode/Expr.h/cpp` — `evalExpr` uses a fixed `std::array<double, 32>` stack with no allocation. Compile path is load-time only. No issue.  
`engine/bus/InProcBus` — bounded ring buffer, pre-allocated slots, no per-frame heap. No issue.  
`engine/binding/EngineHandle.cpp:110-128` — decoder snapshot taken once per batch (not per frame), mutex off the per-frame inner loop. No issue.
