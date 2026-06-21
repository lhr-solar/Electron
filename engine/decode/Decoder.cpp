#include "Decoder.h"

#include "BitExtract.h"
#include "Expr.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <optional>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace engine {

namespace {

using decode::CompiledExpr;
using decode::bitsToRawInt;
using decode::compileExpr;
using decode::evalExpr;
using decode::extractBits;
using decode::rawToFloat;
using decode::signExtend;

using LabelMap = std::unordered_map<std::int64_t, std::string>;

// One signal flattened for decode: pure layout + math, no spec traversal.
struct SignalPlan {
    std::string name;
    std::uint32_t startBit = 0;
    std::uint32_t length = 0;
    bool bigEndian = false;
    SignalKind kind = SignalKind::Unsigned;
    Conversion conv;
    std::string unit;
    const LabelMap* labels = nullptr;  // non-null for table/choices signals
    MultiplexRole role = MultiplexRole::None;
    std::vector<std::int64_t> muxIds;
    bool isArrayIndex = false;
};

struct ComputedPlan {
    std::string name;
    std::string unit;
    CompiledExpr expr;
};

// Decode plan for one contained sub-PDU inside a container message.
struct ContainedPlan {
    std::string name;
    std::string sender;
    int headerId = -1;
    std::vector<SignalPlan> signals;
    std::size_t slotCount = 0;
};

// Everything decode() needs for one message id, precomputed at load.
struct MessagePlan {
    std::string vehicle;
    std::string network;
    std::string name;
    std::string sender;        // first sender, or "not_found"
    std::uint32_t id = 0;
    bool extended = false;
    int multiplexorSlot = -1;  // index into `signals` of the selector, or -1
    std::vector<SignalPlan> signals;
    std::vector<ComputedPlan> computed;
    std::size_t slotCount = 0;
    bool isContainer = false;
    int headerSelectorSlot = -1;  // container signal whose raw value selects contained PDU
    std::vector<ContainedPlan> contained;
    std::unordered_map<std::int64_t, std::size_t> containedByHeaderId;
};

constexpr std::size_t kMaxSlots = 512;  // <= bits in a 64-byte frame
// ponytail: 4 KiB stack frame per decode call; upgrade path = heap-allocated slot
// buffer in MessagePlan if stack overflow is observed on embedded targets.

void formatCanIdHex(std::uint32_t id, std::string& out) {
    char buf[16];
    const int n = std::snprintf(buf, sizeof(buf), "0x%03X", id);
    out.assign(buf, static_cast<std::size_t>(n));
}

// candump-style "<ID>#<hexbytes>". ponytail: the engine no longer sees the
// original slcan/source text, so it reconstructs a canonical hex view here. If a
// source ever needs to round-trip its exact wire bytes, carry them on RawFrame.
void formatRawPacket(const RawFrame& f, std::string& out) {
    char buf[160];
    int n = std::snprintf(buf, sizeof(buf), "%X#", f.id);
    for (std::uint8_t i = 0; i < f.dlc && n + 2 < static_cast<int>(sizeof(buf)); ++i)
        n += std::snprintf(buf + n, sizeof(buf) - n, "%02X", f.data[i]);
    out.assign(buf, static_cast<std::size_t>(n));
}

double applyConversion(const Conversion& c, double raw) {
    switch (c.kind) {
        case ConversionKind::Identity:
        case ConversionKind::Table:
            return raw;
        case ConversionKind::Linear:
            return c.factor * raw + c.offset;
        case ConversionKind::Rational: {
            double num = 0.0;
            for (double coeff : c.numerator) num = num * raw + coeff;   // Horner, highest first
            double den = 0.0;
            for (double coeff : c.denominator) den = den * raw + coeff;
            return (den != 0.0 ? num / den : 0.0) + c.offset;
        }
    }
    return raw;
}

// Decode a single field to its raw integer (no conversion). Used for the
// multiplexor selector and the array index signal.
std::int64_t extractRawInt(const RawFrame& f, const SignalPlan& sp) {
    const std::uint64_t bits = extractBits(f.data.data(), f.dlc, sp.bigEndian, sp.startBit, sp.length);
    return bitsToRawInt(bits, sp.kind == SignalKind::Signed, sp.length);
}

} // namespace

struct Decoder::Impl {
    // Stable storage so the index maps can hold pointers.
    std::vector<std::unique_ptr<MessagePlan>> plans;
    std::vector<std::unique_ptr<LabelMap>> labelStore;
    // network id -> arbitration id -> matching message plans.
    std::unordered_map<std::string, std::unordered_map<std::uint32_t, std::vector<const MessagePlan*>>>
        byNetwork;
    // Fallback when a frame's bus name matches no known network.
    std::unordered_map<std::uint32_t, std::vector<const MessagePlan*>> byId;

