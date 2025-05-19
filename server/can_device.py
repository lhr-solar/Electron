import asyncio
import threading


class CANDevice:
    devices = {}
    all_valid_ids = []
    id_map = {}

    def __init__(self, name, send_ids, timeout=1):
        self.name = name
        self.send_ids = send_ids
        self.timeout = timeout

        self._timer_event = asyncio.Event()
        self._timer_thread = None

        self.is_connected = False

        for send_id in send_ids:
            if send_id not in CANDevice.all_valid_ids:
                CANDevice.all_valid_ids.append(send_id)
                CANDevice.id_map[send_id] = name
            else:
                raise ValueError(f"Duplicate send ID {send_id} found in device {name}")
        CANDevice.devices[name] = self

        def run_timer():
            asyncio.run(self.async_timer())

        self._timer_thread = threading.Thread(target=run_timer, daemon=True)
        self._timer_thread.start()

    def get_ids(self):
        return self.send_ids

    def received_message(self):
        self._timer_event.set()
        self.is_connected = True

    async def async_timer(self):
        while True:
            try:
                await asyncio.wait_for(self._timer_event.wait(), timeout=self.timeout)
                self._timer_event.clear()
            except:
                # print(f"Device {self.name} timed out")
                self.is_connected = False

    @staticmethod
    def get_device_by_name(name):
        return CANDevice.devices.get(name)

    @staticmethod
    def device_has_send_id(name, send_id):
        device = CANDevice.get_device_by_name(name)
        if device:
            return send_id in device.send_ids

        return False

    @staticmethod
    def get_device_name_by_send_id(send_id):
        return CANDevice.id_map.get(send_id)
