#pragma once

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

// Parsed, in-memory model of an MDC project
// (Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json).
// This is the decoder's *source of truth*: the Decoder compiles it into flat
// per-message decode plans at load (see Decoder.cpp). Kept deliberately plain
// (public fields, std containers) so tests can hand-build a tiny spec without the
// JSON loader when needed.
//
// Mirrors the schema hierarchy: project (flat root) -> network -> message ->
// signal, plus value tables (project + network scope) and computed signals
// (message + network scope).

namespace engine {

enum class SignalKind { Unsigned, Signed, Float };

enum class ConversionKind { Identity, Linear, Rational, Table };

enum class MultiplexRole { None, Multiplexor, Multiplexed };

// Raw -> physical mapping. Only the fields for the active `kind` are meaningful;
// see Embedded-Sharepoint/can/mdc/docs/mdc-overview.md "Conversion math".
struct Conversion {
    ConversionKind kind = ConversionKind::Identity;
    double factor = 1.0;                 // linear only; unused for Rational (uses numerator/denominator)
    double offset = 0.0;                 // linear, rational
    std::vector<double> numerator;       // rational, highest power first
    std::vector<double> denominator;     // rational, highest power first
};

// One named raw-value -> label enumeration (DBC VAL_TABLE_ / inline VAL_).
struct ValueTable {
    std::string name;
    std::vector<std::pair<std::int64_t, std::string>> entries;
};

struct SignalDef {
    std::string name;
    std::uint32_t start = 0;
    std::uint32_t length = 0;
    bool bigEndian = false;              // false = little_endian (Intel)
    SignalKind kind = SignalKind::Unsigned;
    Conversion conversion;
    std::string unit;

    MultiplexRole role = MultiplexRole::None;
    std::vector<std::int64_t> muxIds;    // multiplexor values that gate this signal

    // Enumeration: at most one of these is set (mutually exclusive in schema).
    std::vector<std::pair<std::int64_t, std::string>> choices;  // inline
    std::string valueTableRef;                                  // named table
};

// Virtual signal derived from an expression over other signals' physical values.
struct ComputedSignalDef {
    std::string name;
    std::string expr;
    std::string unit;
    SignalKind kind = SignalKind::Float;
};

// Post-decode array/indexed-message semantics (battery-cell pattern). Layered on
// top of the wire layout; an array message usually also multiplexes.
struct ArraySpec {
    bool present = false;
    std::string indexSignal;
    std::vector<std::string> elementSignals;
    int size = -1;                       // -1 = dynamic/unknown
    std::string storage = "series_per_index";
};

struct MessageDef {
    std::string name;
    std::uint32_t frame_id = 0;
    bool is_extended_frame = false;
    bool is_fd = false;
    std::uint32_t length = 0;
    std::string transport = "single";    // single | isotp | multiframe
    std::vector<std::string> senders;
    std::string multiplexorSignal;       // message-level multiplexing summary (MDC extension)
    ArraySpec array;
    std::vector<SignalDef> signals;
    std::vector<ComputedSignalDef> computed;  // message-scope
    int headerId = -1;                   // contained sub-PDU selector; -1 = not contained
    std::vector<MessageDef> contained; // ISO-TP / AUTOSAR container children (subset shape)
};

struct NetworkDef {
    std::string id;
    std::vector<MessageDef> messages;
    std::vector<ComputedSignalDef> computed;  // network-scope (cross-message)
    std::vector<ValueTable> valueTables;      // network-local (resolved first)
};

// Synthesized from the flat v3 root; not a schema type.
struct VehicleDef {
    std::string id;
    std::vector<NetworkDef> networks;
};

struct MdcSpec {
    std::string projectName;
    // ponytail: v3 flat root always synthesizes exactly one vehicle; upgrade path =
    // multi-doc aggregation when fleet-level specs are needed.
    std::vector<VehicleDef> vehicles;
    std::vector<ValueTable> valueTables;      // project-shared (resolved last)
};

// Parse an MDC project document into an MdcSpec. On parse failure returns an
// empty spec with `err` populated.
MdcSpec loadMdcSpecFromString(const std::string& json, std::string* err = nullptr);
MdcSpec loadMdcSpecFromFile(const std::string& path, std::string* err = nullptr);

} // namespace engine
