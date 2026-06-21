#include "EngineHandle.h"

#include <nanobind/nanobind.h>
#include <nanobind/stl/string.h>

#include <string>
#include <utility>
#include <variant>

namespace nb = nanobind;
using namespace engine;

namespace {

// The API contract accepts config / MDC spec as `dict | str`. Strings pass
// through; dicts are serialized with the stdlib `json` module so the C++ side
// only ever parses JSON text (one parse path, no second JSON dependency here).
std::string toJsonText(nb::handle obj) {
    if (nb::isinstance<nb::str>(obj)) {
        return nb::cast<std::string>(obj);
    }
    nb::object dumps = nb::module_::import_("json").attr("dumps");
    return nb::cast<std::string>(dumps(obj));
}

// Convert one decoded message to the live_message_batch dict the Python backend
// forwards (mirrors v3 server/util/can_manager.py :: process_message).
nb::dict toBatchItem(const DecodedMessage& m) {
    nb::dict d;
    d["timestamp_ns"] = m.timestamp_ns;
    d["raw_packet"] = m.raw_packet;
    d["can_id_hex"] = m.can_id_hex;
    d["message_name"] = m.message_name.has_value() ? nb::cast(*m.message_name) : nb::none();
    d["sender"] = m.sender;
    d["network"] = m.network;
    d["vehicle"] = m.vehicle;

    // SignalValue is variant<double, string> (numeric or enum label).
    nb::dict signals;
    for (const auto& [name, value] : m.signals) {
        std::visit([&](const auto& v) { signals[name.c_str()] = v; }, value);
    }
    d["signals"] = signals;

    nb::dict units;
    for (const auto& [name, unit] : m.units) {
        units[name.c_str()] = unit;
    }
    d["units"] = units;

    if (m.array_index.has_value()) {
        d["array_index"] = *m.array_index;
    }
    return d;
}

nb::dict toStatusDict(const EngineStatus& st) {
    nb::dict d;
    d["running"] = st.running;
    d["role"] = st.role;
    d["mdc_loaded"] = st.mdc_loaded;
    d["dropped"] = st.dropped;

    nb::list sources;
    for (const auto& s : st.sources) {
        nb::dict sd;
        sd["name"] = s.name;
        sd["type"] = s.type;
        sd["status"] = s.status.status;
        if (s.status.connection_state.has_value()) {
            sd["connection_state"] = *s.status.connection_state;
        } else {
            sd["connection_state"] = nb::none();
        }
        if (s.status.error_message.has_value()) {
            sd["error_message"] = *s.status.error_message;
        } else {
            sd["error_message"] = nb::none();
        }
        sources.append(sd);
    }
    d["sources"] = sources;
    return d;
}

} // namespace

NB_MODULE(can_engine, m) {
    m.doc() = "In-process CAN telemetry engine (ingest + MDC-driven decode).";

    nb::class_<EngineHandle>(m, "EngineHandle")
        .def(nb::new_([](nb::object config) {
                 return new EngineHandle(toJsonText(config));
             }),
             nb::arg("config"),
             "Construct from an engine config (dict or JSON string), validated "
             "against engine/config.schema.json.")
        .def("start", &EngineHandle::start)
        .def("stop", &EngineHandle::stop)
        .def(
            "poll_batch",
            [](EngineHandle& self, int timeout_ms) -> nb::object {
                std::optional<std::vector<DecodedMessage>> batch;
                {
                    // Release the GIL so Python threads run while we block on
                    // the decoded-batch queue. Re-acquired before any nb:: use.
                    nb::gil_scoped_release release;
                    batch = self.pollBatch(timeout_ms);
                }
                if (!batch) {
                    return nb::none();
                }
                nb::list out;
                for (const auto& msg : *batch) {
                    out.append(toBatchItem(msg));
                }
                return out;
            },
            nb::arg("timeout_ms") = 0,
            "Pop the next decoded batch (list[dict]) or block up to timeout_ms; "
            "returns None on timeout or once stopped and drained.")
        .def("status", [](const EngineHandle& self) { return toStatusDict(self.status()); })
        .def(
            "load_mdc",
            [](EngineHandle& self, nb::object spec) { self.loadMdc(toJsonText(spec)); },
            nb::arg("spec"), "Load/replace the MDC project (dict or JSON string).");
}
