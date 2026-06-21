#pragma once

#include "MdcSpec.h"
#include "bus/RawFrame.h"

#include <cstdint>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <variant>
#include <vector>

namespace engine {

// A decoded signal value: a physical number, or a string label for enumerated
// (table/choices) signals. Matches the API contract's
// `signals: { name: number | string }` (see backend/API_CONTRACT.md).
using SignalValue = std::variant<double, std::string>;

// One decoded frame. Maps 1:1 to a `live_message_batch` item — field names and
// semantics mirror the v3 payload so the binding/backend marshals it directly.
struct DecodedMessage {
    std::uint64_t timestamp_ns = 0;
    std::string raw_packet;                  // candump-style "<id>#<hexbytes>"
    std::string can_id_hex;                  // e.g. "0x1A4"
    std::optional<std::string> message_name; // nullopt when the id is unknown
    std::string sender;                      // ECU; "not_found" when unknown
    std::string network;                     // network id; "not_found" if unknown
    std::string vehicle;                     // vehicle id
    std::vector<std::pair<std::string, SignalValue>> signals;
    std::map<std::string, std::string> units;
    std::optional<int> array_index;          // set for array/indexed frames
};

// Turns RawFrames into DecodedMessages using a compiled view of an MdcSpec.
//
// All spec interpretation happens once in load(): bit layouts, conversions,
// value-table resolution, multiplexing, the array index signal, and computed-
// signal expressions are flattened into per-message decode plans. decode() then
// walks a plan and does only bit math + lookups — no spec traversal, no
// per-signal allocation beyond filling the result containers the contract
// mandates. decode() is const and thread-safe for concurrent readers.
class Decoder {
public:
    explicit Decoder(MdcSpec spec);
    ~Decoder();

    Decoder(Decoder&&) noexcept;
    Decoder& operator=(Decoder&&) noexcept;
    Decoder(const Decoder&) = delete;
    Decoder& operator=(const Decoder&) = delete;

    // Rebuild the decode plans from a new spec. Not concurrent with decode().
    void load(MdcSpec spec);

    // Decode one frame into `out` (cleared first). Returns one DecodedMessage per
    // message definition that matches the frame (normally one). Returns a single
    // undecoded stub when the id is unknown.
    void decode(const RawFrame& f, std::vector<DecodedMessage>& out) const;

    // Convenience wrapper; prefer the out-param overload on hot paths.
    std::vector<DecodedMessage> decode(const RawFrame& f) const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace engine
