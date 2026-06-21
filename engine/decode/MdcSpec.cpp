#include "MdcSpec.h"

#include <fstream>
#include <nlohmann/json.hpp>
#include <sstream>

namespace engine {

namespace {

using nlohmann::json;

std::string readFile(const std::string& path, std::string* err) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        if (err) *err = "cannot open MDC file: " + path;
        return {};
    }
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

SignalKind deriveKind(bool isFloat, bool isSigned) {
    if (isFloat) return SignalKind::Float;
    if (isSigned) return SignalKind::Signed;
    return SignalKind::Unsigned;
}

Conversion parseConversion(const json& c) {
    Conversion conv;
    if (!c.is_object()) return conv;
    const std::string kind = c.value("kind", std::string{});
    if (kind == "rational") {
        conv.kind = ConversionKind::Rational;
        conv.offset = c.value("offset", 0.0);
        auto readCoeffs = [&](const char* key, std::vector<double>& vec) {
            if (c.contains(key) && c[key].is_array())
                for (const auto& v : c[key]) vec.push_back(v.get<double>());
        };
        readCoeffs("numerator", conv.numerator);
        readCoeffs("denominator", conv.denominator);
    } else if (kind == "table") {
        conv.kind = ConversionKind::Table;
    }
    return conv;
}

Conversion conversionFromNative(const json& s) {
    const double scale = s.value("scale", 1.0);
    const double offset = s.value("offset", 0.0);
    Conversion conv;
    // ponytail: exact == works for JSON integer defaults 1/0; non-default scales that
    // happen to equal 1.0 are also fine (factor=1 linear == identity).
    if (scale == 1.0 && offset == 0.0) {
        conv.kind = ConversionKind::Identity;
    } else {
        conv.kind = ConversionKind::Linear;
        conv.factor = scale;
        conv.offset = offset;
    }
    return conv;
}

void parseChoices(const json& arr, std::vector<std::pair<std::int64_t, std::string>>& out) {
    if (!arr.is_array()) return;
    for (const auto& e : arr) {
        if (!e.is_object() || !e.contains("value") || !e.contains("label")) continue;
        out.emplace_back(e["value"].get<std::int64_t>(), e["label"].get<std::string>());
    }
}

ValueTable parseValueTable(const json& t) {
    ValueTable vt;
    vt.name = t.value("name", std::string{});
    if (t.contains("entries")) parseChoices(t["entries"], vt.entries);
    return vt;
}

void parseSenders(const json& m, MessageDef& msg) {
    if (m.contains("senders") && m["senders"].is_array())
        for (const auto& s : m["senders"]) msg.senders.push_back(s.get<std::string>());
}

SignalDef parseSignal(const json& s) {
    SignalDef sig;
    sig.name = s.value("name", std::string{});
    sig.start = s.value("start", 0u);
    sig.length = s.value("length", 0u);
    sig.bigEndian = s.value("byte_order", std::string{"little_endian"}) == "big_endian";
    sig.kind = deriveKind(s.value("is_float", false), s.value("is_signed", false));
    if (s.contains("conversion") && s["conversion"].is_object())
        sig.conversion = parseConversion(s["conversion"]);
    else
        sig.conversion = conversionFromNative(s);
    sig.unit = s.value("unit", std::string{});
    sig.valueTableRef = s.value("valueTableRef", std::string{});
    if (s.contains("choices")) parseChoices(s["choices"], sig.choices);

    if (s.value("is_multiplexer", false)) {
        sig.role = MultiplexRole::Multiplexor;
    } else if (s.contains("multiplexer_ids") && s["multiplexer_ids"].is_array() &&
               !s["multiplexer_ids"].empty()) {
        sig.role = MultiplexRole::Multiplexed;
        for (const auto& v : s["multiplexer_ids"]) sig.muxIds.push_back(v.get<std::int64_t>());
    }
    return sig;
}

ComputedSignalDef parseComputed(const json& c) {
    ComputedSignalDef cs;
    cs.name = c.value("name", std::string{});
    cs.expr = c.value("expr", std::string{});
    cs.unit = c.value("unit", std::string{});
    cs.kind = deriveKind(c.value("is_float", true), c.value("is_signed", false));
    return cs;
}

void parseMessageSignals(const json& m, MessageDef& msg) {
    if (m.contains("signals") && m["signals"].is_array())
        for (const auto& s : m["signals"]) msg.signals.push_back(parseSignal(s));
    if (m.contains("computedSignals") && m["computedSignals"].is_array())
        for (const auto& c : m["computedSignals"]) msg.computed.push_back(parseComputed(c));
}

MessageDef parseContainedMessage(const json& m) {
    MessageDef msg;
    msg.name = m.value("name", std::string{});
    msg.length = m.value("length", 0u);
    if (m.contains("header_id") && !m["header_id"].is_null())
        msg.headerId = m["header_id"].get<int>();
    parseSenders(m, msg);
    parseMessageSignals(m, msg);
    return msg;
}

MessageDef parseMessage(const json& m) {
    MessageDef msg;
    msg.name = m.value("name", std::string{});
    msg.frame_id = m.value("frame_id", 0u);
    msg.is_extended_frame = m.value("is_extended_frame", false);
    msg.is_fd = m.value("is_fd", false);
    msg.length = m.value("length", 0u);
    msg.transport = m.value("transport", std::string{"single"});
    parseSenders(m, msg);
    if (m.contains("multiplexing") && m["multiplexing"].is_object())
        // message-level multiplexing summary (kept MDC extension); distinct from signal-level multiplexer_signal.
        msg.multiplexorSignal = m["multiplexing"].value("multiplexorSignal", std::string{});
    if (m.contains("array") && m["array"].is_object()) {
        const json& a = m["array"];
        msg.array.present = true;
        msg.array.indexSignal = a.value("indexSignal", std::string{});
        msg.array.size = a.value("size", -1);
        msg.array.storage = a.value("storage", std::string{"series_per_index"});
        if (a.contains("elementSignals") && a["elementSignals"].is_array())
            for (const auto& e : a["elementSignals"]) msg.array.elementSignals.push_back(e.get<std::string>());
    }
    parseMessageSignals(m, msg);
    if (m.contains("contained_messages") && m["contained_messages"].is_array())
        for (const auto& cm : m["contained_messages"]) msg.contained.push_back(parseContainedMessage(cm));
    return msg;
}

NetworkDef parseNetwork(const json& n) {
    NetworkDef net;
    net.id = n.value("id", std::string{});
    if (n.contains("valueTables") && n["valueTables"].is_array())
        for (const auto& t : n["valueTables"]) net.valueTables.push_back(parseValueTable(t));
    if (n.contains("messages") && n["messages"].is_array())
        for (const auto& m : n["messages"]) net.messages.push_back(parseMessage(m));
    if (n.contains("computedSignals") && n["computedSignals"].is_array())
        for (const auto& c : n["computedSignals"]) net.computed.push_back(parseComputed(c));
    return net;
}

} // namespace

