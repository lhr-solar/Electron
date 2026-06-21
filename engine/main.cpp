#include "bus/InProcBus.h"
#include "sources/SourceRegistry.h"

#include <cstring>
#include <iostream>

namespace {

// Smoke check for the engine-core seams: publish a frame through the bus and
// read it back, then construct + drive a source via the registry. Returns 0 on
// success. This is the runnable check the build wires up as ctest `selftest`.
int runSelfTest() {
    using namespace engine;

    InProcBus bus(8);

    RawFrame in;
    in.ts_ns = 1234567890;
    in.id = 0x7E8;
    in.extended = false;
    in.fd = true;
    in.dlc = 3;
    in.data[0] = 0xDE;
    in.data[1] = 0xAD;
    in.data[2] = 0xBE;
    in.bus = "can0";

    if (!bus.publish(in)) {
        std::cerr << "selftest: publish failed\n";
        return 1;
    }

    RawFrame out;
    if (!bus.tryConsume(out)) {
        std::cerr << "selftest: consume returned empty\n";
        return 1;
    }
    if (out.ts_ns != in.ts_ns || out.id != in.id || out.fd != in.fd ||
        out.dlc != in.dlc || out.bus != in.bus || out.data[0] != 0xDE ||
        out.data[1] != 0xAD || out.data[2] != 0xBE) {
        std::cerr << "selftest: frame roundtrip mismatch\n";
        return 1;
    }
    if (bus.tryConsume(out)) {
        std::cerr << "selftest: bus should be empty after one consume\n";
        return 1;
    }

    SourceRegistry registry;
    registerBuiltinSources(registry);
    SourceConfig cfg;
    cfg.type = "null";
    cfg.name = "selftest";
    auto source = registry.create(cfg);
    if (!source) {
        std::cerr << "selftest: registry could not create 'null' source\n";
        return 1;
    }
    source->start(bus);
    if (source->status().status != "running") {
        std::cerr << "selftest: source did not report running\n";
        return 1;
    }
    source->stop();

    std::cout << "selftest: OK (bus roundtrip + registry source)\n";
    return 0;
}

} // namespace

int main(int argc, char** argv) {
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--selftest") == 0) {
            return runSelfTest();
        }
    }
    std::cerr << "usage: engine_app --selftest\n";
    return 1;
}
