"""Validate analytics view definitions against resolved DBC files."""
from __future__ import annotations

import os
from typing import Any

import cantools

from server.util.vehicle_dbc_resolve import resolve_dbc_paths


def _infer_array_index_signal(msg: Any) -> str | None:
    for sig in msg.signals:
        n = sig.name.lower()
        if "idx" in n or "index" in n:
            return sig.name
    return None


def _load_db(vehicle: str, dbc_filename: str, dbc_dir: str) -> tuple[cantools.database.Database | None, str | None]:
    paths = resolve_dbc_paths(vehicle, [dbc_filename], dbc_dir)
    if not paths or not os.path.isfile(paths[0]):
        return None, f"DBC file not found for vehicle '{vehicle}': {dbc_filename}"
    try:
        return cantools.database.load_file(paths[0]), None
    except Exception as e:
        return None, f"Failed to load DBC: {e!s}"


def _signal_field_order(msg: Any) -> list[str]:
    """Signal names in DBC layout order (start bit ascending)."""
    pairs: list[tuple[int, str]] = []
    for sig in msg.signals:
        try:
            st = int(getattr(sig, "start", 0) or 0)
        except (TypeError, ValueError):
            st = 10**9
        pairs.append((st, sig.name))
    pairs.sort(key=lambda x: (x[0], x[1]))
    return [p[1] for p in pairs]


