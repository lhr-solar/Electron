from can_device import CANDevice


def init_can_devices():
    battery = CANDevice("BATTERY",
                        [0x002, 0x101, 0x102, 0x103, 0x104, 0x105, 0x106, 0x107, 0x108, 0x109, 0x10A, 0x10C, 0x10D,
                         0x10E, 0x10F, 0x110, 0x209, 0x219],
                        default_data={
                            "BPS_Trip": False,
                            "BPS_All_Clear": False,
                            "HV_Contactor": False,
                            "Array_Contactor": False,
                            "Current": 0,
                            "Voltage_Array": [0] * 32,
                            "Temperature_Array": [0] * 32,
                            "SoC": 0,
                            "Charge_Enable": False,
                            "Pack_Voltage": 0,
                            "Voltage_Range": 0,
                            "Average_Temp": 0,
                            "Temperature_Range": 0,
                            "BPS_Fault_State": 0,
                            "Boost_Enable": False,
                        },
                        timeout=0.5)

    def process_battery_message(decoded_message):
        for key, value in decoded_message['msg'].items():
            if key == "Voltage_idx":
                battery.master_data["Voltage_Array"][value] = decoded_message['msg']["Voltage_Value"]
            elif key == "Temperature_idx":
                battery.master_data["Temperature_Array"][value] = decoded_message['msg']["Temperature_Value"]

    battery.custom_message_processor = process_battery_message

    def reset_battery():
        battery.master_data["BPS_Trip"] = False
        battery.master_data["BPS_All_Clear"] = False
        battery.master_data["HV_Contactor"] = False
        battery.master_data["Array_Contactor"] = False
        battery.master_data["BPS_Fault_State"] = 0
        battery.master_data["Boost_Enable"] = False

    battery.reset = reset_battery

    mpptA = CANDevice("MPPT_A",
                      [0x200, 0x201],
                      default_data={
                          "MPPT_Enabled": False,
                          "MPPT_HeatsinkTemperature": 0,
                          "MPPT_AmbientTemperature": 0,
                          "MPPT_Fault": 0,
                          "MPPT_Mode": 0,
                          "MPPT_Iout": 0,
                          "MPPT_Vout": 0,
                          "MPPT_Iin": 0,
                          "MPPT_Vin": 0,
                      },
                      timeout=0.5)

    mpptB = CANDevice("MPPT_B",
                      [0x210, 0x211],
                      default_data={
                          "MPPT_Enabled": False,
                          "MPPT_HeatsinkTemperature": 0,
                          "MPPT_AmbientTemperature": 0,
                          "MPPT_Fault": "",
                          "MPPT_Mode": "",
                          "MPPT_Iout": 0,
                          "MPPT_Vout": 0,
                          "MPPT_Iin": 0,
                          "MPPT_Vin": 0,
                      },
                      timeout=0.5)

    def reset_MPPT(mppt):
        mppt.master_data["MPPT_Enabled"] = False
        mppt.master_data["MPPT_Fault"] = 0
        mppt.master_data["MPPT_Mode"] = 1000

    mpptA.reset = lambda: reset_MPPT(mpptA)
    mpptB.reset = lambda: reset_MPPT(mpptB)

    CANDevice("MOTOR_CONTROLLER", [
        0x240, 0x241, 0x242, 0x243, 0x244, 0x245, 0x246, 0x247, 0x248, 0x249, 0x24B, 0x24C, 0x24E
    ],
              default_data={
                  "TritiumID": "",
                  "SerialNumber": "",
                  "LimitIpmOrMotorTemp": False,
                  "LimitBusVoltageLower": False,
                  "LimitBusVoltageUpper": False,
                  "LimitBusCurrent": False,
                  "LimitVelocity": False,
                  "LimitMotorCurrent": False,
                  "LimitOutputVoltagePWM": False,
                  "ErrorMotorOverSpeed": False,
                  "ErrorDesaturationFault": False,
                  "Error15vRailUnderVoltage": False,
                  "ErrorConfigRead": False,
                  "ErrorWatchdogCausedLastReset": False,
                  "ErrorBadMotorPositionHallSeq": False,
                  "ErrorDcBusOverVoltage": False,
                  "ErrorSoftwareOverCurrent": False,
                  "ErrorHardwareOverCurrent": False,
                  "ActiveMotor": 0,
                  "TxErrorCount": 0,
                  "RxErrorCount": 0,
                  "BusVoltage": 0,
                  "BusCurrent": 0,
                  "MotorVelocity": 0,
                  "VehicleVelocity": 0,
                  "PhaseCurrentB": 0,
                  "PhaseCurrentC": 0,
                  "Vq": 0,
                  "Vd": 0,
                  "Iq": 0,
                  "Id": 0,
                  "BEMFq": 0,
                  "BEMFd": 0,
                  "Supply15V": 0,
                  "ReservedSupply15V": 0,
                  "Supply1V9": 0,
                  "Supply3V3": 0,
                  "MotorTemp": 0,
                  "HeatsinkTemp": 0,
                  "DspBoardTemp": 0,
                  "Odometer": 0,
                  "DCBusAh": 0
              },
              timeout=0.5)

    CANDevice("CONTROLS",
              [0x221, 0x222, 0x581, 0x583, 0x584],
              default_data={
                  "Acceleration_Percentage": 0,
                  "Brake_Percentage": 0,
                  "IGN_Array": False,
                  "IGN_Motor": False,
                  "Forward_Gear": False,
                  "Reverse_Gear": False,
                  "Brake_Light": False,
                  "Motor_Controller_Fault": False,
                  "BPS_Fault": False,
                  "Controls_Fault": False,
                  "Motor_Safe": False,
                  "Motor_Current_Setpoint": 0,
                  "Motor_Velocity_Setpoint": 0,
                  "Motor_Power_Setpoint": 0
              },
              timeout=1)

    contactor = CANDevice("CONTACTOR_DRIVER",
              [0x400, 0x401],
              default_data={
                  "Motor_Precharge_Timeout": False,
                  "Array_Precharge_Timeout": False,
                  "Actual_Motor_Sense": False,
                  "Motor_Sense_Fault": False,
                  "Motor_Precharge_Sense": False,
                  "Motor_Precharge_Sense_Fault": False,
                  "Array_Precharge_Sense": False,
                  "Array_Precharge_Sense_Fault": False,
              },
              timeout=1)


    CANDevice("SUPPLEMENTAL_BATTERY",
              [0x10B],
              default_data={
                  "Supplemental_Voltage": 0
              },
              timeout=2)
