#include "SourceRegistry.h"

namespace engine {

namespace {

// Minimal built-in source: accepts a bus and reports running, but publishes
// nothing. It keeps the registry + config wiring exercisable (and the selftest
// honest) until the real transport sources land. ponytail: no thread, no I/O.
class NullSource final : public ISource {
public:
    explicit NullSource(std::string name) : name_(std::move(name)) {}

    void start(TelemetryBus&) override { status_.status = "running"; }
    void stop() override { status_.status = "finished"; }
    SourceStatus status() const override { return status_; }

private:
    std::string name_;
    SourceStatus status_{};
};

} // namespace

SourceRegistry& SourceRegistry::instance() {
    static SourceRegistry registry;
    return registry;
}

void SourceRegistry::registerType(std::string type, Factory factory) {
    factories_[std::move(type)] = std::move(factory);
}

std::unique_ptr<ISource> SourceRegistry::create(const SourceConfig& cfg) const {
    auto it = factories_.find(cfg.type);
    if (it == factories_.end()) {
        return nullptr;
    }
    return it->second(cfg);
}

std::vector<std::string> SourceRegistry::registeredTypes() const {
    std::vector<std::string> types;
    types.reserve(factories_.size());
    for (const auto& [type, _] : factories_) {
        types.push_back(type);
    }
    return types;
}

void registerBuiltinSources(SourceRegistry& registry) {
    registry.registerType("null", [](const SourceConfig& cfg) {
        return std::make_unique<NullSource>(cfg.name);
    });
}

} // namespace engine
