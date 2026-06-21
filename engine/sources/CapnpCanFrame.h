#pragma once

#include "bus/RawFrame.h"

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace engine::capnp {

// Minimal, dependency-free codec for the v3 `CanFrame` Cap'n Proto schema
// (server/util/capnp_schemas/can_frame.capnp):
//
//   struct CanFrame { arbitrationId @0 :UInt32; isExtended @1 :Bool; data @2 :Data; }
//
// We hand-roll the wire format for this one struct rather than pulling in the
// Cap'n Proto SDK (kept out of CI; engine.mdc wants the module small/stdlib).
// Layout produced/consumed is the canonical unpacked stream: single segment,
// struct = 1 data word + 1 pointer word, data list = bytes — so it interoperates
// with pycapnp's from_bytes/to_bytes. A round-trip test guards correctness.
//
// These functions handle a single serialized message WITHOUT the 4-byte
// big-endian length prefix; the stream framing (length prefix) lives in the
// source's reader so the codec stays transport-agnostic.

// Decode one serialized CanFrame message. Returns nullopt on malformed input.
std::optional<RawFrame> decode(const std::uint8_t* msg, std::size_t len, std::string_view busName);

// Serialize a RawFrame as a CanFrame message (no length prefix).
std::vector<std::uint8_t> encode(const RawFrame& frame);

} // namespace engine::capnp
