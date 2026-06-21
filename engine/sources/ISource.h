#pragma once

#include <optional>
#include <string>

namespace engine {

class TelemetryBus;

// Runtime status of a source. Mirrors the v3 parser contract
// (server/parsers/_parser_abc.py :: get_status) one-for-one so the API status
// payload can carry it through unchanged.
struct SourceStatus {
    std::string status = "idle";                 // idle | running | error | finished
    std::optional<bool> connection_state;        // nullopt until known
    std::optional<std::string> error_message;    // set when status == "error"
};

// One adapter per physical/logical CAN input. The engine core owns the bus and
// hands it to start(); the source spins its own thread/loop and publishes
// normalized RawFrames. Mirrors v3 _Parser (run/get_status) but pushes the bus
// in via start() instead of holding a queue from construction.
class ISource {
public:
    virtual ~ISource() = default;

    virtual void start(TelemetryBus& bus) = 0;
    virtual void stop() = 0;
    virtual SourceStatus status() const = 0;
};

} // namespace engine
