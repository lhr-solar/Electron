import time
import serial
from ..util.logger import Logger
from .parser_abc import Parser

class SerialParser(Parser, Logger):
    def __init__(self, port, baudrate=125000, log_queue=None):
        Parser.__init__(self)
        Logger.__init__(self, log_queue)
        self.source = port
        self.config = {'baudrate': baudrate}

    def run(self):
        port = self.source
        baudrate = self.config.get('baudrate', 125000)
        baudrate_codes = {
            10000: 0, 20000: 1, 50000: 2, 100000: 3,
            125000: 4, 250000: 5, 500000: 6, 800000: 7, 1000000: 8
        }

        print(f"[{self.__class__.__name__}] Opening Serial {port} @ {baudrate}...")
        ser = None
        try:
            ser = serial.Serial(port=port, baudrate=9600, timeout=1)
            if baudrate in baudrate_codes:
                cmd = f'S{baudrate_codes[baudrate]}\r'.encode()
                ser.write(cmd)
                time.sleep(0.1)
                ser.read_all()
            
            ser.write(b'O\r')
            time.sleep(0.1)
            ser.read_all()
            print(f"[{self.__class__.__name__}] Serial Open. Listening...")
            self.connected = True
            ser.timeout = 0.5

            while not self.stop_event.is_set():
                try:
                    raw_line = ser.read_until(b'\r')
                    if raw_line:
                        line_str = raw_line.decode('utf-8', errors='ignore').strip()
                        if line_str and (line_str.startswith('t') or line_str.startswith('T')):
                            self.log_packet(line_str)
                            self.queue.put(line_str)
                except serial.SerialException as e:
                    print(f"[{self.__class__.__name__}] Serial Error: {e}")
                    break
        except Exception as e:
            print(f"[{self.__class__.__name__}] Failed to open serial port: {e}")
            self.stop_event.set()
        finally:
            if ser and ser.is_open:
                print(f"[{self.__class__.__name__}] Closing Serial...")
                ser.write(b'C\r')
                ser.close()
            self.connected = False
        
        print(f"[{self.__class__.__name__}] Thread finished.")
