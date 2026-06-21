// Unit tests for the MDC-driven decoder. Two layers:
//   1. Low-level bit/conversion/expr units (no spec).
//   2. End-to-end decode assertions run against BOTH a hand-built MdcSpec and
//      the real Embedded-Sharepoint/can/mdc/examples/lhr-ev1 v3 file. The two specs
//      describe the same layouts, so one assertion set covers both — proving the
//      JSON loader and the programmatic model agree.
//
// Frames are crafted with known bits; we assert physical values, an enum/choice,
// a value-table label, a multiplexed signal's presence/absence, an array frame's
// array_index, and a computed signal.

#include "BitExtract.h"
#include "Decoder.h"
#include "Expr.h"
#include "MdcSpec.h"
#include "bus/RawFrame.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>

namespace {

int g_failures = 0;

void check(bool cond, const std::string& what) {
    if (!cond) {
        std::printf("  FAIL: %s\n", what.c_str());
        ++g_failures;
    }
}

void checkNear(double got, double want, const std::string& what, double eps = 1e-6) {
    if (std::abs(got - want) > eps) {
        std::printf("  FAIL: %s (got %.6f, want %.6f)\n", what.c_str(), got, want);
        ++g_failures;
    }
}

using engine::DecodedMessage;
using engine::SignalValue;

const DecodedMessage* findMsg(const std::vector<DecodedMessage>& msgs, const std::string& name) {
    for (const auto& m : msgs)
        if (m.message_name && *m.message_name == name) return &m;
    return nullptr;
}

bool hasSig(const DecodedMessage& m, const std::string& n) {
    for (const auto& [name, _] : m.signals)
        if (name == n) return true;
    return false;
}

const SignalValue* findSig(const DecodedMessage& m, const std::string& n) {
    for (const auto& [name, value] : m.signals)
        if (name == n) return &value;
    return nullptr;
}

double num(const DecodedMessage& m, const std::string& n) {
    const SignalValue* v = findSig(m, n);
    if (!v || !std::holds_alternative<double>(*v)) return std::nan("");
    return std::get<double>(*v);
}

std::string str(const DecodedMessage& m, const std::string& n) {
    const SignalValue* v = findSig(m, n);
    if (!v || !std::holds_alternative<std::string>(*v)) return "";
    return std::get<std::string>(*v);
}

engine::RawFrame frame(std::uint32_t id, const std::string& bus, bool fd,
                       std::initializer_list<std::uint8_t> bytes) {
    engine::RawFrame f;
    f.ts_ns = 42;
    f.id = id;
    f.fd = fd;
    f.bus = bus;
    std::size_t idx = 0;
    for (std::uint8_t b : bytes) f.data[idx++] = b;
    f.dlc = static_cast<std::uint8_t>(idx);
    return f;
}

// --- Layer 1: bit extraction / conversion / expression --------------------

void testBitExtraction() {
    using namespace engine::decode;
    std::uint8_t d[8] = {0x8C, 0x9B, 0xCE, 0xFF, 0x64, 0x00, 0x00, 0x00};

    // little-endian unsigned 16-bit at bit 0 = 0x9B8C.
    check(extractLittleEndian(d, 8, 0, 16) == 0x9B8C, "LE u16 @0");
    // little-endian signed 16-bit at bit 16 = 0xFFCE -> -50.
    check(signExtend(extractLittleEndian(d, 8, 16, 16), 16) == -50, "LE s16 @16 sign");

    // big-endian (Motorola sawtooth): 16-bit field with MSB at startBit 7 reads
    // byte0 then byte1, big-endian order -> 0x8C9B.
    check(extractBigEndian(d, 8, 7, 16) == 0x8C9B, "BE u16 @7");
    // 4-bit BE field starting at the MSB of byte0 = high nibble of 0x8C = 0x8.
    check(extractBigEndian(d, 8, 7, 4) == 0x8, "BE u4 @7");

    // float32 round-trip: 1.0f bits = 0x3F800000.
    checkNear(rawToFloat(0x3F800000u, 32), 1.0, "f32 1.0");
    // float16 round-trip: 1.0 half = 0x3C00.
    checkNear(rawToFloat(0x3C00u, 16), 1.0, "f16 1.0");
}

void testExpr() {
    using namespace engine::decode;
    // slots: a=2 (0), b=3 (1)
    auto resolve = [](std::string_view id) -> int {
        if (id == "a") return 0;
        if (id == "b") return 1;
        return -1;
    };
    double slots[2] = {2.0, 3.0};
    checkNear(evalExpr(compileExpr("a * b + 1", resolve), slots), 7.0, "expr a*b+1");
    checkNear(evalExpr(compileExpr("-a * (b - 1)", resolve), slots), -4.0, "expr unary/paren");
    check(!compileExpr("a + nope", resolve).ok, "expr rejects unknown id");
    check(std::isnan(evalExpr(compileExpr("a / 0", resolve), slots)), "expr div by zero -> NaN");
}

// --- Layer 2: a programmatic spec mirroring lhr-ev1 ------------------------

engine::SignalDef sig(std::string name, std::uint32_t start, std::uint32_t len,
                      engine::SignalKind kind, engine::Conversion conv, std::string unit = "") {
    engine::SignalDef s;
    s.name = std::move(name);
    s.start = start;
    s.length = len;
    s.kind = kind;
    s.conversion = std::move(conv);
    s.unit = std::move(unit);
    return s;
}

engine::Conversion linear(double f, double o) {
    engine::Conversion c;
    c.kind = engine::ConversionKind::Linear;
    c.factor = f;
    c.offset = o;
    return c;
}
engine::Conversion identity() { return {}; }
engine::Conversion table() {
    engine::Conversion c;
    c.kind = engine::ConversionKind::Table;
    return c;
}

engine::MdcSpec buildSpec() {
    using namespace engine;
    MdcSpec spec;
    spec.projectName = "test";
    spec.valueTables.push_back({"OnOff", {{0, "Off"}, {1, "On"}}});

    NetworkDef pt;
    pt.id = "powertrain";
    pt.valueTables.push_back(
        {"PackState", {{0, "Idle"}, {1, "Precharge"}, {2, "Closed"}, {3, "Fault"}}});

    // BMS_Status (id 256, FD, len 16)
    {
        MessageDef m;
        m.name = "BMS_Status";
        m.frame_id = 256;
        m.is_fd = true;
        m.length = 16;
        m.senders = {"BMS"};
        m.signals.push_back(sig("PackVoltage", 0, 16, SignalKind::Unsigned, linear(0.01, 0), "V"));
        m.signals.push_back(sig("PackCurrent", 16, 16, SignalKind::Signed, linear(0.1, 0), "A"));
        m.signals.push_back(sig("SOC", 32, 8, SignalKind::Unsigned, linear(0.5, 0), "%"));
        m.signals.push_back(sig("TempMax", 40, 8, SignalKind::Unsigned, linear(1, -40), "degC"));
        SignalDef ps = sig("PackState", 48, 4, SignalKind::Unsigned, table());
        ps.valueTableRef = "PackState";
        m.signals.push_back(ps);
        SignalDef ce = sig("ChargeEnabled", 52, 1, SignalKind::Unsigned, table());
        ce.valueTableRef = "OnOff";
        m.signals.push_back(ce);
        pt.messages.push_back(std::move(m));
    }
    // network-scope computed: both operands live in BMS_Status.
    pt.computed.push_back(
        {"DrivePower", "BMS_Status.PackVoltage * BMS_Status.PackCurrent", "W", SignalKind::Float});

    // MCU_Drive (id 512, FD, len 8) with rational + inline choices + computed.
    {
        MessageDef m;
        m.name = "MCU_Drive";
        m.frame_id = 512;
        m.is_fd = true;
        m.length = 8;
        m.senders = {"MCU"};
        m.signals.push_back(sig("MotorRPM", 0, 16, SignalKind::Signed, linear(1, 0), "rpm"));
        m.signals.push_back(sig("MotorTemp", 16, 8, SignalKind::Unsigned, linear(1, -40), "degC"));
        SignalDef is = sig("InverterState", 24, 4, SignalKind::Unsigned, table());
        is.choices = {{0, "Standby"}, {1, "Ready"}, {2, "Drive"}, {3, "Fault"}};
        m.signals.push_back(is);
        Conversion rat;
        rat.kind = ConversionKind::Rational;
        rat.numerator = {1, 0};
        rat.denominator = {10};  // rational: (1*raw + 0) / 10
        m.signals.push_back(sig("Torque", 32, 16, SignalKind::Signed, rat, "Nm"));
        m.computed.push_back(
            {"MechPower", "Torque * MotorRPM * 0.10472", "W", SignalKind::Float});
        pt.messages.push_back(std::move(m));
    }

    // BMS_CellArray (id 257, FD, len 8): multiplexor index + array block.
    {
        MessageDef m;
        m.name = "BMS_CellArray";
        m.frame_id = 257;
        m.is_fd = true;
        m.length = 8;
        m.senders = {"BMS"};
        m.multiplexorSignal = "CellIndex";
        m.array.present = true;
        m.array.indexSignal = "CellIndex";
        m.array.size = 96;
        m.array.elementSignals = {"CellVoltage", "CellTemp"};
        SignalDef ci = sig("CellIndex", 0, 8, SignalKind::Unsigned, identity());
        ci.role = MultiplexRole::Multiplexor;
        m.signals.push_back(ci);
        m.signals.push_back(
            sig("CellVoltage", 8, 16, SignalKind::Unsigned, linear(0.0001, 0), "V"));
        m.signals.push_back(sig("CellTemp", 24, 8, SignalKind::Unsigned, linear(1, -40), "degC"));
        pt.messages.push_back(std::move(m));
    }

    NetworkDef ch;
    ch.id = "chassis";
    // Diagnostics (id 1536): multiplexed AuxVoltage(0) / FaultCode(1).
    {
        MessageDef m;
        m.name = "Diagnostics";
        m.frame_id = 1536;
        m.length = 8;
        m.transport = "isotp";
        m.senders = {"VCU"};
        m.multiplexorSignal = "DiagMux";
        SignalDef dm = sig("DiagMux", 0, 8, SignalKind::Unsigned, identity());
        dm.role = MultiplexRole::Multiplexor;
        m.signals.push_back(dm);
        SignalDef av = sig("AuxVoltage", 8, 16, SignalKind::Unsigned, linear(0.001, 0), "V");
        av.role = MultiplexRole::Multiplexed;
        av.muxIds = {0};
        m.signals.push_back(av);
        SignalDef fc = sig("FaultCode", 8, 16, SignalKind::Unsigned, table());
        fc.role = MultiplexRole::Multiplexed;
        fc.muxIds = {1};
        fc.choices = {{0, "None"}, {256, "EPS_Timeout"}, {257, "ABS_SensorFault"}};
        m.signals.push_back(fc);
        ch.messages.push_back(std::move(m));
    }

    VehicleDef v;
    v.id = "lhr_ev1";
    v.networks.push_back(std::move(pt));
    v.networks.push_back(std::move(ch));
    spec.vehicles.push_back(std::move(v));
    return spec;
}

// Shared assertions; run against any Decoder built from an lhr-ev1-shaped spec.
void runDecoderAssertions(const engine::Decoder& d, const char* label) {
    std::printf("decoder assertions (%s):\n", label);

    // BMS_Status: PackVoltage=398.2, PackCurrent=-5.0, SOC=50, TempMax=25,
    // PackState=Closed, ChargeEnabled=On, DrivePower=-1991.
    {
        auto out = d.decode(frame(256, "powertrain", true,
                                  {0x8C, 0x9B, 0xCE, 0xFF, 0x64, 0x41, 0x12, 0x00,
                                   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}));
        const auto* m = findMsg(out, "BMS_Status");
        check(m != nullptr, "BMS_Status decoded");
        if (m) {
            check(m->vehicle == "lhr_ev1" && m->network == "powertrain", "BMS_Status namespacing");
            check(m->sender == "BMS", "BMS_Status sender");
            check(m->units.at("PackVoltage") == "V", "PackVoltage unit");
            checkNear(num(*m, "PackVoltage"), 398.2, "PackVoltage");
            checkNear(num(*m, "PackCurrent"), -5.0, "PackCurrent (signed)");
            checkNear(num(*m, "SOC"), 50.0, "SOC");
            checkNear(num(*m, "TempMax"), 25.0, "TempMax (offset)");
            check(str(*m, "PackState") == "Closed", "PackState value-table label");
            check(str(*m, "ChargeEnabled") == "On", "ChargeEnabled project-table label");
            checkNear(num(*m, "DrivePower"), -1991.0, "DrivePower (network computed)");
        }
    }

    // MCU_Drive: Torque=123.4 (rational), MechPower computed, InverterState choice.
    {
        auto out = d.decode(frame(512, "powertrain", true,
                                  {0xE8, 0x03, 0x64, 0x02, 0xD2, 0x04, 0x00, 0x00}));
        const auto* m = findMsg(out, "MCU_Drive");
        check(m != nullptr, "MCU_Drive decoded");
        if (m) {
            checkNear(num(*m, "MotorRPM"), 1000.0, "MotorRPM");
            check(str(*m, "InverterState") == "Drive", "InverterState inline choice");
            checkNear(num(*m, "Torque"), 123.4, "Torque (rational)");
            checkNear(num(*m, "MechPower"), 123.4 * 1000.0 * 0.10472, "MechPower (computed)");
        }
    }

    // BMS_CellArray: array_index from the multiplexor index signal.
    {
        auto out = d.decode(frame(257, "powertrain", true,
                                  {0x05, 0x88, 0x90, 0x46, 0x00, 0x00, 0x00, 0x00}));
        const auto* m = findMsg(out, "BMS_CellArray");
        check(m != nullptr, "BMS_CellArray decoded");
        if (m) {
            check(m->array_index.has_value() && *m->array_index == 5, "array_index == 5");
            checkNear(num(*m, "CellVoltage"), 3.7, "CellVoltage");
            checkNear(num(*m, "CellTemp"), 30.0, "CellTemp");
        }
    }

    // Diagnostics mux=0: AuxVoltage present, FaultCode absent.
    {
        auto out = d.decode(frame(1536, "chassis", false, {0x00, 0xE8, 0x35, 0x00, 0x00, 0x00, 0x00, 0x00}));
        const auto* m = findMsg(out, "Diagnostics");
        check(m != nullptr, "Diagnostics(mux=0) decoded");
        if (m) {
            checkNear(num(*m, "AuxVoltage"), 13.8, "AuxVoltage present @mux0");
            check(!hasSig(*m, "FaultCode"), "FaultCode absent @mux0");
        }
    }
    // Diagnostics mux=1: FaultCode label present, AuxVoltage absent.
    {
        auto out = d.decode(frame(1536, "chassis", false, {0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00}));
        const auto* m = findMsg(out, "Diagnostics");
        check(m != nullptr, "Diagnostics(mux=1) decoded");
        if (m) {
            check(str(*m, "FaultCode") == "EPS_Timeout", "FaultCode label @mux1");
            check(!hasSig(*m, "AuxVoltage"), "AuxVoltage absent @mux1");
        }
    }

    // Unknown id -> undecoded stub that still carries the raw packet.
    {
        auto out = d.decode(frame(0x7FF, "powertrain", false, {0xAA}));
        check(out.size() == 1 && !out[0].message_name.has_value(), "unknown id -> stub");
        check(out[0].raw_packet == "7FF#AA", "stub raw_packet reconstructed");
    }
}

// --- Layer 3: inline v3 MDC JSON (flattened root, bundle field names) --------

// Minimal v3 doc: native scale/offset + is_signed/is_float, flat mux fields,
// and a container message with contained_messages[]/header_id.
constexpr const char kV3FixtureJson[] = R"({
  "schemaVersion": "3.0.0",
  "id": "test_v3",
  "name": "v3 decode tests",
  "networks": [{
    "id": "test_net",
    "messages": [
      {
        "name": "NumericTest",
        "frame_id": 100,
        "length": 8,
        "senders": ["ECU"],
        "signals": [
          {"name": "UnsignedVal", "start": 0, "length": 16, "byte_order": "little_endian",
           "is_signed": false, "is_float": false, "scale": 0.01, "offset": 10, "unit": "V"},
          {"name": "SignedVal", "start": 16, "length": 16, "byte_order": "little_endian",
           "is_signed": true, "is_float": false, "scale": 0.5, "offset": -100, "unit": "A"},
          {"name": "FloatVal", "start": 32, "length": 32, "byte_order": "little_endian",
           "is_signed": false, "is_float": true, "unit": "ratio"}
        ]
      },
      {
        "name": "MuxTest",
        "frame_id": 200,
        "length": 8,
        "senders": ["ECU"],
        "signals": [
          {"name": "MuxSel", "start": 0, "length": 8, "byte_order": "little_endian",
           "is_multiplexer": true},
          {"name": "SignalA", "start": 8, "length": 16, "byte_order": "little_endian",
           "multiplexer_signal": "MuxSel", "multiplexer_ids": [0],
           "scale": 0.001, "offset": 0, "unit": "V"},
          {"name": "SignalB", "start": 8, "length": 16, "byte_order": "little_endian",
           "multiplexer_signal": "MuxSel", "multiplexer_ids": [1],
           "scale": 1, "offset": 0, "unit": "code"}
        ]
      },
      {
        "name": "IsoTpContainer",
        "frame_id": 300,
        "length": 8,
        "transport": "isotp",
        "senders": ["VCU"],
        "signals": [
          {"name": "PduId", "start": 0, "length": 16, "byte_order": "little_endian"}
        ],
        "contained_messages": [
          {
            "name": "RespA",
            "header_id": 100,
            "length": 8,
            "signals": [
              {"name": "RespValue", "start": 16, "length": 16, "byte_order": "little_endian",
               "scale": 0.1, "offset": 0, "unit": "V"}
            ]
          },
          {
            "name": "RespB",
            "header_id": 200,
            "length": 8,
            "signals": [
              {"name": "StatusCode", "start": 16, "length": 8, "byte_order": "little_endian"}
            ]
          }
        ]
      }
    ]
  }]
})";

