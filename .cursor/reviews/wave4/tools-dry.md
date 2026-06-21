# Wave 4 DRY Review — Tools track (MDC v3)

Reviewer: dry-reviewer (read-only). No product code was modified.

---

## Findings

```
can/mdc/tools/mdc-validate.mjs:93-95 — SEND_TYPE_TRIGGERED set (8 labels) re-instantiated inline inside the per-message for-loop on every iteration; identical set already defined as module-private const in lib/busload.mjs:12-21 — export SEND_TYPE_TRIGGERED from lib/busload.mjs and import it in mdc-validate.mjs (replaces the inline `const triggered = new Set([...])`)

can/mdc/tools/mdc-validate.mjs:88 / can/mdc/lib/busload.mjs:90-92 — `fd_baudrate != null ? "canfd" : "can"` ternary duplicated: once as a private `networkProtocolLabel` function in lib/busload.mjs (not exported) and once inlined in mdc-validate.mjs — export networkProtocolLabel from lib/busload.mjs so the validator can import it

can/mdc/tools/mdc-v2-to-v3.mjs:63-90 / mdc-v2-to-v3.mjs:92-106 — migrateSignal and migrateComputedSignal both handle the same four field renames (description→comment, kind→kindToFlags, min→minimum, max→maximum) in parallel switch-style if-else chains — extract a shared migrateSignalValueCommon(out, k, v) helper called from both

deploy/mdc2grafana.mjs:89 — `sig.comment ?? sig.description ?? ""` reads the v2 field `description` as a fallback; v3 renamed all entities to `comment` (contract §3, §3.3), so the v2 compat read is dead on v3 docs — use `sig.comment ?? ""` only (no shared module needed; dead branch cleanup)
```

---

## Notes

- The `SEND_TYPE_TRIGGERED` duplication (finding 1) is the highest-impact item: the inline `new Set([...])` allocates a new object on every loop iteration across all messages. Moving to the already-existing const in `lib/busload.mjs` is a one-import fix.
- `lib/busload.mjs` already exports `isCyclic`, which encapsulates the triggered check + cycle_time guard. The validator's inline set exists only for a different predicate (warn on cyclic with `cycle_time <= 0`), so reusing `isCyclic` directly is not a drop-in; exporting `SEND_TYPE_TRIGGERED` is the minimal fix.
- `networkProtocolLabel` (finding 2) is a one-liner; impact is low but it is currently the second place where the FD inference rule lives, duplicating the canonical definition from §3.4 ("presence of `fd_baudrate` ⇒ CAN FD").
- `mdc-v2-to-v3.mjs` (finding 3) is a migration-only tool; the duplication is self-contained, but the parallel loops are visually noisy and a source for drift if more common fields are added later.
- No duplication was found across the Python tools (`dbc2mdc.py`, `mdc2dbc.py`): the inline triggered-set in `dbc2mdc.py:299-301` is Python-only (cross-language sharing is not actionable), and `load_project` in `mdc2dbc.py` is a simple flat loader with no JS equivalent.
- `lib/mdc-bits.mjs` v2/v3 compat shims (`start ?? startBit`, `length ?? lengthBits`, `byte_order ?? byteOrder`) are intentional dual-version reads, localized to one function, and documented — not a DRY issue.
