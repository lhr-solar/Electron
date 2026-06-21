#include "InProcBus.h"

#include <utility>

namespace engine {

InProcBus::InProcBus(std::size_t capacity)
    : slots_(capacity == 0 ? 1 : capacity) {}

template <typename Assign>
bool InProcBus::pushImpl(Assign&& assign) {
    {
        std::lock_guard<std::mutex> lock(mtx_);
        if (closed_) {
            return false;
        }
        if (count_ == slots_.size()) {
            dropped_.fetch_add(1, std::memory_order_relaxed);
            return false; // ponytail: drop-newest when full; no overwrite logic.
        }
        assign(slots_[tail_]);
        tail_ = (tail_ + 1) % slots_.size();
        ++count_;
    }
    cv_.notify_one();
    return true;
}

bool InProcBus::publish(const RawFrame& frame) {
    return pushImpl([&](RawFrame& slot) { slot = frame; });
}

bool InProcBus::publish(RawFrame&& frame) {
    return pushImpl([&](RawFrame& slot) { slot = std::move(frame); });
}

bool InProcBus::tryConsume(RawFrame& out) {
    std::lock_guard<std::mutex> lock(mtx_);
    if (count_ == 0) {
        return false;
    }
    out = std::move(slots_[head_]);
    head_ = (head_ + 1) % slots_.size();
    --count_;
    return true;
}

bool InProcBus::consume(RawFrame& out) {
    std::unique_lock<std::mutex> lock(mtx_);
    cv_.wait(lock, [&] { return count_ > 0 || closed_; });
    if (count_ == 0) {
        return false; // closed and drained
    }
    out = std::move(slots_[head_]);
    head_ = (head_ + 1) % slots_.size();
    --count_;
    return true;
}

void InProcBus::close() {
    {
        std::lock_guard<std::mutex> lock(mtx_);
        closed_ = true;
    }
    cv_.notify_all();
}

} // namespace engine
