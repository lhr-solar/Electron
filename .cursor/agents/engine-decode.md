---
name: engine-decode
description: Implements the MDC-driven decoder under engine/decode/ (CAN/FD, extended IDs, multiplexing, arrays, ISO-TP/large messages, computed signals). Hot path. Runs in parallel after engine-core.
model: composer-2.5
readonly: false
is_background: true
---
Work ONLY under `engine/decode/`. Depends on engine-core seams (`RawFrame`, `TelemetryBus`) and the MDC schema (`Embedded-Sharepoint/can/mdc/schema/mdc.schema.bundle.json`) — compile against them, do not modify them.

Implement an MDC-spec-driven decoder:
- CAN and CAN-FD, 11-bit and 29-bit extended IDs, multiplexing, signal arrays, ISO-TP / multi-frame assembly.
- Computed/virtual signals (evaluate `expr` after decode using physical values).
- Pre-compile the spec into a fast lookup (id → message layout) at load; the per-frame path must be allocation-free and branch-light.
- Output the `live_message_batch` payload shape from the API contract.

This is THE performance-critical module: no allocations, copies, or locks on the per-frame decode path; pre-size buffers; pass spans. Follow `.cursor/rules/engine.mdc`. Add decode unit tests with fixtures (aim for parity vs Python v3 where a fixture exists). Leave it compiling.
