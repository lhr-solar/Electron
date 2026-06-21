#pragma once

#include <array>
#include <cstdint>
#include <string>

namespace engine {

// Canonical wire representation of a single CAN/CAN-FD frame as it enters the
// engine. Decoupled from any source format (slcan text, Cap'n Proto, socketcan
// struct, ...) — every ISource normalizes into this before publishing.
//
// Fixed-size by design: the 64-byte payload covers CAN-FD, and `bus` is the
// only variable-length field. Typical bus names ("can0", "vcan1") fit in
// std::string SSO, so a RawFrame carries no heap allocation in practice.
struct RawFrame {
    std::uint64_t ts_ns = 0;            // capture timestamp, nanoseconds since epoch
    std::uint32_t id = 0;               // arbitration id (11- or 29-bit)
    bool extended = false;             // 29-bit extended identifier
    bool fd = false;                   // CAN-FD frame
    std::uint8_t dlc = 0;              // payload length in bytes (0..64)
    std::array<std::uint8_t, 64> data{}; // payload; only [0, dlc) is meaningful
    std::string bus;                   // logical bus/channel name, e.g. "can0"
};

} // namespace engine
