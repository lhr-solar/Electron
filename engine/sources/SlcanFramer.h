#pragma once

#include "Slcan.h"
#include "bus/RawFrame.h"

#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <utility>

namespace engine {

// Reassembles slcan lines from a byte stream (TCP or serial) and parses each
// complete line into a RawFrame. Lines are terminated by '\r' or '\n'. The
// internal buffer is reused across chunks, so steady-state framing performs no
// per-frame heap allocation. DRY: the tcp-slcan and serial sources share it.
class SlcanFramer {
public:
    explicit SlcanFramer(std::string busName, std::size_t maxLine = 4096)
        : busName_(std::move(busName)), maxLine_(maxLine) {}

    // Feed a received chunk; `publish(RawFrame&&)` is invoked for each frame.
    template <typename Publish>
    void feed(const std::uint8_t* data, std::size_t n, Publish&& publish) {
        for (std::size_t i = 0; i < n; ++i) {
            const char c = static_cast<char>(data[i]);
            if (c == '\r' || c == '\n') {
                if (!buf_.empty()) {
                    if (auto frame = slcan::parse(buf_, busName_)) {
                        publish(std::move(*frame));
                    }
                    buf_.clear();
                }
            } else if (buf_.size() < maxLine_) {
                buf_.push_back(c);
            } else {
                buf_.clear(); // overlong garbage; resync on next terminator
            }
        }
    }

private:
    std::string busName_;
    std::string buf_;
    std::size_t maxLine_;
};

} // namespace engine
