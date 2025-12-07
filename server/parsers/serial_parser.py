import time
import serial
from .parser_abc import Parser

class SerialParser(Parser):
    def __init__(self, port, serial_baudrate, can_bitrate):
        Parser.__init__(self)
        self.source = port
        self.serial_baudrate = serial_baudrate
        self.can_bitrate = can_bitrate
        self.device = None

    def _send_command(self, command: str, timeout: float = 0.5) -> bool:
        """
        Sends a command to the serial device and waits for an ACK (b'\x06') response.
        """
        if not self.device:
            return False
        
        try:
            # Write command with a newline, as per the reference code
            self.device.write(f'{command}\n'.encode())
            
            # Wait for the ACK response
            start_time = time.time()
            while time.time() - start_time < timeout:
                if self.device.in_waiting > 0:
                    response = self.device.read(1)
                    if response == b'\x06':
                        return True
                    else:
                        print(f"[{self.__class__.__name__}] Received unexpected response: {response}")
                        return False
                time.sleep(0.01) # Don't busy-wait
            
            print(f"[{self.__class__.__name__}] Timeout waiting for ACK on command '{command}'")
            return False
        except Exception as e:
            print(f"[{self.__class__.__name__}] Error sending command '{command}': {e}")
            return False

    def run(self):
        can_bitrate_codes = {
            10000: 'S0', 20000: 'S1', 50000: 'S2', 100000: 'S3',
            125000: 'S4', 250000: 'S5', 500000: 'S6', 800000: 'S7', 1000000: 'S8'
        }

        print(f"[{self.__class__.__name__}] Opening serial port {self.source} @ {self.serial_baudrate} bps...")
        
        try:
            self.device = serial.Serial(port=self.source, baudrate=self.serial_baudrate, timeout=None)
            
            # 1. Set CAN Bitrate
            can_speed_cmd = can_bitrate_codes.get(self.can_bitrate)
            if not can_speed_cmd:
                raise ValueError(f"Invalid CAN bitrate: {self.can_bitrate}")

            print(f"[{self.__class__.__name__}] Setting CAN bus bitrate to {self.can_bitrate} bps...")
            if not self._send_command(can_speed_cmd):
                raise ConnectionError("Failed to set CAN bitrate. Adapter did not ACK.")

            # 2. Open the CAN channel
            print(f"[{self.__class__.__name__}] Opening CAN channel...")
            if not self._send_command('O'):
                raise ConnectionError("Failed to open CAN channel. Adapter did not ACK.")

            print(f"[{self.__class__.__name__}] Serial device configured. Listening for CAN frames...")
            self.connected = True

            # 3. Main listening loop
            while not self.stop_event.is_set():
                try:
                    # Read until carriage return, as per SLCAN spec for incoming frames
                    raw_line = self.device.read_until(b'\r')
                    if raw_line:
                        line_str = raw_line.decode('utf-8', errors='ignore').strip()
                        if line_str and (line_str.startswith('t') or line_str.startswith('T')):
                            self.queue.put(line_str)
                except serial.SerialException as e:
                    print(f"[{self.__class__.__name__}] Serial Error: {e}")
                    break

        except (ValueError, ConnectionError, serial.SerialException) as e:
            print(f"[{self.__class__.__name__}] Failed to configure serial port: {e}")
        except Exception as e:
            print(f"[{self.__class__.__name__}] An unexpected error occurred: {e}")
        finally:
            if self.device and self.device.is_open:
                print(f"[{self.__class__.__name__}] Closing CAN channel and serial port...")
                self._send_command('C') # Attempt to close the CAN channel
                self.device.close()
            self.connected = False
            self.stop_event.set() # Ensure other threads know this one has stopped
        
        print(f"[{self.__class__.__name__}] Thread finished.")
