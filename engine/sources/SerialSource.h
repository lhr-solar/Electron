#pragma once

#include "SourceRegistry.h"

namespace engine {

// Registers the "serial" source: slcan frames over a serial port. Optionally
// initializes a CAN adapter (set bitrate + open channel) like the v3
// SerialCanAdapterParser; without can_bitrate it behaves like SerialUartParser.
void registerSerialSource(SourceRegistry& registry);

} // namespace engine