def validate_views(
    views: list[dict[str, Any]],
    *,
    dbc_dir: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Returns (valid_views, errors). Each error: { viewId, path, detail }.
    A view is copied to valid_views only if it has zero validation errors.
    """
    errors: list[dict[str, Any]] = []
    valid: list[dict[str, Any]] = []

    for raw in views:
        if not isinstance(raw, dict):
            errors.append({"viewId": None, "path": "views[]", "detail": "Each view must be an object"})
            continue

        vid = raw.get("id") or raw.get("viewId")

        def err(p: str, detail: str):
            errors.append({"viewId": vid, "path": p, "detail": detail})

        view_type = (raw.get("viewType") or "").strip().lower()

        if view_type == "sync":
            ev: list[tuple[str, str]] = []
            vehicle = (raw.get("vehicle") or "").strip()
            dbc_fn = (raw.get("dbcFilename") or raw.get("dbc_file") or "").strip()
            if not vehicle:
                ev.append(("vehicle", "Missing vehicle"))
            if not dbc_fn:
                ev.append(("dbcFilename", "Missing DBC filename"))

            db: cantools.database.Database | None = None
            if not ev:
                db, load_err = _load_db(vehicle, dbc_fn, dbc_dir)
                if load_err:
                    ev.append(("dbcFilename", load_err))

            frame_sig = (raw.get("syncFrameSignalName") or "").strip()
            if not frame_sig:
                legacy = (raw.get("syncIdentifier") or "").strip()
                if legacy:
                    frame_sig = f"FrameID_{legacy}"

            if not frame_sig:
                ev.append(("syncFrameSignalName", "Select the DBC signal used as rolling frame id (e.g. FrameID_*)"))

            raw_ids = raw.get("syncMessageIds")
            if not isinstance(raw_ids, list) or len(raw_ids) == 0:
                ev.append(("syncMessageIds", "syncMessageIds must be a non-empty array of CAN message ids"))
                sync_mids: list[int] = []
            else:
                sync_mids = []
                for i, x in enumerate(raw_ids):
                    try:
                        sync_mids.append(int(x))
                    except (TypeError, ValueError):
                        ev.append((f"syncMessageIds[{i}]", "Each entry must be an integer frame id"))

            sync_fields_blocks: list[dict[str, Any]] = []
            array_flags: list[bool] = []
            unique_order: list[int] = []

            if db is not None and not ev and frame_sig and sync_mids:
                seen_ids: set[int] = set()
                for mid in sync_mids:
                    if mid in seen_ids:
                        continue
                    seen_ids.add(mid)
                    unique_order.append(mid)
                    m = db.get_message_by_frame_id(mid)
                    if not m:
                        ev.append(("syncMessageIds", f"No message with frame id 0x{mid:X} in DBC"))
                        break
                    names = {s.name for s in m.signals}
                    if frame_sig not in names:
                        ev.append(
                            ("syncFrameSignalName", f"Signal '{frame_sig}' not on message '{m.name}' (0x{mid:X})"),
                        )
                        break
                    array_flags.append(_infer_array_index_signal(m) is not None)
                    fields = _signal_field_order(m)
                    sync_fields_blocks.append(
                        {"messageId": mid, "messageName": m.name, "fields": fields},
                    )

                if not ev and not sync_fields_blocks:
                    ev.append(("syncMessageIds", "No valid messages added to sync group"))
                elif not ev and array_flags:
                    if any(array_flags) and not all(array_flags):
                        ev.append(
                            (
                                "syncMessageIds",
                                "For sync, either all selected messages are array-indexed or none are (mixed not supported)",
                            ),
                        )

            if ev:
                for path, detail in ev:
                    errors.append({"viewId": vid, "path": path, "detail": detail})
                continue

            assert db is not None and sync_mids and frame_sig
            is_array = bool(array_flags and all(array_flags))
            gix_val = raw.get("syncGraphArrayIndex")
            try:
                gix_int = int(gix_val) if gix_val is not None else None
            except (TypeError, ValueError):
                gix_int = None

            if is_array and gix_int is None:
                errors.append(
                    {
                        "viewId": vid,
                        "path": "syncGraphArrayIndex",
                        "detail": "Array message sync requires syncGraphArrayIndex",
                    },
                )
                continue

            first_mid = sync_fields_blocks[0]["messageId"]
            m0 = db.get_message_by_frame_id(int(first_mid))
            assert m0 is not None

            norm = {
                "id": vid,
                "vehicle": vehicle,
                "dbcFilename": dbc_fn,
                "viewType": "sync",
                "syncFrameSignalName": frame_sig,
                "syncMessageIds": unique_order,
                "syncFieldsByMessage": sync_fields_blocks,
                "syncGraphArrayIndex": gix_int if is_array else None,
                "isArrayMessage": is_array,
                "messageId": int(first_mid),
                "messageName": m0.name,
                "signalName": "",
            }
            valid.append(norm)
            continue

        # --- min / max / graph ---
        ev = []

        vehicle = (raw.get("vehicle") or "").strip()
        dbc_fn = (raw.get("dbcFilename") or raw.get("dbc_file") or "").strip()
        if not vehicle:
            ev.append(("vehicle", "Missing vehicle"))
        if not dbc_fn:
            ev.append(("dbcFilename", "Missing DBC filename"))

        db = None
        if not ev:
            db, load_err = _load_db(vehicle, dbc_fn, dbc_dir)
            if load_err:
                ev.append(("dbcFilename", load_err))

        msg = None
        if db is not None and not ev:
            msg_id = raw.get("messageId")
            try:
                mid = int(msg_id)
            except (TypeError, ValueError):
                ev.append(("messageId", "messageId must be an integer frame id"))
                mid = None
            if mid is not None:
                msg = db.get_message_by_frame_id(mid)
                if not msg:
                    ev.append(("messageId", f"No message with frame id 0x{mid:X} in DBC"))

        sig_names: set[str] = set()
        if msg is not None:
            sig_names = {s.name for s in msg.signals}

        sig = (raw.get("signalName") or "").strip()
        if msg is not None:
            if not sig:
                ev.append(("signalName", "Missing signal name"))
            elif sig not in sig_names:
                ev.append(("signalName", f"Signal '{sig}' not found on message '{msg.name}'"))

        if view_type not in ("min", "max", "graph", "readout"):
            ev.append(("viewType", "viewType must be min, max, graph, readout, or sync"))

        arr_sig: str | None = None
        if msg is not None:
            arr_sig = _infer_array_index_signal(msg)
        is_array = arr_sig is not None

        array_mode = raw.get("arrayMode")
        if array_mode is not None and array_mode not in ("all_indices", "single_index"):
            ev.append(("arrayMode", "arrayMode must be all_indices, single_index, or null"))
        if array_mode in ("all_indices", "single_index") and not is_array:
            ev.append(("arrayMode", "arrayMode is only valid for array messages (index signal in DBC)"))

        if not ev and msg is not None and view_type in ("min", "max") and is_array:
            if not array_mode:
                ev.append(("arrayMode", "Array message requires arrayMode: all_indices or single_index"))
            elif array_mode == "single_index":
                try:
                    ix = int(raw.get("arrayIndex"))
                    if ix < 0:
                        ev.append(("arrayIndex", "arrayIndex must be >= 0"))
                except (TypeError, ValueError):
                    ev.append(("arrayIndex", "single_index requires integer arrayIndex"))

        if not ev and msg is not None and view_type in ("graph", "readout") and is_array:
            try:
                gix = raw.get("graphArrayIndex")
                if gix is None:
                    ev.append(("graphArrayIndex", "Array message requires graphArrayIndex for graph/readout"))
                else:
                    int(gix)
            except (TypeError, ValueError):
                ev.append(("graphArrayIndex", "graphArrayIndex must be an integer"))

        if ev:
            for path, detail in ev:
                errors.append({"viewId": vid, "path": path, "detail": detail})
            continue

        assert msg is not None and db is not None
        norm = {
            "id": vid,
            "vehicle": vehicle,
            "dbcFilename": dbc_fn,
            "messageId": int(raw.get("messageId")),
            "messageName": msg.name,
            "signalName": sig,
            "viewType": view_type,
            "arrayMode": array_mode,
            "arrayIndex": raw.get("arrayIndex"),
            "graphArrayIndex": raw.get("graphArrayIndex"),
            "isArrayMessage": is_array,
        }
        valid.append(norm)

    return valid, errors
