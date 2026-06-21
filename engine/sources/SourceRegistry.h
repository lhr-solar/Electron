#pragma once

#include "ISource.h"
#include "config/Config.h"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace engine {

// Type-string -> factory map. Mirrors the v3 dict-dispatch factory
// (server/util/async_parser_factory.py) but as an open registry: each source
// module registers itself, so adding a source touches only that module.
class SourceRegistry {
public:
    using Factory = std::function<std::unique_ptr<ISource>(const SourceConfig&)>;

    static SourceRegistry& instance();

    void registerType(std::string type, Factory factory);

    // Construct the source for cfg.type. Returns nullptr when no factory is
    // registered (e.g. a concrete source still owned by the sources track).
    std::unique_ptr<ISource> create(const SourceConfig& cfg) const;

    std::vector<std::string> registeredTypes() const;

private:
    std::map<std::string, Factory> factories_;
};

// Registers the built-in sources available to the core today. The concrete
// transport sources (tcp-slcan, capnp-tcp, socketcan, ...) are added by the
// engine-sources track and call registerType from their own translation units.
void registerBuiltinSources(SourceRegistry& registry);

} // namespace engine
