#pragma once

#include "TelemetryBus.h"

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <mutex>
#include <vector>

namespace engine {

// Default in-process MPSC bus: a bounded ring buffer of pre-allocated RawFrame
// slots. Many sources publish; the decode pipeline consumes.
//
// ponytail: a std::mutex + condition_variable guards the ring rather than a
// hand-rolled lock-free queue. It is the simplest correct MPSC implementation,
// and the slots are allocated once up front so the per-frame path performs no
// heap allocation (the stated hot-path constraint). Swap in a lock-free queue
// later only if profiling shows the mutex is the bottleneck.
class InProcBus final : public TelemetryBus {
public:
    explicit InProcBus(std::size_t capacity = 4096);

    bool publish(const RawFrame& frame) override;
    bool publish(RawFrame&& frame) override;
    bool tryConsume(RawFrame& out) override;
    bool consume(RawFrame& out) override;
    void close() override;

    // Frames rejected because the ring was full (diagnostics only).
    std::size_t dropped() const noexcept { return dropped_.load(std::memory_order_relaxed); }

private:
    // Shared push body for the copy and move overloads. `assign` writes the
    // incoming frame into the destination slot (copy or move). DRY: one
    // capacity/closed/notify path, two value categories.
    template <typename Assign>
    bool pushImpl(Assign&& assign);

    std::vector<RawFrame> slots_;
    std::size_t head_ = 0;  // next slot to read
    std::size_t tail_ = 0;  // next slot to write
    std::size_t count_ = 0; // live frames in the ring
    bool closed_ = false;

    std::mutex mtx_;
    std::condition_variable cv_;
    std::atomic<std::size_t> dropped_{0};
};

} // namespace engine
