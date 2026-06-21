#include "TcpSlcanSource.h"

#include "SlcanFramer.h"
#include "SourceParams.h"
#include "TcpEndpoint.h"
#include "ThreadedSource.h"
#include "bus/TelemetryBus.h"

#include <string>

namespace engine {

namespace {

// slcan ASCII frames over TCP. Two roles share one read/parse path:
//   mode=client (default) — connect out to a CAN gateway (mirrors v3 TCPParser)
//   mode=server           — bind + accept inbound vehicle streams (new ingest)
//
// config type: "tcp-slcan"
// params:
//   mode  client | server   (default client)
//   host  (client: gateway host; server: bind addr, default 0.0.0.0)
//   port  (required) TCP port
//   bus   logical bus/channel name tag (default "tcp")
class TcpSlcanSource final : public ThreadedSource {
public:
    TcpSlcanSource(bool server, std::string host, int port, std::string busName)
        : server_(server), host_(std::move(host)), port_(port), busName_(std::move(busName)) {}

protected:
    void run(TelemetryBus& bus) override {
        SlcanFramer framer(busName_);
        net::Callbacks cb;
        cb.shouldStop = [this] { return stopRequested(); };
        cb.onConnection = [this](bool c) { setConnected(c); };
        cb.onError = [this](const std::string& e) { setError(e); };
        cb.onBytes = [&](const std::uint8_t* data, std::size_t n) {
            framer.feed(data, n, [&bus](RawFrame&& f) { bus.publish(std::move(f)); });
        };
        if (server_) net::runServer(host_, port_, cb);
        else net::runClient(host_, port_, cb);
    }

private:
    bool server_;
    std::string host_;
    int port_;
    std::string busName_;
};

} // namespace

void registerTcpSlcanSource(SourceRegistry& registry) {
    registry.registerType("tcp-slcan", [](const SourceConfig& cfg) -> std::unique_ptr<ISource> {
        const bool server = paramOr(cfg, "mode", "client") == "server";
        const std::string host = paramOr(cfg, "host", server ? "0.0.0.0" : "127.0.0.1");
        const int port = paramInt(cfg, "port", 0);
        const std::string busName = paramOr(cfg, "bus", cfg.name.empty() ? "tcp" : cfg.name);
        return std::make_unique<TcpSlcanSource>(server, host, port, busName);
    });
}

} // namespace engine
