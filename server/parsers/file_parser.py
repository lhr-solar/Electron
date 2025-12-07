from .parser_abc import Parser
import time

class FileParser(Parser):
    def __init__(self, file_path):
        super().__init__()
        self.file_path = file_path

    def run(self):
        print(f"[{self.__class__.__name__}] Starting replay from file: {self.file_path}")
        
        try:
            with open(self.file_path, 'r') as f:
                lines = f.readlines()
            
            print(f"[{self.__class__.__name__}] Replaying {len(lines)} lines...")
            self.connected = True

            for line in lines:
                if self.stop_event.is_set():
                    print(f"[{self.__class__.__name__}] Replay stopped by user.")
                    break
                line = line.strip()
                if line:
                    self.queue.put(line)
                    # Optional small delay to simulate real-time playback
                    time.sleep(0.001)
            
            if not self.stop_event.is_set():
                print(f"[{self.__class__.__name__}] End of file reached.")

        except FileNotFoundError:
            print(f"[{self.__class__.__name__}] Error: Replay file not found at {self.file_path}")
        except Exception as e:
            print(f"[{self.__class__.__name__}] Error during replay: {e}")
        finally:
            self.connected = False
            # Signal that this parser is done so the session can clean up
            self.stop_event.set()
        
        print(f"[{self.__class__.__name__}] Thread finished.")
