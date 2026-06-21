#pragma once

#include "ISource.h"

#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <utility>

namespace engine {

// Shared lifecycle for sources that own a background loop: start() spins one
// thread running run(bus); stop() signals it, lets the subclass unblock its I/O
// via onStop(), then joins. Status access is mutex-guarded so the API/status
// thread can read it concurrently. DRY: every transport source reuses this
// instead of re-implementing thread + status plumbing.
class ThreadedSource : public ISource {
public:
    ~ThreadedSource() override { ThreadedSource::stop(); }

    void start(TelemetryBus& bus) final {
        if (thread_.joinable()) return; // already running
        stopFlag_.store(false, std::memory_order_relaxed);
        setStatus("running");
        thread_ = std::thread([this, &bus] {
            try {
                run(bus);
            } catch (const std::exception& e) {
                setError(e.what());
            } catch (...) {
                setError("unknown source error");
            }
            // run() that returns without an explicit error has finished cleanly.
            std::lock_guard<std::mutex> lk(mtx_);
            if (status_.status == "running") status_.status = "finished";
        });
    }

    void stop() final {
        stopFlag_.store(true, std::memory_order_relaxed);
        onStop();
        if (thread_.joinable()) thread_.join();
        std::lock_guard<std::mutex> lk(mtx_);
        if (status_.status == "running") status_.status = "finished";
    }

    SourceStatus status() const final {
        std::lock_guard<std::mutex> lk(mtx_);
        return status_;
    }

protected:
    // The source loop. Publish RawFrames to `bus`; return when done or when
    // stopRequested() turns true. Throw to report a fatal error.
    virtual void run(TelemetryBus& bus) = 0;

    // Hook to unblock a blocking syscall (close a socket/fd) so stop() can join
    // promptly. Default: nothing (loops that poll the stop flag need no wakeup).
    virtual void onStop() {}

    bool stopRequested() const { return stopFlag_.load(std::memory_order_relaxed); }

    void setStatus(std::string s) {
        std::lock_guard<std::mutex> lk(mtx_);
        status_.status = std::move(s);
        status_.error_message.reset();
    }

    void setConnected(bool connected) {
        std::lock_guard<std::mutex> lk(mtx_);
        status_.connection_state = connected;
    }

    void setError(std::string message) {
        std::lock_guard<std::mutex> lk(mtx_);
        status_.status = "error";
        status_.error_message = std::move(message);
        status_.connection_state = false;
    }

private:
    std::thread thread_;
    std::atomic<bool> stopFlag_{false};
    mutable std::mutex mtx_;
    SourceStatus status_{};
};

} // namespace engine
