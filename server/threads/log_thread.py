import threading
from datetime import datetime

class LogThread(threading.Thread):
    def __init__(self, log_queue, stop_event):
        super().__init__()
        self.log_queue = log_queue
        self.stop_event = stop_event
        self.log_file = None
        
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            log_filename = f"./logs/log_{timestamp}.txt"
            self.log_file = open(log_filename, "a", encoding="utf-8")
            print(f"[{self.__class__.__name__}] Logging raw packets to: {log_filename}")
        except Exception as e:
            print(f"[{self.__class__.__name__}] Failed to create log file: {e}")

    def run(self):
        while not self.stop_event.is_set() or not self.log_queue.empty():
            try:
                log_item = self.log_queue.get(timeout=0.1)
                if self.log_file:
                    self.log_file.write(f"{log_item.strip()}\n")
                    self.log_file.flush()
                self.log_queue.task_done()
            except Exception:
                continue
        
        if self.log_file:
            self.log_file.close()
        print(f"[{self.__class__.__name__}] Thread finished.")

    def close(self):
        if self.log_file:
            self.log_file.close()