const engine::MessageDef* findMessageDef(const engine::MdcSpec& spec, const std::string& name) {
    if (spec.vehicles.empty()) return nullptr;
    for (const auto& net : spec.vehicles[0].networks)
        for (const auto& m : net.messages)
            if (m.name == name) return &m;
    return nullptr;
}

void testV3JsonLoader() {
    std::printf("v3 JSON loader:\n");
    std::string err;
    engine::MdcSpec spec = engine::loadMdcSpecFromString(kV3FixtureJson, &err);
    check(err.empty(), std::string("v3 fixture parse: ") + err);
    check(spec.vehicles.size() == 1 && spec.vehicles[0].id == "test_v3", "flat root id");
    check(spec.projectName == "v3 decode tests", "flat root name");

    const auto* numeric = findMessageDef(spec, "NumericTest");
    check(numeric != nullptr && numeric->frame_id == 100, "frame_id");
    if (numeric && numeric->signals.size() >= 3) {
        check(numeric->signals[0].kind == engine::SignalKind::Unsigned, "is_signed/is_float -> unsigned");
        check(numeric->signals[0].conversion.factor == 0.01 &&
                  numeric->signals[0].conversion.offset == 10.0,
              "native scale/offset");
        check(numeric->signals[1].kind == engine::SignalKind::Signed, "is_signed -> signed");
        check(numeric->signals[2].kind == engine::SignalKind::Float, "is_float -> float");
    }

    const auto* mux = findMessageDef(spec, "MuxTest");
    if (mux && mux->signals.size() >= 3) {
        check(mux->signals[0].role == engine::MultiplexRole::Multiplexor, "is_multiplexer");
        check(mux->signals[1].role == engine::MultiplexRole::Multiplexed &&
                  mux->signals[1].muxIds == std::vector<std::int64_t>{0},
              "multiplexer_ids[0]");
        check(mux->signals[2].muxIds == std::vector<std::int64_t>{1}, "multiplexer_ids[1]");
    }

    const auto* container = findMessageDef(spec, "IsoTpContainer");
    check(container != nullptr && container->contained.size() == 2, "contained_messages[]");
    if (container && container->contained.size() == 2) {
        check(container->contained[0].name == "RespA" && container->contained[0].headerId == 100,
              "contained header_id 100");
        check(container->contained[1].name == "RespB" && container->contained[1].headerId == 200,
              "contained header_id 200");
    }
}

