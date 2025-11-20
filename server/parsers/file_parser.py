from .parser_abc import Parser

class FileParser(Parser):
    def __init__(self, packet_queue, stop_event, filename):
        Parser.__init__(self, packet_queue, stop_event)
        self.source = filename

    def run(self):
        filename = self.source
        read_ok = False
        print(f"[{self.__class__.__name__}] Replaying from file: {filename}")
        try:
            with open(filename, 'r') as f:
                self.connected = True
                for line in f:
                    if self.stop_event.is_set():
                        break

                    line = line.strip()
                    if line:
                        self.packet_queue.put(line)
            # print(f"[{self.__class__.__name__}] End of file reached.")
            read_ok = True

        except FileNotFoundError:
            print(f"[{self.__class__.__name__}] File not found: {filename}")
        finally:
            self.connected = False

            if not read_ok:
                self.stop_event.set()

        if not read_ok:
            print(f"[{self.__class__.__name__}] Thread finished.")
