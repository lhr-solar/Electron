#pragma once

#include "config/Config.h"

#include <string>

namespace engine {

// Tiny typed accessors over SourceConfig::params (string->string). Sources read
// per-type knobs through these instead of re-implementing lookups + parsing.
inline std::string paramOr(const SourceConfig& cfg, const char* key, std::string fallback) {
    auto it = cfg.params.find(key);
    return it == cfg.params.end() ? std::move(fallback) : it->second;
}

inline int paramInt(const SourceConfig& cfg, const char* key, int fallback) {
    auto it = cfg.params.find(key);
    if (it == cfg.params.end()) return fallback;
    try { return std::stoi(it->second); } catch (...) { return fallback; }
}

inline bool paramBool(const SourceConfig& cfg, const char* key, bool fallback) {
    auto it = cfg.params.find(key);
    if (it == cfg.params.end()) return fallback;
    return it->second == "true" || it->second == "1";
}

} // namespace engine
