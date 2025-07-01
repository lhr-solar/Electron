import asyncio
import threading
import can


from server.can_decoder import CANDecoder


class CANDevice:
    devices = {}
    id_map = {}
    can_decoder: CANDecoder = None

    def __init__(self, name, send_ids=None, default_data=None, timeout=1):
        if send_ids is None:
            send_ids = []
        self.name = name
        self.send_ids = send_ids
        self.timeout = timeout

        self._timer_event = asyncio.Event()
        self._timer_thread = None

        self.is_connected = False

        self.default_data = default_data
        self.master_data = self.default_data

        self.custom_message_processor = None
        self.reset = None

        for send_id in send_ids:
            if send_id not in CANDevice.id_map:
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
        if self.is_connected is False:
            self.is_connected = True
            self.master_data = self.default_data
            if self.reset is not None:
                self.reset()


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

    @staticmethod
    def get_device_by_send_id(send_id):
        return CANDevice.get_device_by_name(CANDevice.get_device_name_by_send_id(send_id))

    @staticmethod
    def process_can_message(raw_message: can.Message):
        decoded_message = CANDevice.can_decoder.device_data_readable(raw_message.arbitration_id, raw_message.data)

        device = CANDevice.get_device_by_send_id(raw_message.arbitration_id)
        if device is None:
            return decoded_message
        device.received_message()

        if raw_message.arbitration_id == 0x585 or raw_message.arbitration_id == "0x585":
            print(decoded_message)

        if decoded_message is not None and decoded_message["msg"] is not None:
            for key, value in decoded_message['msg'].items():
                if key in device.master_data:
                    if type(device.master_data[key]) == bool:
                        device.master_data[key] = bool(value)
                    else:
                        device.master_data[key] = value
                if device.custom_message_processor is not None:
                    try:
                        device.custom_message_processor(decoded_message)
                    except Exception as e:
                        print(f"Error processing custom message for {device.name}: {e}")

        return decoded_message
