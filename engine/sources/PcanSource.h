#pragma once

#include "SourceRegistry.h"

namespace engine {

// Registers the "pcan" source for PEAK PCAN-USB adapters. Real implementation
// requires the PEAK PCAN-Basic SDK (build with ENGINE_HAVE_PCAN); otherwise a
// clear-error placeholder is registered.
void registerPcanSource(SourceRegistry& registry);

} // namespace engine
