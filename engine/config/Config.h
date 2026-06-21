#pragma once

#include <cstddef>
#include <map>
#include <string>
#include <vector>

namespace engine {

// In-memory mirror of engine/config.schema.json. Typed fields cover the stable
// shape; per-type knobs live in `params` (string->string) so adding a new
// source/sink type needs no struct change here — only a registry factory.
// ponytail: params stays string-keyed/string-valued; factories parse what they
// need. Promote a field to a typed member only once it is shared across types.

struct SourceConfig {
    std::string type;                       // discriminator: tcp-slcan, capnp-tcp, ...
    std::string name;                       // optional human label / bus name
    std::map<std::string, std::string> params;
};

struct SinkConfig {
    std::string type;                       // influx | sqlite | file
    std::map<std::string, std::string> params;
};

struct BusConfig {
    std::string type = "inproc";            // inproc (default) | nats
    std::size_t capacity = 4096;            // ring depth for the in-proc bus
    std::map<std::string, std::string> params;
};

struct ApiConfig {
    std::string host = "127.0.0.1";
    int port = 8350;
};

struct ListenerConfig {
    std::string type;                       // server-mode TCP ingest variant
    std::string host = "0.0.0.0";
    int port = 0;
};

struct Config {
    std::string role = "desktop";           // desktop | server
    std::vector<SourceConfig> sources;
    std::vector<SinkConfig> sinks;
    BusConfig bus;
    ApiConfig api;
    std::vector<ListenerConfig> listeners;  // server.listeners[]
};

// Parse + shape-validate against the schema's concepts (role enum, source type
// presence). On failure returns a default-constructed Config and, if `err` is
// non-null, fills it with a human-readable reason. Mirrors v3 server/config.py
// (typed defaults, permissive parse).
Config loadConfigFromString(const std::string& json, std::string* err = nullptr);
Config loadConfigFromFile(const std::string& path, std::string* err = nullptr);

} // namespace engine
