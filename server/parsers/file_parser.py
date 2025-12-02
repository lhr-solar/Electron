from .parser_abc import Parser
import time

class FileParser(Parser):
    def __init__(self, content):
        super().__init__()
        # Split the content into lines for processing
        self.lines = content.splitlines() if content else []

    def run(self):
        print(f"[{self.__class__.__name__}] Replaying from uploaded content ({len(self.lines)} lines)...")
        self.connected = True
        
        try:
            for line in self.lines:
                if self.stop_event.is_set():
                    break
                line = line.strip()
                if line:
                    self.queue.put(line)
                    # Optional small delay to simulate real-time playback
                    time.sleep(0.001) 
            print(f"[{self.__class__.__name__}] End of content reached.")
        except Exception as e:
            print(f"[{self.__class__.__name__}] Error during replay: {e}")
        finally:
            self.connected = False
            # Signal that this parser is done so the session can clean up
            self.stop_event.set()
        
        print(f"[{self.__class__.__name__}] Thread finished.")
