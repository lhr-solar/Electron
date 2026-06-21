#pragma once

#include "SourceRegistry.h"

namespace engine {

// Registers the "capnp-tcp" source: length-prefixed Cap'n Proto CanFrame
// messages over TCP, as a client (connect out) or server/listener (accept
// inbound vehicle streams). Wire format mirrors the v3 CapnpTcpParser.
void registerCapnpTcpSource(SourceRegistry& registry);

} // namespace engine
