cmake_minimum_required(VERSION 3.21)

# vcpkg toolchain auto-detect — must run before project().
# ponytail: optional. JSON always works via find_package or FetchContent fallback.
if(DEFINED ENV{VCPKG_ROOT} AND NOT DEFINED CMAKE_TOOLCHAIN_FILE)
    set(CMAKE_TOOLCHAIN_FILE "$ENV{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake"
        CACHE STRING "vcpkg toolchain file")
endif()

project(can_engine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

# --- Core library: the seam the parallel engine workers compile against ---
# ponytail: GLOB so parallel sub-tracks (decode/, sources/) drop .cpp files
# without all editing this list (avoids merge conflicts). Re-run CMake after
# adding files. Binding (engine/binding/) adds its own target below.
file(GLOB_RECURSE ENGINE_CORE_SOURCES CONFIGURE_DEPENDS
    bus/*.cpp sources/*.cpp decode/*.cpp config/*.cpp)
# Test drivers carry their own main(); keep them out of the core library so
# engine_app links cleanly. They are built as separate test executables below.
list(FILTER ENGINE_CORE_SOURCES EXCLUDE REGEX ".*Test\\.cpp$")
add_library(engine_core ${ENGINE_CORE_SOURCES})
target_include_directories(engine_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_features(engine_core PUBLIC cxx_std_20)

find_package(Threads REQUIRED)
target_link_libraries(engine_core PUBLIC Threads::Threads)

# JSON (nlohmann-json): vcpkg/system first (engine/vcpkg.json), FetchContent fallback.
find_package(nlohmann_json CONFIG QUIET)
if(NOT nlohmann_json_FOUND)
    include(FetchContent)
    FetchContent_Declare(
        nlohmann_json
        GIT_REPOSITORY https://github.com/nlohmann/json.git
        GIT_TAG v3.11.3
    )
    set(JSON_BuildTests OFF CACHE INTERNAL "")
    FetchContent_MakeAvailable(nlohmann_json)
endif()
target_link_libraries(engine_core PUBLIC nlohmann_json::nlohmann_json)
target_compile_definitions(engine_core PUBLIC ENGINE_HAVE_JSON)
message(STATUS "engine: nlohmann-json — JSON config + MDC parsing enabled")

# --- Engine entrypoint ---
add_executable(engine_app main.cpp)
target_link_libraries(engine_app PRIVATE engine_core)

# --- Python binding (engine/binding/) ---
# Its own target. Self-guards on Python + nanobind + the decode seam, so this
# add_subdirectory is a no-op (core stays green) until those are present.
add_subdirectory(binding)

# --- Smoke check ---
enable_testing()
add_test(NAME selftest COMMAND engine_app --selftest)

# --- Unit tests ---
# Additive: separate test executables live in engine/tests/ (outside the core
# GLOB so test mains never leak into engine_core). Add a file here per test.
add_executable(sources_test tests/sources_test.cpp)
target_link_libraries(sources_test PRIVATE engine_core)
add_test(NAME sources_test COMMAND sources_test)

# --- Decode unit test ---
# Drives the MDC decoder against crafted frames. Links engine_core, so it
# inherits ENGINE_HAVE_JSON and exercises the JSON loader path.
add_executable(engine_decode_test decode/DecoderTest.cpp)
target_link_libraries(engine_decode_test PRIVATE engine_core)
target_compile_definitions(engine_decode_test PRIVATE
    LHR_EV1_PATH="${CMAKE_CURRENT_SOURCE_DIR}/../Embedded-Sharepoint/can/mdc/examples/lhr-ev1/project.mdc.json")
add_test(NAME decode_unit COMMAND engine_decode_test)
