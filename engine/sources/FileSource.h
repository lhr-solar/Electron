#pragma once

#include "SourceRegistry.h"

namespace engine {

// Registers the "file" source: replays an slcan text log into the bus.
void registerFileSource(SourceRegistry& registry);

} // namespace engine
