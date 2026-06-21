#pragma once

#include "SourceRegistry.h"

namespace engine {

// Registers the "socketcan" source. Real implementation on Linux (kernel
// SocketCAN, no external SDK); a clear-error placeholder on other platforms.
void registerSocketCanSource(SourceRegistry& registry);

} // namespace engine
