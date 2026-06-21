#include "TransportSources.h"

#include "CapnpTcpSource.h"
#include "FileSource.h"
#include "PcanSource.h"
#include "SerialSource.h"
#include "SocketCanSource.h"
#include "TcpSlcanSource.h"
#include "VectorXlSource.h"

namespace engine {

void registerTransportSources(SourceRegistry& registry) {
    registerFileSource(registry);
    registerTcpSlcanSource(registry);
    registerCapnpTcpSource(registry);
    registerSerialSource(registry);
    registerSocketCanSource(registry);
    registerPcanSource(registry);
    registerVectorXlSource(registry);
}

} // namespace engine
