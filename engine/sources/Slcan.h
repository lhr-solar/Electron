#pragma once

#include "bus/RawFrame.h"

#include <optional>
#include <string>
#include <string_view>

namespace engine::slcan {

// slcan (a.k.a. LAWICEL) ASCII frame codec, shared by every text-based CAN
// source (tcp-slcan, serial, file replay). Mirrors the v3 reference
// (server/util/slcan_to_can_msg.py + can_to_slcan.py) and extends it to CAN-FD.
//
// Frame line grammar (terminator '\r' already stripped by the caller):
//   t<iii><l><data>          standard 11-bit, classic CAN   (l = 0..8)
//   T<iiiiiiii><l><data>     extended 29-bit, classic CAN
//   d<iii><l><data>          standard 11-bit, CAN-FD         (l = 0..F length code)
//   D<iiiiiiii><l><data>     extended 29-bit, CAN-FD
// where <data> is 2 hex chars per byte. FD length codes 9..F map to the
// CAN-FD DLC table (12,16,20,24,32,48,64). Remote frames ('r'/'R') are ignored.

// Parse one line into a RawFrame tagged with `busName`. Returns nullopt for
// blank/unknown/malformed lines. ponytail: index-based, no heap allocation on
// the per-frame path (RawFrame::bus uses SSO for typical channel names).
std::optional<RawFrame> parse(std::string_view line, std::string_view busName);

// Encode a RawFrame back to an slcan line (no trailing '\r'). Used by tooling
// and tests; not on the ingest hot path.
std::string encode(const RawFrame& frame);

} // namespace engine::slcan
