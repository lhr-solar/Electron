#include "TcpEndpoint.h"

#include <array>
#include <chrono>
#include <thread>

#if defined(__unix__) || defined(__APPLE__)

#include <arpa/inet.h>
#include <cerrno>
#include <cstring>
#include <netdb.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

namespace engine::net {

namespace {

constexpr int kPollTimeoutMs = 200;  // stop-responsiveness vs. idle wakeups
constexpr std::chrono::seconds kReconnectDelay{3};

struct Fd {
    int fd = -1;
    ~Fd() { reset(); }
    void reset(int newFd = -1) {
        if (fd >= 0) ::close(fd);
        fd = newFd;
    }
    explicit operator bool() const { return fd >= 0; }
};

// Resolve host:port. ai_passive (for bind) when host is empty/unspecified.
addrinfo* resolve(const std::string& host, int port, bool passive, std::string& err) {
    addrinfo hints{};
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    if (passive) hints.ai_flags = AI_PASSIVE;
    const std::string portStr = std::to_string(port);
    const char* node = host.empty() ? nullptr : host.c_str();
    addrinfo* res = nullptr;
    int rc = ::getaddrinfo(node, portStr.c_str(), &hints, &res);
    if (rc != 0) {
        err = std::string("getaddrinfo: ") + gai_strerror(rc);
        return nullptr;
    }
    return res;
}

// Drain a connected socket into onBytes until the peer closes or stop. Returns
// when the connection ends (clean close or stop).
void pumpConnection(int fd, const Callbacks& cb) {
    std::array<std::uint8_t, 65536> buf{};
    while (!cb.shouldStop()) {
        pollfd pfd{fd, POLLIN, 0};
        int rc = ::poll(&pfd, 1, kPollTimeoutMs);
        if (rc < 0) {
            if (errno == EINTR) continue;
            cb.onError(std::string("poll: ") + std::strerror(errno));
            return;
        }
        if (rc == 0) continue; // timeout — re-check stop flag
        if (pfd.revents & (POLLERR | POLLHUP | POLLNVAL)) return;
        ssize_t n = ::recv(fd, buf.data(), buf.size(), 0);
        if (n < 0) {
            if (errno == EINTR || errno == EAGAIN) continue;
            cb.onError(std::string("recv: ") + std::strerror(errno));
            return;
        }
        if (n == 0) return; // peer closed
        cb.onBytes(buf.data(), static_cast<std::size_t>(n));
    }
}

} // namespace

void runClient(const std::string& host, int port, const Callbacks& cb) {
    while (!cb.shouldStop()) {
        std::string err;
        addrinfo* res = resolve(host, port, /*passive=*/false, err);
        if (!res) {
            cb.onError(err);
            std::this_thread::sleep_for(kReconnectDelay);
            continue;
        }

        Fd sock;
        for (addrinfo* ai = res; ai && !sock; ai = ai->ai_next) {
            int fd = ::socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
            if (fd < 0) continue;
            if (::connect(fd, ai->ai_addr, ai->ai_addrlen) == 0) {
                sock.reset(fd);
            } else {
                ::close(fd);
            }
        }
        ::freeaddrinfo(res);

        if (!sock) {
            cb.onError("connect failed to " + host + ":" + std::to_string(port));
            std::this_thread::sleep_for(kReconnectDelay);
            continue;
        }

        cb.onConnection(true);
        pumpConnection(sock.fd, cb);
        cb.onConnection(false);
    }
}

void runServer(const std::string& host, int port, const Callbacks& cb) {
    std::string err;
    addrinfo* res = resolve(host, port, /*passive=*/true, err);
    if (!res) {
        cb.onError(err);
        return;
    }

    Fd listener;
    for (addrinfo* ai = res; ai && !listener; ai = ai->ai_next) {
        int fd = ::socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
        if (fd < 0) continue;
        int yes = 1;
        ::setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
        if (::bind(fd, ai->ai_addr, ai->ai_addrlen) == 0 && ::listen(fd, 4) == 0) {
            listener.reset(fd);
        } else {
            ::close(fd);
        }
    }
    ::freeaddrinfo(res);

    if (!listener) {
        cb.onError("bind/listen failed on " + host + ":" + std::to_string(port));
        return;
    }

    while (!cb.shouldStop()) {
        pollfd pfd{listener.fd, POLLIN, 0};
        int rc = ::poll(&pfd, 1, kPollTimeoutMs);
        if (rc <= 0) {
            if (rc < 0 && errno != EINTR) {
                cb.onError(std::string("poll(accept): ") + std::strerror(errno));
                return;
            }
            continue;
        }
        Fd client(::accept(listener.fd, nullptr, nullptr));
        if (!client) continue;
        cb.onConnection(true);
        pumpConnection(client.fd, cb);
        cb.onConnection(false);
    }
}

} // namespace engine::net

#else // non-POSIX

namespace engine::net {

void runClient(const std::string&, int, const Callbacks& cb) {
    if (cb.onError) cb.onError("TCP sources require POSIX sockets (build target unsupported)");
}
void runServer(const std::string&, int, const Callbacks& cb) {
    if (cb.onError) cb.onError("TCP sources require POSIX sockets (build target unsupported)");
}

} // namespace engine::net

#endif
