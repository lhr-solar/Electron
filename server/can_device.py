class CANDevice:
    devices = {}
    all_valid_ids = []
    id_map = {}

    def __init__(self, name, send_ids):
        self.name = name
        self.send_ids = send_ids

        for send_id in send_ids:
            if send_id not in CANDevice.all_valid_ids:
                CANDevice.all_valid_ids.append(send_id)
                CANDevice.id_map[send_id] = name
            else:
                raise ValueError(f"Duplicate send ID {send_id} found in device {name}")
        CANDevice.devices[name] = self

    def get_ids(self):
        return self.send_ids

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
