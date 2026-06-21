#include "Slcan.h"

#include <array>
#include <chrono>
#include <cstdint>

namespace engine::slcan {

namespace {

// CAN-FD DLC length codes 9..15 map to non-contiguous byte counts; 0..8 are
// the byte count itself. Index by the 4-bit length nibble.
constexpr std::array<std::uint8_t, 16> kFdLengths = {
    0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64};

int hexVal(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

// Read `count` hex chars starting at `pos` into an unsigned value. Returns false
// on any non-hex char or short input.
bool readHex(std::string_view s, std::size_t pos, std::size_t count, std::uint32_t& out) {
    if (pos + count > s.size()) return false;
    std::uint32_t v = 0;
    for (std::size_t i = 0; i < count; ++i) {
        int d = hexVal(s[pos + i]);
        if (d < 0) return false;
        v = (v << 4) | static_cast<std::uint32_t>(d);
    }
    out = v;
    return true;
}

std::uint64_t nowNs() {
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::system_clock::now().time_since_epoch())
            .count());
}

constexpr char kHex[] = "0123456789ABCDEF";

// Reverse of kFdLengths: smallest length code whose byte count >= n.
std::uint8_t fdLengthCode(std::uint8_t n) {
    for (std::uint8_t code = 0; code < kFdLengths.size(); ++code) {
        if (kFdLengths[code] >= n) return code;
    }
    return 15;
}

} // namespace

std::optional<RawFrame> parse(std::string_view line, std::string_view busName) {
    // Trim surrounding whitespace / line terminators without allocating.
    while (!line.empty() && (line.front() == ' ' || line.front() == '\t')) line.remove_prefix(1);
    while (!line.empty() && (line.back() == '\r' || line.back() == '\n' ||
                             line.back() == ' ' || line.back() == '\t')) {
        line.remove_suffix(1);
    }
    if (line.empty()) return std::nullopt;

    const char type = line[0];
    bool extended = false;
    bool fd = false;
    switch (type) {
        case 't': extended = false; fd = false; break;
        case 'T': extended = true;  fd = false; break;
        case 'd': extended = false; fd = true;  break;
        case 'D': extended = true;  fd = true;  break;
        default: return std::nullopt; // remote frames and status lines ignored
    }

    const std::size_t idLen = extended ? 8 : 3;
    std::size_t pos = 1;

    std::uint32_t id = 0;
    if (!readHex(line, pos, idLen, id)) return std::nullopt;
    pos += idLen;

    std::uint32_t lenCode = 0;
    if (!readHex(line, pos, 1, lenCode)) return std::nullopt;
    pos += 1;

    std::uint8_t dlc = fd ? kFdLengths[lenCode & 0xF]
                          : static_cast<std::uint8_t>(lenCode > 8 ? 8 : lenCode);

    RawFrame frame;
    frame.ts_ns = nowNs();
    frame.id = id;
    frame.extended = extended;
    frame.fd = fd;
    frame.dlc = dlc;
    frame.bus.assign(busName.begin(), busName.end());

    for (std::uint8_t i = 0; i < dlc; ++i) {
        std::uint32_t byte = 0;
        if (!readHex(line, pos, 2, byte)) return std::nullopt; // truncated payload
        frame.data[i] = static_cast<std::uint8_t>(byte);
        pos += 2;
    }
    return frame;
}

std::string encode(const RawFrame& frame) {
    std::string out;
    const std::size_t idLen = frame.extended ? 8 : 3;
    out.reserve(1 + idLen + 1 + static_cast<std::size_t>(frame.dlc) * 2);

    char type;
    if (frame.fd) type = frame.extended ? 'D' : 'd';
    else type = frame.extended ? 'T' : 't';
    out.push_back(type);

    for (std::size_t i = 0; i < idLen; ++i) {
        const std::size_t shift = (idLen - 1 - i) * 4;
        out.push_back(kHex[(frame.id >> shift) & 0xF]);
    }

    const std::uint8_t lenCode = frame.fd ? fdLengthCode(frame.dlc) : (frame.dlc > 8 ? 8 : frame.dlc);
    out.push_back(kHex[lenCode & 0xF]);

    for (std::uint8_t i = 0; i < frame.dlc; ++i) {
        out.push_back(kHex[(frame.data[i] >> 4) & 0xF]);
        out.push_back(kHex[frame.data[i] & 0xF]);
    }
    return out;
}

} // namespace engine::slcan
