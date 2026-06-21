#include "SerialSource.h"

#include "SourceParams.h"
#include "UnavailableSource.h"

#if defined(__unix__) || defined(__APPLE__)

#include "SlcanFramer.h"
#include "ThreadedSource.h"
#include "bus/TelemetryBus.h"

#include <array>
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <map>
#include <poll.h>
#include <stdexcept>
#include <string>
#include <termios.h>
#include <unistd.h>

namespace engine {

namespace {

constexpr int kPollTimeoutMs = 200;

// slcan bitrate command codes (LAWICEL). Mirrors v3 CAN_BITRATE_CODES.
const std::map<int, std::string>& bitrateCodes() {
    static const std::map<int, std::string> codes = {
        {10000, "S0"}, {20000, "S1"}, {50000, "S2"}, {100000, "S3"}, {125000, "S4"},
        {250000, "S5"}, {500000, "S6"}, {800000, "S7"}, {1000000, "S8"}};
    return codes;
}

speed_t baudConstant(int baud) {
    switch (baud) {
        case 9600: return B9600;
        case 19200: return B19200;
        case 38400: return B38400;
        case 57600: return B57600;
        case 115200: return B115200;
        case 230400: return B230400;
        default: return B0; // unsupported → caller errors out
    }
}

// RAII wrapper for the serial fd.
struct SerialFd {
    int fd = -1;
    ~SerialFd() { if (fd >= 0) ::close(fd); }
};

// slcan over serial. config type: "serial"
// params:
//   port         (required) device path, e.g. /dev/ttyUSB0 or /dev/tty.usbserial
//   baud         serial line speed (default 115200)
//   can_bitrate  if set, send S<code> + O to init the adapter; on stop send C
//   bus          logical bus/channel name tag (default "serial")
class SerialSource final : public ThreadedSource {
public:
    SerialSource(std::string port, int baud, int canBitrate, std::string busName)
        : port_(std::move(port)), baud_(baud), canBitrate_(canBitrate), busName_(std::move(busName)) {}

protected:
    void run(TelemetryBus& bus) override {
        SerialFd dev;
        dev.fd = ::open(port_.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK);
        if (dev.fd < 0) {
            throw std::runtime_error("serial: cannot open " + port_ + ": " + std::strerror(errno));
        }
        configure(dev.fd);
        setConnected(true);

        if (canBitrate_ != 0) initAdapter(dev.fd);

        SlcanFramer framer(busName_);
        std::array<std::uint8_t, 4096> buf{};
        while (!stopRequested()) {
            pollfd pfd{dev.fd, POLLIN, 0};
            int rc = ::poll(&pfd, 1, kPollTimeoutMs);
            if (rc < 0) {
                if (errno == EINTR) continue;
                throw std::runtime_error(std::string("serial poll: ") + std::strerror(errno));
            }
            if (rc == 0) continue;
            ssize_t n = ::read(dev.fd, buf.data(), buf.size());
            if (n < 0) {
                if (errno == EINTR || errno == EAGAIN) continue;
                throw std::runtime_error(std::string("serial read: ") + std::strerror(errno));
            }
            if (n == 0) continue;
            framer.feed(buf.data(), static_cast<std::size_t>(n),
                        [&bus](RawFrame&& f) { bus.publish(std::move(f)); });
        }

        if (canBitrate_ != 0) writeLine(dev.fd, "C"); // close CAN channel
        setConnected(false);
    }

private:
    void configure(int fd) {
        termios tio{};
        if (::tcgetattr(fd, &tio) != 0) {
            throw std::runtime_error(std::string("serial tcgetattr: ") + std::strerror(errno));
        }
        ::cfmakeraw(&tio);
        const speed_t spd = baudConstant(baud_);
        if (spd == B0) throw std::runtime_error("serial: unsupported baud " + std::to_string(baud_));
        ::cfsetispeed(&tio, spd);
        ::cfsetospeed(&tio, spd);
        tio.c_cflag |= (CLOCAL | CREAD);
        tio.c_cc[VMIN] = 0;
        tio.c_cc[VTIME] = 0;
        if (::tcsetattr(fd, TCSANOW, &tio) != 0) {
            throw std::runtime_error(std::string("serial tcsetattr: ") + std::strerror(errno));
        }
    }

    void initAdapter(int fd) {
        auto it = bitrateCodes().find(canBitrate_);
        if (it == bitrateCodes().end()) {
            throw std::runtime_error("serial: unsupported can_bitrate " + std::to_string(canBitrate_));
        }
        writeLine(fd, it->second); // set bitrate
        writeLine(fd, "O");        // open channel
    }

    static void writeLine(int fd, const std::string& cmd) {
        const std::string line = cmd + "\r";
        ::write(fd, line.data(), line.size());
    }

    std::string port_;
    int baud_;
    int canBitrate_;
    std::string busName_;
};

} // namespace

void registerSerialSource(SourceRegistry& registry) {
    registry.registerType("serial", [](const SourceConfig& cfg) -> std::unique_ptr<ISource> {
        const std::string port = paramOr(cfg, "port", "");
        const int baud = paramInt(cfg, "baud", 115200);
        const int canBitrate = paramInt(cfg, "can_bitrate", 0);
        const std::string busName = paramOr(cfg, "bus", cfg.name.empty() ? "serial" : cfg.name);
        return std::make_unique<SerialSource>(port, baud, canBitrate, busName);
    });
}

} // namespace engine

#else // non-POSIX: no termios. Register a clear-error placeholder.

namespace engine {

void registerSerialSource(SourceRegistry& registry) {
    registry.registerType("serial", [](const SourceConfig&) -> std::unique_ptr<ISource> {
        return std::make_unique<UnavailableSource>(
            "serial source requires a POSIX (Linux/macOS) build with termios");
    });
}

} // namespace engine

#endif
