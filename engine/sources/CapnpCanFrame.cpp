#include "CapnpCanFrame.h"

#include <chrono>
#include <cstring>

namespace engine::capnp {

namespace {

constexpr std::size_t kWord = 8;

std::uint64_t nowNs() {
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::system_clock::now().time_since_epoch())
            .count());
}

std::uint64_t readU64(const std::uint8_t* p) {
    std::uint64_t v;
    std::memcpy(&v, p, sizeof(v)); // little-endian wire == host on supported targets
    return v;
}

std::uint32_t readU32(const std::uint8_t* p) {
    std::uint32_t v;
    std::memcpy(&v, p, sizeof(v));
    return v;
}

void writeU64(std::uint8_t* p, std::uint64_t v) { std::memcpy(p, &v, sizeof(v)); }

// Sign-extend the 30-bit pointer offset field (bits 2..31).
std::int32_t pointerOffset(std::uint64_t ptr) {
    std::int32_t off = static_cast<std::int32_t>((ptr >> 2) & 0x3FFFFFFF);
    if (off & 0x20000000) off |= static_cast<std::int32_t>(0xC0000000); // sign-extend bit 29
    return off;
}

} // namespace

std::optional<RawFrame> decode(const std::uint8_t* msg, std::size_t len, std::string_view busName) {
    // Stream header: [uint32 segCount-1][uint32 seg0 words]... (single segment).
    if (len < 2 * sizeof(std::uint32_t)) return std::nullopt;
    const std::uint32_t segCountMinus1 = readU32(msg);
    if (segCountMinus1 != 0) return std::nullopt; // only single-segment messages
    const std::uint32_t segWords = readU32(msg + 4);
    const std::size_t headerBytes = 2 * sizeof(std::uint32_t); // already word-aligned
    const std::uint8_t* seg = msg + headerBytes;
    const std::size_t segBytes = static_cast<std::size_t>(segWords) * kWord;
    if (headerBytes + segBytes > len || segWords < 1) return std::nullopt;

    auto wordPtr = [&](std::size_t wordIdx) -> const std::uint8_t* {
        return seg + wordIdx * kWord;
    };
    auto inSeg = [&](std::size_t wordIdx, std::size_t words) {
        return wordIdx + words <= segWords;
    };

    // Root struct pointer at word 0.
    const std::uint64_t root = readU64(wordPtr(0));
    if ((root & 0x3) != 0) return std::nullopt; // expect a struct pointer
    const std::int32_t structOff = pointerOffset(root);
    const std::uint16_t dataWords = static_cast<std::uint16_t>((root >> 32) & 0xFFFF);
    const std::uint16_t ptrWords = static_cast<std::uint16_t>((root >> 48) & 0xFFFF);
    const std::int64_t dataStart = 1 + static_cast<std::int64_t>(structOff);
    if (dataStart < 0 || dataWords < 1) return std::nullopt;
    if (!inSeg(static_cast<std::size_t>(dataStart), dataWords + ptrWords)) return std::nullopt;

    RawFrame frame;
    frame.ts_ns = nowNs();
    frame.bus.assign(busName.begin(), busName.end());

    const std::uint8_t* data = wordPtr(static_cast<std::size_t>(dataStart));
    frame.id = readU32(data);                 // arbitrationId @0
    frame.extended = (data[4] & 0x1) != 0;    // isExtended @1 (bit 32)

    // data @2 — list pointer in the struct's pointer section.
    if (ptrWords < 1) return frame; // no payload pointer; empty frame
    const std::size_t ptrWordIdx = static_cast<std::size_t>(dataStart) + dataWords;
    const std::uint64_t listPtr = readU64(wordPtr(ptrWordIdx));
    if (listPtr == 0) return frame; // null Data → zero-length payload
    if ((listPtr & 0x3) != 1) return std::nullopt; // expect a list pointer
    const std::uint8_t elemSize = static_cast<std::uint8_t>((listPtr >> 32) & 0x7);
    if (elemSize != 2) return std::nullopt; // byte list (Data) expected
    const std::uint32_t count = static_cast<std::uint32_t>((listPtr >> 35) & 0x1FFFFFFF);
    const std::int32_t listOff = pointerOffset(listPtr);
    const std::int64_t listStartWord = static_cast<std::int64_t>(ptrWordIdx) + 1 + listOff;
    if (listStartWord < 0) return std::nullopt;
    const std::size_t byteStart = static_cast<std::size_t>(listStartWord) * kWord;
    if (byteStart + count > segBytes) return std::nullopt;

    const std::uint8_t dlc = static_cast<std::uint8_t>(count > 64 ? 64 : count);
    frame.dlc = dlc;
    frame.fd = dlc > 8; // classic CAN tops out at 8; longer payloads imply CAN-FD
    std::memcpy(frame.data.data(), seg + byteStart, dlc);
    return frame;
}

std::vector<std::uint8_t> encode(const RawFrame& frame) {
    const std::uint8_t dlc = frame.dlc > 64 ? 64 : frame.dlc;
    const std::size_t dataWords = (static_cast<std::size_t>(dlc) + kWord - 1) / kWord; // ceil
    // Words: [0]=root struct ptr, [1]=struct data, [2]=struct ptr (Data list), [3..]=bytes.
    const std::size_t segWords = 3 + dataWords;
    const std::size_t headerBytes = 2 * sizeof(std::uint32_t);

    std::vector<std::uint8_t> out(headerBytes + segWords * kWord, 0);
    // Stream header: 1 segment, segWords words.
    std::uint32_t hdr0 = 0, hdr1 = static_cast<std::uint32_t>(segWords);
    std::memcpy(out.data(), &hdr0, sizeof(hdr0));
    std::memcpy(out.data() + 4, &hdr1, sizeof(hdr1));

    std::uint8_t* seg = out.data() + headerBytes;

    // word 0: root struct pointer — offset 0, 1 data word, 1 pointer word.
    writeU64(seg, (std::uint64_t{1} << 32) | (std::uint64_t{1} << 48));

    // word 1: data section — arbitrationId (LE) + isExtended bit.
    std::uint32_t id = frame.id;
    std::memcpy(seg + kWord, &id, sizeof(id));
    seg[kWord + 4] = frame.extended ? 0x1 : 0x0;

    // word 2: Data list pointer — offset 0, element size byte(2), count = dlc.
    const std::uint64_t listPtr =
        std::uint64_t{1} | (std::uint64_t{2} << 32) | (static_cast<std::uint64_t>(dlc) << 35);
    writeU64(seg + 2 * kWord, listPtr);

    // word 3..: payload bytes (trailing padding already zero).
    std::memcpy(seg + 3 * kWord, frame.data.data(), dlc);
    return out;
}

} // namespace engine::capnp
