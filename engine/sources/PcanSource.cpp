#include "PcanSource.h"

#include "SourceParams.h"
#include "UnavailableSource.h"

// ponytail: the PEAK adapter is vendor hardware whose driver SDK
// (PCAN-Basic: PCANBasic.h + libpcanbasic) is not present in CI. Build with
//   -DENGINE_HAVE_PCAN  (and link the PCAN-Basic library)
// to enable the real source below. Until then a clear-error placeholder keeps
// the "pcan" type discoverable. Mirrors v3 server/parsers/pcan_parser.py.
#ifdef ENGINE_HAVE_PCAN

#include "ThreadedSource.h"
#include "bus/TelemetryBus.h"

#include <PCANBasic.h>

#include <chrono>
#include <cstring>
#include <stdexcept>
#include <string>

namespace engine {

namespace {

std::uint64_t nowNs() {
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::system_clock::now().time_since_epoch())
            .count());
}

// config type: "pcan"
// params:
//   channel     PCAN channel handle name (e.g. "PCAN_USBBUS1")
//   can_bitrate bus bitrate in bps (e.g. 500000)
//   bus         logical bus/channel name tag (default = channel)
class PcanSource final : public ThreadedSource {
public:
    PcanSource(TPCANHandle channel, TPCANBaudrate baud, std::string busName)
        : channel_(channel), baud_(baud), busName_(std::move(busName)) {}

protected:
    void run(TelemetryBus& bus) override {
        // ponytail: SDK init/teardown. Fill in channel resolution + bitrate map
        // when wiring real PEAK hardware; the read loop normalizes into RawFrame.
        if (CAN_Initialize(channel_, baud_, 0, 0, 0) != PCAN_ERROR_OK) {
            throw std::runtime_error("pcan: CAN_Initialize failed");
        }
        setConnected(true);
        TPCANMsg msg{};
        TPCANTimestamp ts{};
        while (!stopRequested()) {
            TPCANStatus st = CAN_Read(channel_, &msg, &ts);
            if (st == PCAN_ERROR_QRCVEMPTY) { continue; }
            if (st != PCAN_ERROR_OK) { continue; }
            RawFrame frame;
            frame.ts_ns = nowNs();
            frame.extended = (msg.MSGTYPE & PCAN_MESSAGE_EXTENDED) != 0;
            frame.id = msg.ID;
            frame.fd = false;
            frame.dlc = msg.LEN > 8 ? 8 : msg.LEN;
            std::memcpy(frame.data.data(), msg.DATA, frame.dlc);
            frame.bus = busName_;
            bus.publish(std::move(frame));
        }
        CAN_Uninitialize(channel_);
        setConnected(false);
    }

private:
    TPCANHandle channel_;
    TPCANBaudrate baud_;
    std::string busName_;
};

} // namespace

void registerPcanSource(SourceRegistry& registry) {
    registry.registerType("pcan", [](const SourceConfig& cfg) -> std::unique_ptr<ISource> {
        // ponytail: map cfg "channel"/"can_bitrate" strings to TPCANHandle /
        // TPCANBaudrate here once the SDK is linked.
        (void)cfg;
        return std::make_unique<UnavailableSource>(
            "pcan: channel/bitrate mapping not wired (provide TPCANHandle + TPCANBaudrate)");
    });
}

} // namespace engine

#else // no PEAK SDK

namespace engine {

void registerPcanSource(SourceRegistry& registry) {
    registry.registerType("pcan", [](const SourceConfig&) -> std::unique_ptr<ISource> {
        return std::make_unique<UnavailableSource>(
            "pcan requires the PEAK PCAN-Basic SDK (build with -DENGINE_HAVE_PCAN and link PCAN-Basic)");
    });
}

} // namespace engine

#endif