void runV3DecoderAssertions(const engine::Decoder& d, const char* label) {
    std::printf("v3 decoder assertions (%s):\n", label);

    // NumericTest: unsigned scale/offset, signed scale/offset, float32.
    // Frame: u16@0=1000 -> 20.0V; s16@16=-50 -> -125.0A; f32@32=1.5.
    {
        auto out = d.decode(frame(100, "test_net", false,
                                  {0xE8, 0x03, 0xCE, 0xFF, 0x00, 0x00, 0xC0, 0x3F}));
        const auto* m = findMsg(out, "NumericTest");
        check(m != nullptr, "NumericTest decoded");
        if (m) {
            checkNear(num(*m, "UnsignedVal"), 20.0, "v3 unsigned scale+offset");
            checkNear(num(*m, "SignedVal"), -125.0, "v3 signed scale+offset");
            checkNear(num(*m, "FloatVal"), 1.5, "v3 float decode");
        }
    }

    // MuxTest via is_multiplexer + multiplexer_ids (+ multiplexer_signal metadata).
    {
        auto out0 = d.decode(frame(200, "test_net", false,
                                   {0x00, 0xE8, 0x35, 0x00, 0x00, 0x00, 0x00, 0x00}));
        const auto* m0 = findMsg(out0, "MuxTest");
        check(m0 != nullptr, "MuxTest mux=0 decoded");
        if (m0) {
            checkNear(num(*m0, "SignalA"), 13.8, "v3 mux0 SignalA");
            check(!hasSig(*m0, "SignalB"), "v3 mux0 SignalB absent");
        }
    }
    {
        auto out1 = d.decode(frame(200, "test_net", false,
                                   {0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00}));
        const auto* m1 = findMsg(out1, "MuxTest");
        check(m1 != nullptr, "MuxTest mux=1 decoded");
        if (m1) {
            checkNear(num(*m1, "SignalB"), 257.0, "v3 mux1 SignalB");
            check(!hasSig(*m1, "SignalA"), "v3 mux1 SignalA absent");
        }
    }

    // IsoTpContainer: select contained PDU by header_id (PduId @0) and decode its signals.
    {
        auto out = d.decode(frame(300, "test_net", false,
                                  {0x64, 0x00, 0x8A, 0x00, 0x00, 0x00, 0x00, 0x00}));
        const auto* m = findMsg(out, "RespA");
        check(m != nullptr, "container header_id=100 -> RespA");
        if (m) {
            checkNear(num(*m, "RespValue"), 13.8, "v3 contained RespValue");
        }
    }
    {
        auto out = d.decode(frame(300, "test_net", false,
                                  {0xC8, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x00, 0x00}));
        const auto* m = findMsg(out, "RespB");
        check(m != nullptr, "container header_id=200 -> RespB");
        if (m) {
            checkNear(num(*m, "StatusCode"), 42.0, "v3 contained StatusCode");
        }
    }
}

} // namespace

int main() {
    std::printf("decode unit tests:\n");
    testBitExtraction();
    testExpr();

    engine::Decoder programmatic(buildSpec());
    runDecoderAssertions(programmatic, "programmatic spec");

    {
        std::string err;
        engine::MdcSpec spec = engine::loadMdcSpecFromFile(LHR_EV1_PATH, &err);
        check(err.empty(), std::string("load lhr-ev1: ") + err);
        engine::Decoder fromJson(std::move(spec));
        runDecoderAssertions(fromJson, "lhr-ev1 JSON");
    }

    testV3JsonLoader();
    {
        std::string err;
        engine::MdcSpec spec = engine::loadMdcSpecFromString(kV3FixtureJson, &err);
        check(err.empty(), std::string("v3 fixture reload: ") + err);
        engine::Decoder v3(std::move(spec));
        runV3DecoderAssertions(v3, "v3 inline JSON");
    }

    if (g_failures == 0) {
        std::printf("ALL DECODE TESTS PASSED\n");
        return 0;
    }
    std::printf("%d DECODE TEST(S) FAILED\n", g_failures);
    return 1;
}
