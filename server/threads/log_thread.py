import os
from datetime import datetime
import queue

class LogThread:
    def __init__(self, stop_event, enabled=True, log_prefix="main"):
        self.stop_event = stop_event
        self.enabled = enabled
        self.log_queue = queue.Queue() if self.enabled else None
        self.log_file = None
        
        if self.enabled:
            try:
                log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..' 'logs'))
                os.makedirs(log_dir, exist_ok=True)
                timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
                log_filename = os.path.join(log_dir, f"log_{timestamp}.txt")
                self.log_file = open(log_filename, "a", encoding="utf-8")
                print(f"[{self.__class__.__name__}] Logging raw packets to: {log_filename}")
            except Exception as e:
                print(f"[{self.__class__.__name__}] Failed to create log file: {e}")

    def run(self):
        if not self.enabled:
            return
            
        while not self.stop_event.is_set() or not self.log_queue.empty():
            try:
                log_item = self.log_queue.get(timeout=0.1)
                if self.log_file:
                    self.log_file.write(f"{log_item.strip()}\n")
                    self.log_file.flush()
                self.log_queue.task_done()
            except queue.Empty:
                continue
            except Exception:
                pass
        
        if self.log_file:
            self.log_file.close()
        print(f"[{self.__class__.__name__}] Thread finished.")

    def close(self):
        if self.log_file:
            self.log_file.close()
