#pragma once

#include "SourceRegistry.h"

namespace engine {

// Registers every concrete transport source owned by the sources track (file,
// tcp-slcan, capnp-tcp, serial, socketcan, pcan, vector-xl). Call this
// alongside registerBuiltinSources() to make them available via the registry.
// This is the single assembly point — adding a source means adding its .cpp/.h
// and one line here, and nothing else changes.
void registerTransportSources(SourceRegistry& registry);

} // namespace engine
