#include "Config.h"

#include <fstream>
#include <nlohmann/json.hpp>
#include <sstream>

namespace engine {

namespace {

std::string readFile(const std::string& path, std::string* err) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        if (err) *err = "cannot open config file: " + path;
        return {};
    }
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

} // namespace

Config loadConfigFromFile(const std::string& path, std::string* err) {
    std::string body = readFile(path, err);
    if (err && !err->empty()) {
        return Config{};
    }
    return loadConfigFromString(body, err);
}

} // namespace engine

namespace engine {

namespace {

using nlohmann::json;

// Collect a typed `params` map from arbitrary leftover JSON members so source
// factories can read per-type knobs without growing the typed structs.
std::map<std::string, std::string> collectParams(const json& obj,
                                                 std::initializer_list<const char*> consumed) {
    std::map<std::string, std::string> params;
    for (auto it = obj.begin(); it != obj.end(); ++it) {
        bool skip = false;
        for (const char* key : consumed) {
            if (it.key() == key) { skip = true; break; }
        }
        if (skip) continue;
        const json& v = it.value();
        params[it.key()] = v.is_string() ? v.get<std::string>() : v.dump();
    }
    return params;
}

} // namespace

Config loadConfigFromString(const std::string& body, std::string* err) {
    Config cfg;
    json root = json::parse(body, nullptr, /*allow_exceptions=*/false);
    if (root.is_discarded() || !root.is_object()) {
        if (err) *err = "config is not a valid JSON object";
        return Config{};
    }

    cfg.role = root.value("role", cfg.role);
    if (cfg.role != "desktop" && cfg.role != "server") {
        if (err) *err = "role must be \"desktop\" or \"server\"";
        return Config{};
    }

    if (root.contains("sources") && root["sources"].is_array()) {
        for (const auto& s : root["sources"]) {
            if (!s.is_object() || !s.contains("type") || !s["type"].is_string()) {
                if (err) *err = "each source requires a string \"type\"";
                return Config{};
            }
            SourceConfig sc;
            sc.type = s["type"].get<std::string>();
            sc.name = s.value("name", std::string{});
            sc.params = collectParams(s, {"type", "name"});
            cfg.sources.push_back(std::move(sc));
        }
    }

    if (root.contains("sinks") && root["sinks"].is_array()) {
        for (const auto& s : root["sinks"]) {
            if (!s.is_object() || !s.contains("type") || !s["type"].is_string()) {
                if (err) *err = "each sink requires a string \"type\"";
                return Config{};
            }
            SinkConfig sk;
            sk.type = s["type"].get<std::string>();
            sk.params = collectParams(s, {"type"});
            cfg.sinks.push_back(std::move(sk));
        }
    }

    if (root.contains("bus") && root["bus"].is_object()) {
        const json& b = root["bus"];
        cfg.bus.type = b.value("type", cfg.bus.type);
        cfg.bus.capacity = b.value("capacity", cfg.bus.capacity);
        cfg.bus.params = collectParams(b, {"type", "capacity"});
    }

    if (root.contains("api") && root["api"].is_object()) {
        const json& a = root["api"];
        cfg.api.host = a.value("host", cfg.api.host);
        cfg.api.port = a.value("port", cfg.api.port);
    }

    if (root.contains("server") && root["server"].is_object() &&
        root["server"].contains("listeners") && root["server"]["listeners"].is_array()) {
        for (const auto& l : root["server"]["listeners"]) {
            if (!l.is_object()) continue;
            ListenerConfig lc;
            lc.type = l.value("type", std::string{});
            lc.host = l.value("host", lc.host);
            lc.port = l.value("port", lc.port);
            cfg.listeners.push_back(std::move(lc));
        }
    }

    return cfg;
}

} // namespace engine
