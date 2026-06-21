#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

namespace engine::net {

// Shared TCP plumbing for the network sources (tcp-slcan, capnp-tcp). Handles
// the socket lifecycle — client connect-with-reconnect and server
// bind/listen/accept — and streams raw bytes to a callback. Framing (slcan
// lines vs. length-prefixed Cap'n Proto) is the caller's concern, so this stays
// reusable across both. POSIX sockets only; documented stub elsewhere.
//
// All loops poll with a short timeout and re-check shouldStop(), so stop() needs
// no socket shutdown to make join() prompt (worst-case latency ~200 ms).
struct Callbacks {
    std::function<bool()> shouldStop;                          // loop exits when true
    std::function<void(bool connected)> onConnection;          // connection state changes
    std::function<void(const std::uint8_t*, std::size_t)> onBytes; // received chunk
    std::function<void(const std::string&)> onError;           // non-fatal errors (logged)
};

// Connect to host:port and read until the peer closes or shouldStop(); then
// reconnect, looping until shouldStop(). Returns when stopped.
void runClient(const std::string& host, int port, const Callbacks& cb);

// Bind host:port, accept inbound vehicle streams one client at a time, and feed
// their bytes to onBytes. Loops accepting new clients until shouldStop().
void runServer(const std::string& host, int port, const Callbacks& cb);

} // namespace engine::net
