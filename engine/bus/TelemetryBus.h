#pragma once

#include "RawFrame.h"

namespace engine {

// The single hand-off seam between sources (producers) and sinks/decoder
// (consumers). Sources only ever see this interface; the concrete transport
// (in-process MPSC by default, NATS later) is swappable without touching them.
//
// Contract: implementations must not allocate on publish/consume. The default
// InProcBus pre-sizes its storage so the hot path is allocation-free.
class TelemetryBus {
public:
    virtual ~TelemetryBus() = default;

    // Enqueue a frame. Returns false if the bus is closed or full (the caller
    // owns the drop policy — telemetry generally prefers dropping over blocking).
    virtual bool publish(const RawFrame& frame) = 0;
    virtual bool publish(RawFrame&& frame) = 0;

    // Non-blocking dequeue into `out`. Returns false when empty.
    virtual bool tryConsume(RawFrame& out) = 0;

    // Block until a frame is available or the bus is closed-and-drained.
    // Returns false only once closed and empty.
    virtual bool consume(RawFrame& out) = 0;

    // Wake blocked consumers; subsequent publishes are rejected.
    virtual void close() = 0;
};

} // namespace engine