    void build(const MdcSpec& spec);
    const LabelMap* resolveLabels(const NetworkDef& net, const MdcSpec& spec, const SignalDef& sig);
};

const LabelMap* Decoder::Impl::resolveLabels(const NetworkDef& net, const MdcSpec& spec,
                                             const SignalDef& sig) {
    auto own = [&](const std::vector<std::pair<std::int64_t, std::string>>& entries) {
        auto map = std::make_unique<LabelMap>();
        for (const auto& [v, label] : entries) (*map)[v] = label;
        const LabelMap* ptr = map.get();
        labelStore.push_back(std::move(map));
        return ptr;
    };
    if (!sig.choices.empty()) return own(sig.choices);
    if (sig.valueTableRef.empty()) return nullptr;
    // network-local tables first, then project-shared
    // (Embedded-Sharepoint/can/mdc/docs/mdc-overview.md).
    for (const auto& vt : net.valueTables)
        if (vt.name == sig.valueTableRef) return own(vt.entries);
    for (const auto& vt : spec.valueTables)
        if (vt.name == sig.valueTableRef) return own(vt.entries);
    return nullptr;
}

void Decoder::Impl::build(const MdcSpec& spec) {
    // ponytail: transport is single-frame only. `isotp`/`multiframe` messages
    // decode each frame's own bits as-is (sufficient for the lhr-ev1 multiplexed
    // Diagnostics example). True segmented reassembly (ISO 15765-2: FF/CF/FC flow
    // control, >8/64-byte payloads) needs a stateful per-(id) reassembly buffer
    // keyed off RawFrame.id and a stateful decode entry point. Ceiling: add a
    // TransportReassembler module feeding completed PDUs into decodeOne().
    for (const VehicleDef& veh : spec.vehicles) {
        for (const NetworkDef& net : veh.networks) {
            auto makeSignalPlan = [&](const MessageDef& owner, const SignalDef& sig) {
                SignalPlan sp;
                sp.name = sig.name;
                sp.startBit = sig.start;
                sp.length = sig.length;
                sp.bigEndian = sig.bigEndian;
                sp.kind = sig.kind;
                sp.conv = sig.conversion;
                sp.unit = sig.unit;
                sp.labels = resolveLabels(net, spec, sig);
                sp.role = sig.role;
                sp.muxIds = sig.muxIds;
                std::sort(sp.muxIds.begin(), sp.muxIds.end());
                sp.isArrayIndex = owner.array.present && sig.name == owner.array.indexSignal;
                return sp;
            };

            for (const MessageDef& msg : net.messages) {
                auto plan = std::make_unique<MessagePlan>();
                plan->vehicle = veh.id;
                plan->network = net.id;
                plan->name = msg.name;
                plan->sender = msg.senders.empty() ? "not_found" : msg.senders.front();
                plan->id = msg.frame_id;
                plan->extended = msg.is_extended_frame;
                plan->slotCount = std::min(msg.signals.size(), kMaxSlots);

                for (std::size_t i = 0; i < msg.signals.size(); ++i) {
                    const SignalDef& sig = msg.signals[i];
                    SignalPlan sp = makeSignalPlan(msg, sig);
                    // ponytail: name fallback for docs that set multiplexorSignal without is_multiplexer.
                    if (sig.role == MultiplexRole::Multiplexor ||
                        sig.name == msg.multiplexorSignal)
                        plan->multiplexorSlot = static_cast<int>(i);
                    plan->signals.push_back(std::move(sp));
                }

                if (!msg.contained.empty()) {
                    plan->isContainer = true;
                    std::uint32_t minContainedStart = UINT32_MAX;
                    for (const MessageDef& cm : msg.contained)
                        for (const SignalDef& sig : cm.signals)
                            minContainedStart = std::min(minContainedStart, sig.start);

                    std::uint32_t minHeaderStart = UINT32_MAX;
                    for (std::size_t i = 0; i < plan->signals.size(); ++i) {
                        const std::uint32_t start = plan->signals[i].startBit;
                        if (start < minContainedStart && start < minHeaderStart) {
                            minHeaderStart = start;
                            plan->headerSelectorSlot = static_cast<int>(i);
                        }
                    }
                    // ponytail: if contained signals share bit 0 with the selector,
                    // fall back to the leftmost container-level signal.
                    if (plan->headerSelectorSlot < 0) {
                        for (std::size_t i = 0; i < plan->signals.size(); ++i) {
                            const std::uint32_t start = plan->signals[i].startBit;
                            if (start < minHeaderStart) {
                                minHeaderStart = start;
                                plan->headerSelectorSlot = static_cast<int>(i);
                            }
                        }
                    }

                    for (const MessageDef& cm : msg.contained) {
                        ContainedPlan cp;
                        cp.name = cm.name;
                        cp.sender = cm.senders.empty() ? plan->sender : cm.senders.front();
                        cp.headerId = cm.headerId;
                        cp.slotCount = std::min(cm.signals.size(), kMaxSlots);
                        for (const SignalDef& sig : cm.signals)
                            cp.signals.push_back(makeSignalPlan(cm, sig));
                        if (cp.headerId >= 0)
                            plan->containedByHeaderId[cp.headerId] = plan->contained.size();
                        plan->contained.push_back(std::move(cp));
                    }
                }

                // Resolver maps a signal name (bare, or "Message.Signal" for the
                // network-scope cross-message form) to this message's slot index.
                auto resolver = [&msg](std::string_view ref) -> int {
                    std::string_view bare = ref;
                    const auto dot = ref.find('.');
                    if (dot != std::string_view::npos) {
                        if (ref.substr(0, dot) != msg.name) return -1;
                        bare = ref.substr(dot + 1);
                    }
                    for (std::size_t i = 0; i < msg.signals.size(); ++i)
                        if (msg.signals[i].name == bare) return static_cast<int>(i);
                    return -1;
                };

                for (const ComputedSignalDef& cs : msg.computed) {
                    CompiledExpr expr = compileExpr(cs.expr, resolver);
                    if (expr.ok) plan->computed.push_back({cs.name, cs.unit, std::move(expr)});
                }
                // Network-scope computed signals attach to every message whose
                // own signals satisfy the whole expression (e.g. both operands of
                // DrivePower live in BMS_Status). Cross-message ones (deps spread
                // over several frames) need a stateful value cache.
                // ponytail: cross-frame network computed signals are deferred —
                // const decode() holds no inter-frame state. Ceiling: add a
                // last-value cache + a stateful decode entry point when needed.
                for (const ComputedSignalDef& cs : net.computed) {
                    CompiledExpr expr = compileExpr(cs.expr, resolver);
                    if (expr.ok) plan->computed.push_back({cs.name, cs.unit, std::move(expr)});
                }

                const MessagePlan* ptr = plan.get();
                byNetwork[net.id][msg.frame_id].push_back(ptr);
                byId[msg.frame_id].push_back(ptr);
                plans.push_back(std::move(plan));
            }
        }
    }
}

