#pragma once

#include "ISource.h"

#include <string>
#include <utility>

namespace engine {

// Placeholder returned by vendor/platform source factories when the required
// SDK or OS is not present in this build (PEAK PCAN, Vector XL, non-Linux
// SocketCAN). It registers and constructs like any source, but start() reports
// a clear error explaining what is missing — so the type stays discoverable via
// SourceRegistry::registeredTypes() and the failure surfaces through status().
class UnavailableSource final : public ISource {
public:
    explicit UnavailableSource(std::string reason) : reason_(std::move(reason)) {}

    void start(TelemetryBus&) override {
        status_.status = "error";
        status_.connection_state = false;
        status_.error_message = reason_;
    }
    void stop() override {}
    SourceStatus status() const override { return status_; }

private:
    std::string reason_;
    SourceStatus status_{};
};

} // namespace engine