MdcSpec loadMdcSpecFromFile(const std::string& path, std::string* err) {
    std::string body = readFile(path, err);
    if (err && !err->empty()) return MdcSpec{};
    return loadMdcSpecFromString(body, err);
}

MdcSpec loadMdcSpecFromString(const std::string& body, std::string* err) {
    json root = json::parse(body, nullptr, /*allow_exceptions=*/false);
    if (root.is_discarded() || !root.is_object()) {
        if (err) *err = "MDC document is not a valid JSON object";
        return MdcSpec{};
    }

    MdcSpec spec;
    spec.projectName = root.value("name", std::string{});
    if (spec.projectName.empty() && root.contains("metadata") && root["metadata"].is_object())
        spec.projectName = root["metadata"].value("name", std::string{});
    if (root.contains("valueTables") && root["valueTables"].is_array())
        for (const auto& t : root["valueTables"]) spec.valueTables.push_back(parseValueTable(t));

    // v3: flat root — one document is one vehicle; synthesize VehicleDef for Decoder.
    VehicleDef veh;
    veh.id = root.value("id", std::string{});
    if (root.contains("networks") && root["networks"].is_array())
        for (const auto& n : root["networks"]) veh.networks.push_back(parseNetwork(n));
    spec.vehicles.push_back(std::move(veh));
    return spec;
}

} // namespace engine