namespace {

DecodedMessage decodeOne(const RawFrame& f, const MessagePlan& plan) {
    DecodedMessage m;
    m.timestamp_ns = f.ts_ns;
    formatRawPacket(f, m.raw_packet);
    formatCanIdHex(f.id, m.can_id_hex);
    m.message_name = plan.name;
    m.sender = plan.sender;
    m.network = plan.network;
    m.vehicle = plan.vehicle;
    m.signals.reserve(plan.signals.size() + plan.computed.size());

    std::array<double, kMaxSlots> slots;
    std::fill_n(slots.data(), plan.slotCount, std::nan(""));

    const std::int64_t muxRaw =
        plan.multiplexorSlot >= 0 ? extractRawInt(f, plan.signals[plan.multiplexorSlot]) : 0;

    for (std::size_t i = 0; i < plan.signals.size(); ++i) {
        const SignalPlan& sp = plan.signals[i];
        if (sp.role == MultiplexRole::Multiplexed) {
            if (!std::binary_search(sp.muxIds.begin(), sp.muxIds.end(), muxRaw)) continue;
        }

        const std::uint64_t bits =
            extractBits(f.data.data(), f.dlc, sp.bigEndian, sp.startBit, sp.length);
        double rawNum;
        std::int64_t rawInt = 0;
        switch (sp.kind) {
            case SignalKind::Signed:
                rawInt = signExtend(bits, sp.length);
                rawNum = static_cast<double>(rawInt);
                break;
            case SignalKind::Float:
                rawNum = rawToFloat(bits, sp.length);
                break;
            case SignalKind::Unsigned:
            default:
                rawInt = static_cast<std::int64_t>(bits);
                rawNum = static_cast<double>(bits);
                break;
        }

        const double phys = applyConversion(sp.conv, rawNum);
        if (i < kMaxSlots) slots[i] = phys;

        if (sp.labels) {
            const std::int64_t labelKey =
                sp.kind == SignalKind::Float ? static_cast<std::int64_t>(rawNum) : rawInt;
            auto it = sp.labels->find(labelKey);
            if (it != sp.labels->end()) m.signals.emplace_back(sp.name, it->second);
            else m.signals.emplace_back(sp.name, phys);
        } else {
            m.signals.emplace_back(sp.name, phys);
        }
        if (!sp.unit.empty()) m.units[sp.name] = sp.unit;
        if (sp.isArrayIndex) m.array_index = static_cast<int>(rawInt);
    }

    for (const ComputedPlan& cp : plan.computed) {
        const double v = evalExpr(cp.expr, slots.data());
        if (!std::isnan(v)) {
            m.signals.emplace_back(cp.name, v);
            if (!cp.unit.empty()) m.units[cp.name] = cp.unit;
        }
    }
    return m;
}

// Container frame: read the selector from container-level signals, pick the
// contained PDU by header_id, decode its signals from the same frame buffer.
std::optional<DecodedMessage> decodeContainer(const RawFrame& f, const MessagePlan& plan) {
    if (plan.headerSelectorSlot < 0) return std::nullopt;
    const std::int64_t headerRaw = extractRawInt(
        f, plan.signals[static_cast<std::size_t>(plan.headerSelectorSlot)]);
    auto it = plan.containedByHeaderId.find(headerRaw);
    if (it == plan.containedByHeaderId.end()) return std::nullopt;
    const ContainedPlan& cp = plan.contained[it->second];

    DecodedMessage m;
    m.timestamp_ns = f.ts_ns;
    formatRawPacket(f, m.raw_packet);
    formatCanIdHex(f.id, m.can_id_hex);
    m.message_name = cp.name;
    m.sender = cp.sender;
    m.network = plan.network;
    m.vehicle = plan.vehicle;
    m.signals.reserve(cp.signals.size());

    for (const SignalPlan& sp : cp.signals) {
        const std::uint64_t bits =
            extractBits(f.data.data(), f.dlc, sp.bigEndian, sp.startBit, sp.length);
        double rawNum;
        std::int64_t rawInt = 0;
        switch (sp.kind) {
            case SignalKind::Signed:
                rawInt = signExtend(bits, sp.length);
                rawNum = static_cast<double>(rawInt);
                break;
            case SignalKind::Float:
                rawNum = rawToFloat(bits, sp.length);
                break;
            case SignalKind::Unsigned:
            default:
                rawInt = static_cast<std::int64_t>(bits);
                rawNum = static_cast<double>(bits);
                break;
        }

        const double phys = applyConversion(sp.conv, rawNum);
        if (sp.labels) {
            const std::int64_t labelKey =
                sp.kind == SignalKind::Float ? static_cast<std::int64_t>(rawNum) : rawInt;
            auto lit = sp.labels->find(labelKey);
            if (lit != sp.labels->end()) m.signals.emplace_back(sp.name, lit->second);
            else m.signals.emplace_back(sp.name, phys);
        } else {
            m.signals.emplace_back(sp.name, phys);
        }
        if (!sp.unit.empty()) m.units[sp.name] = sp.unit;
    }
    return m;
}

DecodedMessage undecoded(const RawFrame& f) {
    DecodedMessage m;
    m.timestamp_ns = f.ts_ns;
    formatRawPacket(f, m.raw_packet);
    formatCanIdHex(f.id, m.can_id_hex);
    m.message_name = std::nullopt;
    m.sender = "not_found";
    m.network = "not_found";
    return m;
}

} // namespace

