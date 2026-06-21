# `can_engine` — in-process Python binding

A [nanobind](https://github.com/wjakob/nanobind) extension module that exposes
the C++ engine to the Python `backend/` as an in-process facade. Post-pivot this
is the **only** way Python talks to the engine — there is no C++ HTTP server and
no C++ sinks (sinks live in the Python backend).

```
engine/binding/
  EngineHandle.h / .cpp   pure-C++ facade (no Python types) — lifecycle + decode queue
  bindings.cpp            nanobind module: GIL handling + dict conversion
  CMakeLists.txt          guarded `can_engine` target
  test_smoke.py           import + start + poll_batch smoke test
```

## API contract

```python
import can_engine

h = can_engine.EngineHandle(config)        # config: dict | JSON str (validated vs engine/config.schema.json)
h.start()
h.stop()
batch = h.poll_batch(timeout_ms=500)       # list[dict] | None — blocks up to timeout, GIL released
status = h.status()                        # dict
h.load_mdc(spec)                           # spec: dict | JSON str — load/replace the MDC project
```

### `poll_batch` dict shape

Each item mirrors the v3 `live_message_batch` payload
(`server/util/can_manager.py :: process_message`):

```python
{
  "timestamp_ns": 1718570000000000000,   # int, capture time
  "raw_packet":   "t1008AABBCC...",      # original frame text (slcan/hex)
  "can_id_hex":   "0x100",
  "message_name": "BMS_Status",          # "" when unknown
  "sender":       "BMS",
  "network":      "powertrain",
  "vehicle":      "lhr_ev1",
  "signals":      {"PackVoltage": 402.1, "SOC": 78.0},   # name -> numeric value
  "units":        {"PackVoltage": "V",   "SOC": "%"},     # name -> unit
  "array_index":  12                     # present ONLY for array/indexed messages
}
```

`poll_batch` returns `None` on timeout, or once the engine is stopped and the
queue is drained.

### `status` dict shape

```python
{
  "running": True,
  "role": "desktop",
  "mdc_loaded": True,
  "dropped": 0,                          # frames dropped by the bus (ring full)
  "sources": [
    {"name": "replay", "type": "file", "status": "running",
     "connection_state": None, "error_message": None}   # mirrors v3 parser get_status
  ]
}
```

## GIL handling

- The background worker thread is **pure C++** and never touches Python, so it
  holds no GIL.
- `poll_batch` releases the GIL (`nb::gil_scoped_release`) around the blocking
  wait on the decoded-batch queue, then re-acquires it to build the `list[dict]`.
  Other Python threads run freely while a batch is pending.

## Building

The module pulls nanobind via CMake `FetchContent` (or a system
`find_package(nanobind)` if you `pip install nanobind` first), so the engine
keeps a single hard dependency (nlohmann-json). To build the whole engine
including the module:

```bash
# optional: makes find_package(nanobind) succeed offline and is the lightest path
pip install nanobind

# Set VCPKG_ROOT so CMake wires the vcpkg toolchain (nlohmann-json from engine/vcpkg.json).
export VCPKG_ROOT=/path/to/vcpkg
cmake --preset default -S engine
cmake --build --preset default
# Deps-free sandbox (JSON loaders disabled): cmake --preset nodeps -S engine
```

The compiled module lands in `engine/build/binding/` (e.g.
`can_engine.cpython-3xx-*.so`).

### Run the smoke test

```bash
export PYTHONPATH="$PWD/engine/build/binding:$PYTHONPATH"
export CAN_ENGINE_CAPTURE=/path/to/replay.capture   # for the `file` source
python engine/binding/test_smoke.py                 # or: pytest engine/binding/test_smoke.py
```

## Guards (why a clean checkout still builds green)

`binding/CMakeLists.txt` self-disables (prints a status line and returns) when
any upstream piece is missing, so `engine_core` / `engine_app` always build:

1. **Python** `Development.Module` component not found → module skipped.
2. **`engine/decode/Decoder.h` absent** → module skipped (the decode track owns
   `Decoder` / `DecodedMessage` / `MdcSpec`; this binding compiles against that
   seam). The expected decode contract is documented at the top of
   `EngineHandle.cpp`.

Once both are present, the `can_engine` target builds automatically.
