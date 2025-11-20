class Logger:
    def __init__(self, log_queue=None):
        self.log_queue = log_queue

    def log_packet(self, raw_frame):
        if self.log_queue:
            self.log_queue.put(raw_frame)
