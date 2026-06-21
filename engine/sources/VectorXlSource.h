#pragma once

#include "SourceRegistry.h"

namespace engine {

// Registers the "vector-xl" source for Vector CAN interfaces. Real
// implementation requires the Vector XL Driver Library (build with
// ENGINE_HAVE_VECTOR_XL); otherwise a clear-error placeholder is registered.
void registerVectorXlSource(SourceRegistry& registry);

} // namespace engine
