import queue
from ..util.slcan_to_can_msg import parse_slcan

class ProcessorThread:
    def __init__(self, packet_queue, stop_event, device_manager):
        self.packet_queue = packet_queue
        self.stop_event = stop_event
        self.device_manager = device_manager

    def run(self):
        """Decodes raw CAN packets and passes them to the device manager."""
        while not self.stop_event.is_set() or not self.packet_queue.empty():
            try:
                raw_frame = self.packet_queue.get(timeout=0.5)
                msg = parse_slcan(raw_frame)
                if msg:
                    self.device_manager.process_message(msg, raw_frame)
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[{self.__class__.__name__}] Error: {e}")
        print(f"[{self.__class__.__name__}] Thread finished.")
