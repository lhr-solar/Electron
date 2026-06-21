# engine/binding — the nanobind in-process Python module `can_engine`.
#
# Its OWN target, intentionally guarded so engine_core never breaks: the module
# only builds when BOTH (a) Python's Development.Module component and nanobind
# are available AND (b) the decode seam (engine/decode/Decoder.h) has landed.
# Otherwise we print why and return, leaving the rest of the engine green.
#
# nanobind is pulled via FetchContent (or a system find_package if present) so
# the engine keeps a single hard dep (nlohmann-json); the module stays small —
# nanobind + stdlib, no server framework.

set(_decoder_header "${CMAKE_CURRENT_SOURCE_DIR}/../decode/Decoder.h")

find_package(Python 3.9 COMPONENTS Interpreter Development.Module QUIET)
if(NOT Python_FOUND)
    message(STATUS "binding: Python (Development.Module) not found — skipping can_engine module")
    return()
endif()

if(NOT EXISTS "${_decoder_header}")
    message(STATUS "binding: engine/decode/Decoder.h not present yet — skipping can_engine "
                   "module (decode track pending)")
    return()
endif()

# Prefer an installed nanobind (e.g. `pip install nanobind` exposes its cmake dir
# via `python -m nanobind --cmake_dir`); otherwise fetch a pinned release.
find_package(nanobind CONFIG QUIET)
if(NOT nanobind_FOUND)
    include(FetchContent)
    FetchContent_Declare(nanobind
        GIT_REPOSITORY https://github.com/wjakob/nanobind.git
        GIT_TAG v2.4.0)
    FetchContent_MakeAvailable(nanobind)
endif()

nanobind_add_module(can_engine NB_STATIC
    EngineHandle.cpp
    bindings.cpp)
target_link_libraries(can_engine PRIVATE engine_core)
target_include_directories(can_engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/..)
target_compile_features(can_engine PRIVATE cxx_std_20)

message(STATUS "binding: can_engine module enabled (Python ${Python_VERSION})")
