from can_device import CANDevice


def init_can_devices():
    CANDevice("BATTERY",
                    [0x002, 0x101, 0x102, 0x103, 0x104, 0x105, 0x106, 0x107, 0x108, 0x109, 0x10A, 0x10C, 0x10D,
                     0x10E, 0x10F, 0x110, 0x209, 0x219])
    CANDevice("MPPT_A", [0x200, 0x201])
    CANDevice("MPPT_B", [0x210, 0x211])
    CANDevice("MOTOR_CONTROLLER", [])
    CANDevice("CONTROLS", [])
    CANDevice("CONTACTOR_DRIVER", [])
    CANDevice("SUPPLEMENTAL_BATTERY", [0x10B])
