#include "CapnpTcpSource.h"

#include "CapnpCanFrame.h"
#include "SourceParams.h"
#include "TcpEndpoint.h"
#include "ThreadedSource.h"
#include "bus/TelemetryBus.h"

#include <cstdint>
#include <string>
#include <vector>

namespace engine {

namespace {

constexpr std::uint32_t kMaxMessageBytes = 4u * 1024 * 1024; // guard corrupt lengths (matches v3)

// Reassembles the v3 length-prefixed Cap'n Proto stream: repeated
// [4-byte big-endian uint32 length N][N-byte CanFrame message]. Decodes each
// complete message to a RawFrame. Buffer is reused across chunks.
class CapnpFramer {
public:
    explicit CapnpFramer(std::string busName) : busName_(std::move(busName)) {}

    template <typename Publish>
    void feed(const std::uint8_t* data, std::size_t n, Publish&& publish) {
        buf_.insert(buf_.end(), data, data + n);
        std::size_t off = 0;
        while (buf_.size() - off >= 4) {
            const std::uint32_t len = (std::uint32_t(buf_[off]) << 24) |
                                      (std::uint32_t(buf_[off + 1]) << 16) |
                                      (std::uint32_t(buf_[off + 2]) << 8) |
                                      std::uint32_t(buf_[off + 3]);
            if (len > kMaxMessageBytes) { // desync — drop everything and resync
                buf_.clear();
                return;
            }
            if (buf_.size() - off - 4 < len) break; // wait for the rest
            if (auto frame = capnp::decode(buf_.data() + off + 4, len, busName_)) {
                publish(std::move(*frame));
            }
            off += 4 + len;
        }
        if (off > 0) buf_.erase(buf_.begin(), buf_.begin() + off);
    }

private:
    std::string busName_;
    std::vector<std::uint8_t> buf_;
};

// config type: "capnp-tcp"
// params:
//   mode  client | server   (default client)
//   host  (client: host; server: bind addr, default 0.0.0.0)
//   port  (required) TCP port
//   bus   logical bus/channel name tag (default "capnp")
class CapnpTcpSource final : public ThreadedSource {
public:
    CapnpTcpSource(bool server, std::string host, int port, std::string busName)
        : server_(server), host_(std::move(host)), port_(port), busName_(std::move(busName)) {}

protected:
    void run(TelemetryBus& bus) override {
        CapnpFramer framer(busName_);
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

void registerCapnpTcpSource(SourceRegistry& registry) {
    registry.registerType("capnp-tcp", [](const SourceConfig& cfg) -> std::unique_ptr<ISource> {
        const bool server = paramOr(cfg, "mode", "client") == "server";
        const std::string host = paramOr(cfg, "host", server ? "0.0.0.0" : "127.0.0.1");
        const int port = paramInt(cfg, "port", 0);
        const std::string busName = paramOr(cfg, "bus", cfg.name.empty() ? "capnp" : cfg.name);
        return std::make_unique<CapnpTcpSource>(server, host, port, busName);
    });
}

} // namespace engine
