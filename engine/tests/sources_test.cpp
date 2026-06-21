// Unit tests for the concrete CAN source adapters: slcan parsing, the Cap'n
// Proto CanFrame codec round-trip, and the "file" replay source driving a real
// TelemetryBus end to end. Pure stdlib; runs as the ctest `sources_test`.
#include "bus/InProcBus.h"
#include "sources/CapnpCanFrame.h"
#include "sources/Slcan.h"
#include "sources/SourceRegistry.h"
#include "sources/TransportSources.h"

#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

namespace {

int g_failures = 0;

#define CHECK(cond)                                                            \
    do {                                                                       \
        if (!(cond)) {                                                         \
            std::cerr << "FAIL " << __FILE__ << ":" << __LINE__ << "  " #cond  \
                      << "\n";                                                 \
            ++g_failures;                                                      \
        }                                                                      \
    } while (0)

void testSlcanStandard() {
    auto f = engine::slcan::parse("t12381122334455667788", "can0");
    CHECK(f.has_value());
    if (!f) return;
    CHECK(f->id == 0x123);
    CHECK(!f->extended);
    CHECK(!f->fd);
    CHECK(f->dlc == 8);
    CHECK(f->data[0] == 0x11 && f->data[7] == 0x88);
    CHECK(f->bus == "can0");
}

void testSlcanExtended() {
    auto f = engine::slcan::parse("T1FFFFFFF2AABB", "veh");
    CHECK(f.has_value());
    if (!f) return;
    CHECK(f->extended);
    CHECK(f->id == 0x1FFFFFFF);
    CHECK(f->dlc == 2);
    CHECK(f->data[0] == 0xAA && f->data[1] == 0xBB);
}

void testSlcanFd() {
    // Standard FD frame, id 0x123, length code 9 → 12 data bytes.
    std::string line = "d1239";
    for (int i = 0; i < 12; ++i) line += "AB";
    auto f = engine::slcan::parse(line, "fd0");
    CHECK(f.has_value());
    if (!f) return;
    CHECK(f->fd);
    CHECK(f->dlc == 12);
    CHECK(f->data[11] == 0xAB);
}

void testSlcanRoundTrip() {
    engine::RawFrame in;
    in.id = 0x7E8;
    in.extended = false;
    in.fd = false;
    in.dlc = 3;
    in.data[0] = 0xDE; in.data[1] = 0xAD; in.data[2] = 0xBE;
    const std::string line = engine::slcan::encode(in);
    auto out = engine::slcan::parse(line, "b");
    CHECK(out.has_value());
    if (!out) return;
    CHECK(out->id == in.id && out->dlc == in.dlc);
    CHECK(out->data[0] == 0xDE && out->data[2] == 0xBE);
}

void testCapnpRoundTrip() {
    engine::RawFrame in;
    in.id = 0x18FF50E5;
    in.extended = true;
    in.dlc = 8;
    for (int i = 0; i < 8; ++i) in.data[i] = static_cast<std::uint8_t>(0x10 + i);
    const auto bytes = engine::capnp::encode(in);
    auto out = engine::capnp::decode(bytes.data(), bytes.size(), "capnp0");
    CHECK(out.has_value());
    if (!out) return;
    CHECK(out->id == in.id);
    CHECK(out->extended == in.extended);
    CHECK(out->dlc == in.dlc);
    for (int i = 0; i < 8; ++i) CHECK(out->data[i] == in.data[i]);
    CHECK(out->bus == "capnp0");
}

void testFileReplayIntoBus() {
    namespace fs = std::filesystem;
    const fs::path path = fs::temp_directory_path() / "engine_file_source_test.slcan";
    {
        std::ofstream f(path);
        f << "t10021122\n";                 // standard id=0x100 dlc=2 -> 11 22
        f << "T00ABCDEF1FF\n";              // extended id=0x00ABCDEF dlc=1 -> FF
        f << "t3F38AABBCCDDEEFF0011\n";     // standard id=0x3F3 dlc=8
    }

    engine::SourceRegistry registry;
    engine::registerTransportSources(registry);

    engine::SourceConfig cfg;
    cfg.type = "file";
    cfg.name = "replay";
    cfg.params["path"] = path.string();
    cfg.params["bus"] = "replay0";

    auto source = registry.create(cfg);
    CHECK(source != nullptr);
    if (!source) return;

    engine::InProcBus bus(64);
    source->start(bus);

    std::vector<engine::RawFrame> got;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    while (got.size() < 3 && std::chrono::steady_clock::now() < deadline) {
        engine::RawFrame out;
        if (bus.tryConsume(out)) {
            got.push_back(out);
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        }
    }
    source->stop();

    CHECK(got.size() == 3);
    if (got.size() == 3) {
        CHECK(got[0].id == 0x100 && got[0].dlc == 2 && got[0].bus == "replay0");
        CHECK(got[0].data[0] == 0x11 && got[0].data[1] == 0x22);
        CHECK(got[1].extended && got[1].id == 0x0ABCDEF && got[1].dlc == 1);
        CHECK(got[1].data[0] == 0xFF);
        CHECK(got[2].id == 0x3F3 && got[2].dlc == 8 && got[2].data[7] == 0x11);
    }

    std::error_code ec;
    fs::remove(path, ec);
}

void testRegisteredTypes() {
    engine::SourceRegistry registry;
    engine::registerTransportSources(registry);
    const auto types = registry.registeredTypes();
    for (const char* expected : {"file", "tcp-slcan", "capnp-tcp", "serial",
                                 "socketcan", "pcan", "vector-xl"}) {
        bool found = false;
        for (const auto& t : types) if (t == expected) found = true;
        CHECK(found);
    }
}

} // namespace

int main() {
    testSlcanStandard();
    testSlcanExtended();
    testSlcanFd();
    testSlcanRoundTrip();
    testCapnpRoundTrip();
    testFileReplayIntoBus();
    testRegisteredTypes();

    if (g_failures == 0) {
        std::cout << "sources_test: OK\n";
        return 0;
    }
    std::cerr << "sources_test: " << g_failures << " failure(s)\n";
    return 1;
}
