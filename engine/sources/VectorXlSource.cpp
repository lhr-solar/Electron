#include "VectorXlSource.h"

#include "SourceParams.h"
#include "UnavailableSource.h"

// ponytail: Vector interfaces require the Vector XL Driver Library
// (vxlapi.h + vxlapi(64).dll / libvxlapi), Windows-centric and absent from CI.
// Build with -DENGINE_HAVE_VECTOR_XL (and link the XL library) to enable the
// real source below. Until then a clear-error placeholder keeps the
// "vector-xl" type discoverable.
#ifdef ENGINE_HAVE_VECTOR_XL

#include "ThreadedSource.h"
#include "bus/TelemetryBus.h"

#include <vxlapi.h>

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

// config type: "vector-xl"
// params:
//   channel     XL channel index
//   app_name    Vector application name registered in Vector Hardware Config
//   can_bitrate bus bitrate in bps
//   bus         logical bus/channel name tag
class VectorXlSource final : public ThreadedSource {
public:
    explicit VectorXlSource(std::string busName) : busName_(std::move(busName)) {}

protected:
    void run(TelemetryBus& bus) override {
        // ponytail: xlOpenDriver / xlOpenPort / xlActivateChannel here, then poll
        // xlReceive and normalize each XLevent (CAN/CAN-FD) into RawFrame below.
        if (xlOpenDriver() != XL_SUCCESS) {
            throw std::runtime_error("vector-xl: xlOpenDriver failed");
        }
        setConnected(true);
        while (!stopRequested()) {
            XLevent ev{};
            unsigned int count = 1;
            if (xlReceive(portHandle_, &count, &ev) != XL_SUCCESS) continue;
            if (ev.tag != XL_RECEIVE_MSG) continue;
            RawFrame frame;
            frame.ts_ns = nowNs();
            frame.extended = (ev.tagData.msg.id & XL_CAN_EXT_MSG_ID) != 0;
            frame.id = ev.tagData.msg.id & ~XL_CAN_EXT_MSG_ID;
            frame.fd = false;
            frame.dlc = ev.tagData.msg.dlc > 8 ? 8 : ev.tagData.msg.dlc;
            std::memcpy(frame.data.data(), ev.tagData.msg.data, frame.dlc);
            frame.bus = busName_;
            bus.publish(std::move(frame));
        }
        xlClosePort(portHandle_);
        xlCloseDriver();
        setConnected(false);
    }

private:
    XLportHandle portHandle_ = XL_INVALID_PORTHANDLE;
    std::string busName_;
};

} // namespace

void registerVectorXlSource(SourceRegistry& registry) {
    registry.registerType("vector-xl", [](const SourceConfig& cfg) -> std::unique_ptr<ISource> {
        // ponytail: resolve channel/app_name/bitrate from cfg here.
        (void)cfg;
        return std::make_unique<UnavailableSource>(
            "vector-xl: channel/app mapping not wired (provide XL channel + app name)");
    });
}

} // namespace engine

#else // no Vector XL SDK

namespace engine {

void registerVectorXlSource(SourceRegistry& registry) {
    registry.registerType("vector-xl", [](const SourceConfig&) -> std::unique_ptr<ISource> {
        return std::make_unique<UnavailableSource>(
            "vector-xl requires the Vector XL Driver Library (build with -DENGINE_HAVE_VECTOR_XL)");
    });
}

} // namespace engine

#endif