Decoder::Decoder(MdcSpec spec) : impl_(std::make_unique<Impl>()) { impl_->build(spec); }
Decoder::~Decoder() = default;
Decoder::Decoder(Decoder&&) noexcept = default;
Decoder& Decoder::operator=(Decoder&&) noexcept = default;

void Decoder::load(MdcSpec spec) {
    impl_ = std::make_unique<Impl>();
    impl_->build(spec);
}

void Decoder::decode(const RawFrame& f, std::vector<DecodedMessage>& out) const {
    out.clear();

    const std::vector<const MessagePlan*>* candidates = nullptr;
    auto netIt = impl_->byNetwork.find(f.bus);
    if (netIt != impl_->byNetwork.end()) {
        auto idIt = netIt->second.find(f.id);
        if (idIt != netIt->second.end()) candidates = &idIt->second;
    } else {
        auto idIt = impl_->byId.find(f.id);
        if (idIt != impl_->byId.end()) candidates = &idIt->second;
    }

    if (!candidates) {
        out.push_back(undecoded(f));
        return;
    }

    out.reserve(candidates->size());
    for (const MessagePlan* plan : *candidates) {
        if (plan->extended != f.extended) continue;  // 11- vs 29-bit id mismatch
        // ponytail: RawFrame.extended must be set by sources for this filter to work;
        // most sources default extended=false today.
        if (plan->isContainer) {
            if (auto decoded = decodeContainer(f, *plan)) out.push_back(std::move(*decoded));
        } else {
            out.push_back(decodeOne(f, *plan));
        }
    }
    if (out.empty()) out.push_back(undecoded(f));
}

std::vector<DecodedMessage> Decoder::decode(const RawFrame& f) const {
    std::vector<DecodedMessage> out;
    decode(f, out);
    return out;
}

} // namespace engine
