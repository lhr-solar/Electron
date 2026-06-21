#pragma once

#include "SourceRegistry.h"

namespace engine {

// Registers the "tcp-slcan" source: slcan ASCII frames over TCP, as a client
// (connect out) or a server/listener (accept inbound vehicle streams).
void registerTcpSlcanSource(SourceRegistry& registry);

} // namespace engine
