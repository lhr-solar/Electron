#include "SocketCanSource.h"

#include "SourceParams.h"
#include "UnavailableSource.h"

#ifdef __linux__

#include "ThreadedSource.h"
#include "bus/TelemetryBus.h"

#include <array>
#include <cerrno>
#include <chrono>
#include <cstring>
#include <linux/can.h>
#include <linux/can/raw.h>
#include <net/if.h>
#include <poll.h>
#include <stdexcept>
#include <string>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <unistd.h>

namespace engine {

namespace {

constexpr int kPollTimeoutMs = 200;

std::uint64_t nowNs() {
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::system_clock::now().time_since_epoch())
            .count());
}

struct CanFd {
    int fd = -1;
    ~CanFd() { if (fd >= 0) ::close(fd); }
};

// Linux SocketCAN raw source. config type: "socketcan"
// params:
//   interface (required) CAN netdev, e.g. "can0" / "vcan0"
//   fd        "true" to enable CAN-FD reception (default false)
class SocketCanSource final : public ThreadedSource {
public:
    SocketCanSource(std::string iface, bool fd, std::string busName)
        : iface_(std::move(iface)), fd_(fd), busName_(std::move(busName)) {}

protected:
    void run(TelemetryBus& bus) override {
        CanFd sock;
        sock.fd = ::socket(PF_CAN, SOCK_RAW, CAN_RAW);
        if (sock.fd < 0) throw std::runtime_error(std::string("socketcan socket: ") + std::strerror(errno));

        ifreq ifr{};
        std::strncpy(ifr.ifr_name, iface_.c_str(), IFNAMSIZ - 1);
        if (::ioctl(sock.fd, SIOCGIFINDEX, &ifr) < 0) {
            throw std::runtime_error("socketcan: unknown interface " + iface_);
        }
        sockaddr_can addr{};
        addr.can_family = AF_CAN;
        addr.can_ifindex = ifr.ifr_ifindex;
        if (::bind(sock.fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
            throw std::runtime_error(std::string("socketcan bind: ") + std::strerror(errno));
        }
        if (fd_) {
            int enable = 1;
            ::setsockopt(sock.fd, SOL_CAN_RAW, CAN_RAW_FD_FRAMES, &enable, sizeof(enable));
        }
        setConnected(true);

        canfd_frame raw{}; // canfd_frame is a superset of can_frame
        while (!stopRequested()) {
            pollfd pfd{sock.fd, POLLIN, 0};
            int rc = ::poll(&pfd, 1, kPollTimeoutMs);
            if (rc < 0) {
                if (errno == EINTR) continue;
                throw std::runtime_error(std::string("socketcan poll: ") + std::strerror(errno));
            }
            if (rc == 0) continue;
            ssize_t n = ::read(sock.fd, &raw, sizeof(raw));
            if (n < 0) {
                if (errno == EINTR || errno == EAGAIN) continue;
                throw std::runtime_error(std::string("socketcan read: ") + std::strerror(errno));
            }
            const bool isFd = (n == static_cast<ssize_t>(sizeof(canfd_frame)));
            if (!isFd && n != static_cast<ssize_t>(sizeof(can_frame))) continue;
            publishFrame(bus, raw, isFd);
        }
        setConnected(false);
    }

private:
    void publishFrame(TelemetryBus& bus, const canfd_frame& raw, bool isFd) {
        RawFrame frame;
        frame.ts_ns = nowNs();
        frame.extended = (raw.can_id & CAN_EFF_FLAG) != 0;
        frame.id = raw.can_id & (frame.extended ? CAN_EFF_MASK : CAN_SFF_MASK);
        frame.fd = isFd;
        frame.dlc = raw.len > 64 ? 64 : raw.len;
        std::memcpy(frame.data.data(), raw.data, frame.dlc);
        frame.bus = busName_;
        bus.publish(std::move(frame));
    }

    std::string iface_;
    bool fd_;
    std::string busName_;
};

} // namespace

void registerSocketCanSource(SourceRegistry& registry) {
    registry.registerType("socketcan", [](const SourceConfig& cfg) -> std::unique_ptr<ISource> {
        const std::string iface = paramOr(cfg, "interface", "can0");
        const bool fd = paramBool(cfg, "fd", false);
        const std::string busName = paramOr(cfg, "bus", cfg.name.empty() ? iface : cfg.name);
        return std::make_unique<SocketCanSource>(iface, fd, busName);
    });
}

} // namespace engine

#else // not Linux

namespace engine {

void registerSocketCanSource(SourceRegistry& registry) {
    registry.registerType("socketcan", [](const SourceConfig&) -> std::unique_ptr<ISource> {
        return std::make_unique<UnavailableSource>(
            "socketcan is Linux-only (kernel SocketCAN); not available on this platform");
    });
}

} // namespace engine

#endif
