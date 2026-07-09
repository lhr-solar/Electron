"""Minimal self-check for EventRecorder + canp_manifest. Run: python -m server.util.event_recorder_selfcheck"""

from __future__ import annotations

import os
import tempfile
import time

from server.util.event_recorder import (
    EventRecorder,
    capture_raw_enabled,
    list_manifest_events,
    resolve_dump_path,
)


def demo() -> None:
    assert capture_raw_enabled("canp_tcp") is True
    os.environ.pop("CAPTURE_RAW", None)
    assert capture_raw_enabled("tcp") is False

    with tempfile.TemporaryDirectory() as d:
        r = EventRecorder(d, "canp_tcp", vehicle="HighNoon")
        assert r.begin_run() is None
        assert r.current_run_id() is None
        r.note_canp_chunk(b"\x00\x01", device_batch_ms=100)
        cur = r.get_current_event()
        assert cur and cur["uuid"]
        assert r.current_run_id() == cur["uuid"]
        name = cur["dump_file"]
        parts = name.split(".")
        assert len(parts) == 3 and parts[2] == "canp" and len(parts[1]) == 32
        assert len(parts[0]) == 15 and parts[0][2] == "-"
        assert os.path.isfile(cur["dump_path"])

        r._last_packet_at = time.time() - 31
        r.note_canp_chunk(b"\x02", device_batch_ms=200)
        cur2 = r.get_current_event()
        assert cur2["uuid"] != cur["uuid"]
        assert r.current_run_id() == cur2["uuid"]
        r.close_all()
        assert r.current_run_id() is None

        listed = list_manifest_events(d)
        assert len(listed) == 2
        assert all(e.get("dump_exists") for e in listed)
        names = {e["name"] for e in listed}
        assert names == {"Run 1", "Run 2"}

        r.rename_event(listed[0]["uuid"], "Brake test")
        named = next(e for e in list_manifest_events(d) if e["uuid"] == listed[0]["uuid"])
        assert named["name"] == "Brake test"

        # listed is newest-first: [Run 2, Run 1]; delete Run 2 → leave Run 1 → next is Run 2
        deleted = r.delete_events([listed[0]["uuid"]])
        assert deleted == [listed[0]["uuid"]]
        assert len(list_manifest_events(d)) == 1
        assert not os.path.isfile(resolve_dump_path(d, listed[0]["dump_file"], "canp_tcp"))

        r3 = EventRecorder(d, "canp_tcp")
        r3.note_canp_chunk(b"\x03", device_batch_ms=1)
        assert r3.get_current_event()["name"] == "Run 2"
        r3.close_all()

        # non-canp: no run_id / no events
        os.environ["CAPTURE_RAW"] = "1"
        r2 = EventRecorder(d, "tcp")
        assert r2.current_run_id() is None
        r2.begin_run()
        assert r2.current_run_id() is None
        r2.close_all()
        os.environ.pop("CAPTURE_RAW", None)

    print("event_recorder_selfcheck: ok")


if __name__ == "__main__":
    demo()
