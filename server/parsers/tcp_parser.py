import socket
import time
from .parser_abc import Parser

class TCPParser(Parser):
    def __init__(self, ip, port):
        Parser.__init__(self)
        self.source = (ip, port)

    def run(self):
        ip, port = self.source
        buffer = ""

        while not self.stop_event.is_set():
            sock = None
            try:
                print(f"[{self.__class__.__name__}] Connecting to {ip}:{port}...")
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2.0)
                sock.connect((ip, port))
                print(f"[{self.__class__.__name__}] Connected!")
                self.connected = True

                while not self.stop_event.is_set():
                    try:
                        data = sock.recv(4096)
                        if not data:
                            print(f"[{self.__class__.__name__}] Server closed connection.")
                            break

                        buffer += data.decode('ascii', errors='ignore')

                        while '\r' in buffer:
                            end_index = buffer.index('\r')
                            potential_frame = buffer[:end_index + 1]
                            t_index = potential_frame.rfind('t')
                            T_index = potential_frame.rfind('T')
                            start_index = max(t_index, T_index)

                            if start_index != -1:
                                valid_frame = potential_frame[start_index:].strip()
                                if valid_frame:
                                    self.queue.put(valid_frame)
                            
                            buffer = buffer[end_index + 1:]

                    except socket.timeout:
                        continue
                    except Exception as e:
                        print(f"[{self.__class__.__name__}] Socket Error: {e}")
                        break
            
            except Exception as e:
                print(f"[{self.__class__.__name__}] Connection Error: {e}. Retrying in 1s...")
                time.sleep(1)
            finally:
                if sock:
                    sock.close()
                self.connected = False

        self.connected = False
        print(f"[{self.__class__.__name__}] Thread finished.")
