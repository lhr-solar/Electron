#pragma once

#include <algorithm>
#include <cstdint>
#include <cstring>

// Shared bit-field extraction for the decode hot path. Header-only and
// allocation-free so both the Decoder and unit tests use the exact same routine
// (mdc-overview.md: "Importers and the engine share one bit-extraction routine;
// do not re-derive it per tool").
//
// `start` field convention (v3: signal.start):
//   little_endian (Intel)  : start is the signal LSB; bits grow upward.
//   big_endian  (Motorola) : start is the signal MSB in DBC sawtooth
//                            numbering; the field grows MSB-first, dropping to
//                            the top of the next byte at each byte boundary.

namespace engine::decode {

// Intel: byte n holds bits [8n, 8n+7] with 8n the LSB of that byte.
inline std::uint64_t extractLittleEndian(const std::uint8_t* data, std::size_t len,
                                         std::uint32_t startBit, std::uint32_t length) {
    std::uint64_t result = 0;
    std::uint32_t byteIndex = startBit >> 3;
    std::uint32_t bitOffset = startBit & 7u;
    std::uint32_t bitsRemaining = length;
    std::uint32_t resultOffset = 0;

    while (bitsRemaining > 0) {
        if (byteIndex >= len) break;
        const std::uint32_t bitsInThisByte =
            std::min(bitsRemaining, 8u - bitOffset);
        const std::uint64_t mask = (std::uint64_t{1} << bitsInThisByte) - 1u;
        const std::uint64_t byteValue =
            (static_cast<std::uint64_t>(data[byteIndex]) >> bitOffset) & mask;
        result |= byteValue << resultOffset;
        bitsRemaining -= bitsInThisByte;
        resultOffset += bitsInThisByte;
        bitOffset = 0;
        ++byteIndex;
    }
    return result;
}

// Motorola sawtooth: read MSB-first from startBit, decrementing the bit index
// within a byte and jumping to the next byte's MSB (pos += 15) at bit 0.
// Extracts whole runs within each byte instead of one bit per loop iteration.
inline std::uint64_t extractBigEndian(const std::uint8_t* data, std::size_t len,
                                      std::uint32_t startBit, std::uint32_t length) {
    std::uint64_t result = 0;
    int pos = static_cast<int>(startBit);
    std::uint32_t remaining = length;
    while (remaining > 0) {
        const std::uint32_t byte = static_cast<std::uint32_t>(pos) >> 3;
        const std::uint32_t bit = static_cast<std::uint32_t>(pos) & 7u;
        const std::uint32_t take = std::min(remaining, bit + 1u);
        std::uint64_t chunk = 0;
        if (byte < len) {
            const std::uint32_t shift = bit + 1u - take;
            chunk = (static_cast<std::uint64_t>(data[byte]) >> shift) &
                    ((std::uint64_t{1} << take) - 1u);
        }
        result = (result << take) | chunk;
        remaining -= take;
        // +8 for next byte, +7 for MSB = +15
        pos = (take == bit + 1u) ? pos + 15 - static_cast<int>(bit)
                                   : pos - static_cast<int>(take);
    }
    return result;
}

inline std::uint64_t extractBits(const std::uint8_t* data, std::size_t len, bool bigEndian,
                                 std::uint32_t startBit, std::uint32_t length) {
    return bigEndian ? extractBigEndian(data, len, startBit, length)
                     : extractLittleEndian(data, len, startBit, length);
}

// Sign-extend a `length`-bit two's-complement field held in the low bits of raw.
inline std::int64_t signExtend(std::uint64_t raw, std::uint32_t length) {
    if (length == 0 || length >= 64) return static_cast<std::int64_t>(raw);
    const std::uint64_t signBit = std::uint64_t{1} << (length - 1);
    if (raw & signBit) return static_cast<std::int64_t>(raw | (~std::uint64_t{0} << length));
    return static_cast<std::int64_t>(raw);
}

inline std::int64_t bitsToRawInt(std::uint64_t bits, bool isSigned, std::uint32_t length) {
    return isSigned ? signExtend(bits, length) : static_cast<std::int64_t>(bits);
}

// IEEE-754 half (binary16) -> double, for 16-bit float signals.
// half sign[15], exp[14:10], mantissa[9:0]
inline double halfToDouble(std::uint16_t h) {
    const std::uint32_t sign = (h & 0x8000u) << 16;
    const std::uint32_t exp = (h >> 10) & 0x1Fu;
    const std::uint32_t mant = h & 0x3FFu;
    std::uint32_t bits;
    if (exp == 0) {
        if (mant == 0) {
            bits = sign;  // +/- 0
        } else {
            // Subnormal: normalize into a float.
            std::uint32_t e = 0;
            std::uint32_t m = mant;
            while ((m & 0x400u) == 0) { m <<= 1; ++e; }
            m &= 0x3FFu;
            // float32 bias(127) - half bias(15) - normalization adjustment + 1
            bits = sign | ((127 - 15 - e + 1) << 23) | (m << 13);
        }
    } else if (exp == 0x1Fu) {
        bits = sign | 0x7F800000u | (mant << 13);  // inf / NaN
    } else {
        bits = sign | ((exp - 15 + 127) << 23) | (mant << 13);
    }
    float f;
    std::memcpy(&f, &bits, sizeof(f));
    return static_cast<double>(f);
}

// Reinterpret a raw bit-field as an IEEE-754 float of the given width.
inline double rawToFloat(std::uint64_t raw, std::uint32_t length) {
    if (length == 32) {
        std::uint32_t u = static_cast<std::uint32_t>(raw);
        float f;
        std::memcpy(&f, &u, sizeof(f));
        return static_cast<double>(f);
    }
    if (length == 64) {
        double d;
        std::memcpy(&d, &raw, sizeof(d));
        return d;
    }
    if (length == 16) return halfToDouble(static_cast<std::uint16_t>(raw));
    return static_cast<double>(raw);  // non-standard width: best-effort
}

} // namespace engine::decode
