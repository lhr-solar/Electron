#include "EngineHandle.h"

#include "sources/SourceRegistry.h"
#include "sources/TransportSources.h"

#include <chrono>
#include <stdexcept>
#include <utility>

// This facade owns the engine lifecycle and decoded-batch queue; the decode seam
// (Decoder / DecodedMessage / MdcSpec / loadMdcSpecFromString) lives in
// engine/decode/Decoder.h + MdcSpec.h. The binding CMake guards the whole target
// on that header existing, so engine_core stays green if the decode track is not
// yet present.

namespace engine {

namespace {
// Coalesce a burst of frames into one batch to amortize the per-batch handoff
// (lock + notify) without unbounded latency. Tunable; not on a hot inner loop.
constexpr std::size_t kMaxBatch = 256;
} // namespace

EngineHandle::EngineHandle(const std::string& configJson) {
    std::string err;
    config_ = loadConfigFromString(configJson, &err);
    if (!err.empty()) {
        throw std::runtime_error("invalid engine config: " + err);
    }
    auto& registry = SourceRegistry::instance();
    registerBuiltinSources(registry);    // null
    registerTransportSources(registry);  // file, tcp-slcan, capnp-tcp, serial, ...
}

EngineHandle::~EngineHandle() {
    stop();
}

void EngineHandle::start() {
    if (running_.exchange(true)) {
        return; // already running
    }

    bus_ = std::make_unique<InProcBus>(config_.bus.capacity);

    sources_.clear();
    sources_.reserve(config_.sources.size());
    for (const auto& sc : config_.sources) {
        auto source = SourceRegistry::instance().create(sc);
        if (!source) {
            // No factory registered for this type yet (e.g. handled by the
            // engine-sources track). Skip rather than fail the whole engine.
            continue;
        }
        sources_.push_back({sc.name, sc.type, std::move(source)});
    }

    // Worker starts before sources so no published frame is missed.
    worker_ = std::thread([this] { workerLoop(); });
    for (auto& s : sources_) {
        s.source->start(*bus_);
    }
}

void EngineHandle::stop() {
    if (!running_.exchange(false)) {
        return; // already stopped
    }

    for (auto& s : sources_) {
        s.source->stop();
    }
    if (bus_) {
        bus_->close(); // wakes the worker's blocking consume(); it drains + exits
    }
    if (worker_.joinable()) {
        worker_.join();
    }
    // Release any pollBatch waiter now that no more batches will arrive.
    {
        std::lock_guard<std::mutex> lk(outMtx_);
        outCv_.notify_all();
    }
}

void EngineHandle::decodeInto(const std::shared_ptr<Decoder>& decoder,
                              const RawFrame& frame,
                              std::vector<DecodedMessage>& batch) const {
    if (!decoder) {
        return; // no MDC loaded yet — nothing to decode against
    }
    decoder->decode(frame, decodeScratch_);
    if (batch.empty()) {
        batch = std::move(decodeScratch_);
        return;
    }
    batch.insert(batch.end(), std::make_move_iterator(decodeScratch_.begin()),
                 std::make_move_iterator(decodeScratch_.end()));
}

std::shared_ptr<Decoder> EngineHandle::currentDecoder() const {
    std::lock_guard<std::mutex> lk(decoderMtx_);
    return decoder_;
}

void EngineHandle::workerLoop() {
    RawFrame frame;
    std::vector<DecodedMessage> batch;
    batch.reserve(kMaxBatch);
    while (bus_->consume(frame)) {
        batch.clear();

        // Snapshot the decoder once per batch (not per frame), keeping the
        // decoder mutex off the per-frame path.
        auto decoder = currentDecoder();

        decodeInto(decoder, frame, batch);

        RawFrame more;
        while (batch.size() < kMaxBatch && bus_->tryConsume(more)) {
            decodeInto(decoder, more, batch);
        }

        if (!batch.empty()) {
            std::lock_guard<std::mutex> lk(outMtx_);
            outQueue_.push_back(std::move(batch));
            outCv_.notify_one();
        }
    }
}

std::optional<std::vector<DecodedMessage>> EngineHandle::pollBatch(int timeout_ms) {
    std::unique_lock<std::mutex> lk(outMtx_);
    const auto ready = [this] { return !outQueue_.empty() || !running_.load(); };

    if (timeout_ms <= 0) {
        if (!ready()) {
            return std::nullopt; // non-blocking poll, nothing available
        }
    } else if (!outCv_.wait_for(lk, std::chrono::milliseconds(timeout_ms), ready)) {
        return std::nullopt; // timed out with the queue still empty
    }

    if (outQueue_.empty()) {
        return std::nullopt; // woken by stop() with nothing left to drain
    }
    auto batch = std::move(outQueue_.front());
    outQueue_.pop_front();
    return batch;
}

void EngineHandle::loadMdc(const std::string& specJson) {
    std::string err;
    MdcSpec spec = loadMdcSpecFromString(specJson, &err);
    if (!err.empty()) {
        throw std::runtime_error("invalid MDC spec: " + err);
    }
    auto decoder = std::make_shared<Decoder>(std::move(spec));
    std::lock_guard<std::mutex> lk(decoderMtx_);
    decoder_ = std::move(decoder);
}

EngineStatus EngineHandle::status() const {
    EngineStatus st;
    st.running = running_.load();
    st.role = config_.role;
    st.mdc_loaded = currentDecoder() != nullptr;
    st.dropped = bus_ ? bus_->dropped() : 0;
    st.sources.reserve(sources_.size());
    for (const auto& s : sources_) {
        st.sources.push_back({s.name, s.type, s.source->status()});
    }
    return st;
}

} // namespace engine
