#include "FileSource.h"

#include "Slcan.h"
#include "SourceParams.h"
#include "ThreadedSource.h"
#include "bus/TelemetryBus.h"
#include "config/Config.h"

#include <chrono>
#include <fstream>
#include <string>
#include <thread>

namespace engine {

namespace {

// Replays an slcan text capture line-by-line into the bus. Mirrors the v3
// FileParser (server/parsers/file_parser.py): one frame per line, optional
// inter-frame pacing, finishes at EOF unless `loop` is set.
//
// config type: "file"
// params:
//   path         (required) path to the slcan log to replay
//   bus          (optional) logical bus/channel name tag (default "file")
//   interval_ms  (optional) delay between frames in ms (default 0 = as fast as possible)
//   loop         (optional) "true" to restart at EOF (default false)
class FileSource final : public ThreadedSource {
public:
    FileSource(std::string path, std::string busName, int intervalMs, bool loop)
        : path_(std::move(path)),
          busName_(std::move(busName)),
          intervalMs_(intervalMs),
          loop_(loop) {}

protected:
    void run(TelemetryBus& bus) override {
        do {
            std::ifstream in(path_);
            if (!in) {
                throw std::runtime_error("file source: cannot open " + path_);
            }
            std::string line;
            while (!stopRequested() && std::getline(in, line)) {
                if (auto frame = slcan::parse(line, busName_)) {
                    bus.publish(std::move(*frame));
                    if (intervalMs_ > 0) {
                        std::this_thread::sleep_for(std::chrono::milliseconds(intervalMs_));
                    }
                }
            }
        } while (loop_ && !stopRequested());
    }

private:
    std::string path_;
    std::string busName_;
    int intervalMs_;
    bool loop_;
};

} // namespace

void registerFileSource(SourceRegistry& registry) {
    registry.registerType("file", [](const SourceConfig& cfg) -> std::unique_ptr<ISource> {
        const std::string path = paramOr(cfg, "path", "");
        const std::string busName = paramOr(cfg, "bus", cfg.name.empty() ? "file" : cfg.name);
        const int intervalMs = paramInt(cfg, "interval_ms", 0);
        const bool loop = paramBool(cfg, "loop", false);
        return std::make_unique<FileSource>(path, busName, intervalMs, loop);
    });
}

} // namespace engine
