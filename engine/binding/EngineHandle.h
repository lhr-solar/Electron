#pragma once

#include "bus/InProcBus.h"
#include "config/Config.h"
#include "decode/Decoder.h"
#include "sources/ISource.h"

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <deque>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace engine {

// Status snapshot for one running source, paired with its config identity so the
// Python status payload can name it. SourceStatus mirrors the v3 parser contract
// (ISource.h), so the dict crosses to Python unchanged.
struct SourceStatusItem {
    std::string name;
    std::string type;
    SourceStatus status;
};

// Aggregate engine status — the C++ side of the API `status()` contract. The
// binding turns this into the dict the Python backend forwards to the UI.
struct EngineStatus {
    bool running = false;
    std::string role;
    bool mdc_loaded = false;
    std::size_t dropped = 0;          // frames the bus dropped (ring full)
    std::vector<SourceStatusItem> sources;
};

// In-process facade the Python `can_engine` module wraps. Deliberately free of
// any nanobind/Python type so it stays unit-testable in pure C++ and the
// compiled module stays small. The binding (bindings.cpp) owns GIL handling and
// dict conversion; this class owns the engine lifecycle and the decoded-batch
// queue.
//
// Pipeline: SourceRegistry builds sources from config -> they publish RawFrames
// onto an InProcBus -> a single worker thread drains the bus, runs the
// MDC-driven Decoder, and pushes decoded batches onto a thread-safe queue that
// pollBatch() consumes.
class EngineHandle {
public:
    // `configJson` is a serialized engine config (see engine/config.schema.json).
    // Shape-validated immediately; throws std::runtime_error on invalid config.
    explicit EngineHandle(const std::string& configJson);
    ~EngineHandle();

    EngineHandle(const EngineHandle&) = delete;
    EngineHandle& operator=(const EngineHandle&) = delete;

    void start();
    void stop();

    // Block up to `timeout_ms` for the next decoded batch. Returns nullopt on
    // timeout or once stopped-and-drained. The caller (binding) releases the GIL
    // around this call so Python threads run while the worker fills the queue.
    std::optional<std::vector<DecodedMessage>> pollBatch(int timeout_ms);

    // Load/replace the MDC project. Builds a new Decoder and swaps it in
    // atomically, so it is safe to call while the worker is decoding.
    void loadMdc(const std::string& specJson);

    EngineStatus status() const;

private:
    void workerLoop();
    void decodeInto(const std::shared_ptr<Decoder>& decoder, const RawFrame& frame,
                    std::vector<DecodedMessage>& batch) const;
    std::shared_ptr<Decoder> currentDecoder() const;

    struct ActiveSource {
        std::string name;
        std::string type;
        std::unique_ptr<ISource> source;
    };

    Config config_;

    std::unique_ptr<InProcBus> bus_;
    std::vector<ActiveSource> sources_;
    std::thread worker_;
    std::atomic<bool> running_{false};

    // Worker decodes through this; loadMdc swaps it. Guarded by its own mutex
    // (read once per BATCH, not per frame — so it never touches the per-frame
    // decode path). libc++ lacks std::atomic<shared_ptr>, hence the mutex.
    std::shared_ptr<Decoder> decoder_;
    mutable std::mutex decoderMtx_;

    std::deque<std::vector<DecodedMessage>> outQueue_;
    mutable std::mutex outMtx_;
    std::condition_variable outCv_;

    // Reused across workerLoop iterations to avoid per-frame vector allocation.
    mutable std::vector<DecodedMessage> decodeScratch_;
};

} // namespace engine
