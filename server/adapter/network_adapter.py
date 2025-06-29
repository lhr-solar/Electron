import socket
import threading
import queue
import can
from server.adapter.utils.adapter_abc import AdapterABC
from server.adapter.utils.slcan_parser import SLCANParser


class NetworkAdapterABC(AdapterABC):
    def __init__(self, server_ip='3.141.38.115', port=5700):
        super().__init__()
        self._server_ip = server_ip
        self._port = port
        self.nickname = "LTE"

        self._sock: socket.socket | None = None
        self._parser = SLCANParser()
        self._msg_queue: queue.Queue[can.Message] = queue.Queue()
        self._connected = False
        self._reader_thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def connect(self):
        try:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._sock.connect((self._server_ip, self._port))
            self._connected = True
            self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self._reader_thread.start()
            print(f"[NetworkAdapter] Connected to {self._server_ip}:{self._port}")
        except Exception as e:
            print(f"[NetworkAdapter] Connection error: {e}")
            self._connected = False

    def _reader_loop(self):
        try:
            while not self._stop_event.is_set():
                data = self._sock.recv(1024)
                if not data:
                    break  # connection closed
                self._parser.feed(data.decode('ascii'))

                while True:
                    msg = self._parser.get_message()
                    if msg is None:
                        break
                    self._msg_queue.put(msg)
        except Exception as e:
            print(f"[NetworkAdapter] Reader error: {e}")
        finally:
            self._connected = False
            self._sock.close()
            print("[NetworkAdapter] Socket closed")

    def read(self) -> can.Message | None:
        try:
            return self._msg_queue.get_nowait()
        except queue.Empty:
            return None

    def close(self):
        self._stop_event.set()
        if self._sock:
            try:
                self._sock.shutdown(socket.SHUT_RDWR)
                self._sock.close()
            except Exception:
                pass
        self._connected = False
        print("[NetworkAdapter] Closed connection")
