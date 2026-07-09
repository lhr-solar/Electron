# HighNoon CAN -> InfluxDB schema reference

Totals: 7 networks, 123 messages.

InfluxDB: bucket `telemetry_main`, org `LHRS`, Flux.

Tags on every point: `vehicle`(=HighNoon), `network`, `sender`, `message_name`, and `idx` (array msgs only).

Fields = signal names below + always `raw_packet`. measurement = uppercase hex CAN id (no 0x).


## network = `BPSCAN`  (19 messages)


- **BPS_VT0_Voltage_Arr** measurement=`2` (dec 2, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}

- **BPS_VT1_Voltage_Arr** measurement=`3` (dec 3, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}

- **BPS_VT2_Voltage_Arr** measurement=`4` (dec 4, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}

- **BPS_VT3_Voltage_Arr** measurement=`5` (dec 5, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}

- **BPS_VT4_Voltage_Arr** measurement=`6` (dec 6, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}

- **BPS_VT5_Voltage_Arr** measurement=`7` (dec 7, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}

- **BPS_VT6_Voltage_Arr** measurement=`8` (dec 8, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}

- **BPS_VT7_Voltage_Arr** measurement=`9` (dec 9, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}

- **BPS_Pack_Current** measurement=`A` (dec 10, len 5)
    - `BPS_Amperes_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds", "2": "Over-Current (Discharge)", "3": "Over-Current (Charge)", "4": "Message Watchdog"}
    - `Main_Battery_Current` [A] range[-8388.608..8388.607]
    - `FrameID_Amperes` range[0..255]

- **BPS_VT0_Temperature_Arr** measurement=`10` (dec 16, len 7)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_ADC` range[0..4095]

- **BPS_VT1_Temperature_Arr** measurement=`11` (dec 17, len 7)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_ADC` range[0..4095]

- **BPS_VT2_Temperature_Arr** measurement=`12` (dec 18, len 7)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_ADC` range[0..4095]

- **BPS_VT3_Temperature_Arr** measurement=`13` (dec 19, len 7)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_ADC` range[0..4095]

- **BPS_VT4_Temperature_Arr** measurement=`14` (dec 20, len 7)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_ADC` range[0..4095]

- **BPS_VT5_Temperature_Arr** measurement=`15` (dec 21, len 7)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_ADC` range[0..4095]

- **BPS_VT6_Temperature_Arr** measurement=`16` (dec 22, len 7)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_ADC` range[0..4095]

- **BPS_VT7_Temperature_Arr** measurement=`17` (dec 23, len 7)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_ADC` range[0..4095]

- **BPS_Pack_Current_ADC** measurement=`755` (dec 1877, len 3)
    - `Main_Battery_Current_ADC` range[0..4095]
    - `FrameID_Amperes` range[0..255]

- **BPS_Balance_Discharge** measurement=`7A0` (dec 1952, len 1)  [ARRAY idx tag=`BPS_Segment_idx`]
    - `BPS_Tap_idx` range[0..31]

## network = `CarCAN`  (56 messages)


- **BPS_Status** measurement=`1` (dec 1, len 8)
    - `BPS_Fault`  choices={"0": "OK", "1": "Overvoltage", "2": "Undervoltage", "3": "Regen", "4": "Overtemperature", "5": "Elcon", "6": "Array Precharge Timeout", "7": "Internal Watchdog", "8": "Segment Watchdog", "9": "HV Plus Contactor Sense", "10": "HV Minus Contactor Sense", "11": "Array Contactor Sense", "12": "Array Pchg Contactor Sense", "13": "Estop 1", "14": "Estop 2", "15": "Estop 3", "16": "Charging Overcurrent", "17": "Discharging Overcurrent", "18": "Amperes Watchdog"}
    - `BPS_Charge_OK`  choices={"0": "NOT OK", "1": "OK"}
    - `BPS_Regen_OK`  choices={"0": "NOT OK", "1": "OK"}
    - `HV_Plus_Contactor_State`  choices={"0": "Open", "1": "Closed"}
    - `HV_Minus_Contactor_State`  choices={"0": "Open", "1": "Closed"}
    - `Array_Contactor_State`  choices={"0": "Open", "1": "Closed"}
    - `Array_Precharge_Contactor_State`  choices={"0": "Open", "1": "Closed"}
    - `Main_Battery_Voltage` [V] range[0..16777.215]
    - `Main_Battery_Avg_Temperature` [Â°C] range[-327.68..327.67]
    - `BPS_Segment0_Status`  choices={"0": "OK", "1": "FAULT"}
    - `BPS_Segment1_Status`  choices={"0": "OK", "1": "FAULT"}
    - `BPS_Segment2_Status`  choices={"0": "OK", "1": "FAULT"}
    - `BPS_Segment3_Status`  choices={"0": "OK", "1": "FAULT"}
    - `BPS_Segment4_Status`  choices={"0": "OK", "1": "FAULT"}
    - `BPS_Segment5_Status`  choices={"0": "OK", "1": "FAULT"}
    - `BPS_Segment6_Status`  choices={"0": "OK", "1": "FAULT"}
    - `BPS_Segment7_Status`  choices={"0": "OK", "1": "FAULT"}

- **BPS_Voltage_Aggregate_Arr** measurement=`B` (dec 11, len 6)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Voltage_Tap_Fault`  choices={"0": "OK", "1": "BQ I2C Read Error", "2": "Out-of-Bounds", "3": "Over-Voltage", "4": "Under-Voltage", "5": "Message Watchdog"}
    - `BPS_Voltage_Tap_Age` [ms] range[0..65535]

- **BPS_Temperature_Aggregate_Arr** measurement=`C` (dec 12, len 8)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]
    - `BPS_Temperature_Tap_Fault` range[0..255]  choices={"0": "OK", "1": "Out-of-Bounds (Short to GND)", "2": "Out-of-Bounds (Short to VCC)", "3": "Disconnected", "4": "Over-Temperature", "5": "Charge Over-Temperature", "6": "Under-Temperature", "7": "Charge Under-Temperature", "8": "Message Watchdog"}
    - `BPS_Temperature_Tap_Age` [ms] range[0..65535]
    - `FrameID_BPS_Temperature` range[0..255]

- **ChargerInterface_Status** measurement=`E` (dec 14, len 5)
    - `Elcon_VOL_OUT` [V] range[0..6553.5]
    - `Elcon_CUR_OUT` [A] range[0..6553.5]
    - `Elcon_Watchdog` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `Elcon_CMD_TIMEOUT` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `Elcon_START_STATE` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `Elcon_INPUT_VOL_ERROR` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `Elcon_OVER_TEMPERATURE` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `Elcon_HW_FAULT` range[0..1]  choices={"0": "OK", "1": "FAULT"}

- **BPS_Fault_Val_Arr** measurement=`F` (dec 15, len 6)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Voltage_Tap_Data` [V] range[0..65.535]
    - `BPS_Temperature_Tap_Data` [Â°C] range[-8388.608..8388.607]

- **VCU_Status** measurement=`18` (dec 24, len 6)
    - `VCU_FSM_State` range[0..15]  choices={"0": "INIT", "1": "FORWARD_DRIVE", "2": "NEUTRAL_DRIVE", "3": "REVERSE_DRIVE", "4": "REGEN", "5": "CRUISE_CONTROL", "6": "DISABLED", "7": "VEHICLE_NOT_READY"}
    - `Motor_Ready`  choices={"0": "NOT OK", "1": "OK"}
    - `Motor_Precharge_Contactor_State`  choices={"0": "Open", "1": "Closed"}
    - `Motor_Contactor_State`  choices={"0": "Open", "1": "Closed"}
    - `VCU_Driver_Input_Watchdog`  choices={"0": "NOT OK", "1": "OK"}
    - `VCU_Pedals_Watchdog`  choices={"0": "NOT OK", "1": "OK"}
    - `VCU_BPS_Watchdog`  choices={"0": "NOT OK", "1": "OK"}
    - `VCU_Steering_Angle_Watchdog` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `VCU_BPS_FAULT_DETECTED` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_CONTROLS_FAULT_DETECTED` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MTR_FAULT_DETECTED` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_PEDALS_FAULT_DETECTED` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_STEERING_FAULT_DETECTED` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MotorCommandSource` range[0..1]  choices={"0": "VCU", "1": "Tritium External"}
    - `VCU_Regen_Active`  choices={"0": "Inactive", "1": "Active"}
    - `VCU_Regen_OK`  choices={"0": "NOT OK", "1": "OK"}
    - `VCU_MTR_PCHG_TIMEOUT` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MTR_PCHG_CONT_TIMEOUT` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MTR_PCHG_CONT_MISMATCH` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MTR_CONT_MISMATCH` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MTR_CONT_TIMEOUT` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_PCHG_OV` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_PCHG_UV` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MTR_OV` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MTR_UV` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_OTHER_FAULT` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `VCU_MTR_DIR_CHANGE_LOCKOUT` range[0..1]  choices={"0": "Inactive", "1": "Active"}
    - `VCU_TIPPING_WARNING` range[0..1]  choices={"0": "Inactive", "1": "Active"}
    - `VCU_WARN_REGEN_NOT_ALLOW` range[0..1]  choices={"0": "Inactive", "1": "Active"}
    - `VCU_WARN_REGEN_NOT_EN` range[0..1]  choices={"0": "Inactive", "1": "Active"}
    - `VCU_FSM_INP_BRAKE` range[0..1]  choices={"0": "False", "1": "True"}
    - `VCU_FSM_INP_PCHG_OK` range[0..1]  choices={"0": "False", "1": "True"}
    - `VCU_FSM_INP_CRUISE_REQ` range[0..1]  choices={"0": "False", "1": "True"}
    - `VCU_FSM_INP_REGEN_REQ` range[0..1]  choices={"0": "False", "1": "True"}
    - `VCU_FSM_INP_REGEN_ENABLE` range[0..1]  choices={"0": "False", "1": "True"}
    - `VCU_FSM_INP_REGEN_RDY` range[0..1]  choices={"0": "False", "1": "True"}
    - `VCU_FSM_INP_FORWARD` range[0..1]  choices={"0": "False", "1": "True"}
    - `VCU_FSM_INP_NEUTRAL` range[0..1]  choices={"0": "False", "1": "True"}
    - `VCU_FSM_INP_REVERSE` range[0..1]  choices={"0": "False", "1": "True"}

- **Controls_Status** measurement=`19` (dec 25, len 6)
    - `Controls_Leader_Fault`  choices={"0": "OK", "1": "Bosch LWS Watchdog", "2": "BPS Watchdog", "3": "Invalid Driver Inputs", "4": "Lighting Board Fault", "5": "Lighting Board Watchdog"}
    - `LightingBoard_Front_Status`  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `LightingBoard_Left_Status`  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `LightingBoard_Right_Status`  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `LightingBoard_Rear_Status`  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `LightingBoard_Canopy_Status`  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}

- **BPS_Precharge_Voltages** measurement=`20` (dec 32, len 6)
    - `BPS_Precharge_Battery_Voltage` [V] range[0..16777.215]
    - `BPS_Precharge_Array_Voltage` [V] range[0..16777.215]

- **VCU_Precharge_Voltages** measurement=`21` (dec 33, len 6)
    - `VCU_Precharge_Battery_Voltage` [V] range[0..16777.215]
    - `VCU_Precharge_Motor_Voltage` [V] range[0..16777.215]

- **VCU_Power_Request** measurement=`22` (dec 34, len 4)
    - `Power_Request` [A] range[0..150]
    - `Motor_Current_Request` [A] range[0..200]

- **Pedal_Status** measurement=`50` (dec 80, len 6)
    - `AccelPedal_Main_Pos` [%] range[0..100]
    - `AccelPedal_Redundant_Pos` [%] range[0..100]
    - `BrakePedal_Main_Pos` [%] range[0..100]
    - `BrakePedal_Redundant_Pos` [%] range[0..100]
    - `AccelPedal_Main_Fault`  choices={"0": "OK", "1": "FAULT"}
    - `AccelPedal_Redundant_Fault`  choices={"0": "OK", "1": "FAULT"}
    - `BrakePedal_Main_Fault`  choices={"0": "OK", "1": "FAULT"}
    - `BrakePedal_Redundant_Fault`  choices={"0": "OK", "1": "FAULT"}
    - `Brake_Pressure_1_Fault`  choices={"0": "OK", "1": "FAULT"}
    - `Brake_Pressure_2_Fault`  choices={"0": "OK", "1": "FAULT"}
    - `FrameID_Pedals` range[0..255]

- **Driver_Input_Status** measurement=`60` (dec 96, len 2)
    - `Ignition_Array`  choices={"0": "-", "1": "Selected"}
    - `Ignition_Motor`  choices={"0": "-", "1": "Selected"}
    - `Ignition_Off`  choices={"0": "-", "1": "Selected"}
    - `Cruise_Enable`  choices={"0": "Disabled", "1": "Enabled"}
    - `Cruise_Set`  choices={"0": "-", "1": "Pressed"}
    - `Gear_Forward`  choices={"0": "-", "1": "Selected"}
    - `Gear_Neutral`  choices={"0": "-", "1": "Selected"}
    - `Gear_Reverse`  choices={"0": "-", "1": "Selected"}
    - `Hazard_Pressed`  choices={"0": "Off", "1": "On"}
    - `Horn_Pressed`  choices={"0": "Off", "1": "On"}
    - `Blinker_Left`  choices={"0": "-", "1": "Selected"}
    - `Blinker_Right`  choices={"0": "-", "1": "Selected"}
    - `PushToTalk_Pressed`  choices={"0": "-", "1": "Pressed"}
    - `Regen_Activate`  choices={"0": "-", "1": "Pressed"}
    - `Regen_Enable`  choices={"0": "Disabled", "1": "Enabled"}

- **BPS_Command** measurement=`67` (dec 103, len 1)
    - `BPS_Drive_Profile_Enable_Master` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}
    - `BPS_Regen_Allow` range[0..1]  choices={"0": "False", "1": "True"}
    - `BPS_Adv_MPPT_Control` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}
    - `BPS_Soft_Shdn` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}
    - `BPS_Vsag_Compensation` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}

- **BPS_Module_Override** measurement=`69` (dec 105, len 8)
    - `Module0_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module1_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module2_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module3_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module4_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module5_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module6_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module7_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module8_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module9_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module10_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module11_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module12_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module13_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module14_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module15_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module16_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module17_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module18_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module19_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module20_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module21_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module22_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module23_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module24_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module25_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module26_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module27_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module28_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module29_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module30_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module31_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}

- **MPPT_A_PowerMeasurements** measurement=`200` (dec 512, len 8)
    - `MPPT_Input_Voltage` [V] range[-327.68..327.67]
    - `MPPT_Input_Current` [A] range[-16.384..16.3835]
    - `MPPT_Output_Voltage` [V] range[-327.68..327.67]
    - `MPPT_Output_Current` [A] range[-16.384..16.3835]

- **MPPT_A_Status** measurement=`201` (dec 513, len 5)
    - `MPPT_Mode`  choices={"0": "Constant Input Voltage", "1": "Constant Input Current", "2": "Minimum Input Current", "3": "Constant Output Voltage", "4": "Constant Output Current", "5": "Temperature De-Rating", "6": "FAULT"}
    - `MPPT_Fault`  choices={"0": "OK", "1": "Configuration Error", "2": "Input Over Voltage", "3": "Output Over Voltage", "4": "Output Over Current", "5": "Input Over Current", "6": "Input Under Current", "7": "Phase Over Current", "8": "Unknown Fault"}
    - `MPPT_Enabled` range[0..2]  choices={"0": "Disabled", "1": "Enabled", "2": "Enabled - Constant Voltage"}
    - `MPPT_AmbientTemperature` [Â°C] range[-128..127]
    - `MPPT_HeatsinkTemperature` [Â°C] range[-128..127]

- **MPPT_A_SweepMeasurements** measurement=`202` (dec 514, len 6)
    - `MPPT_Sweep_Data_cnt` range[0..127]
    - `MPPT_Sweep_Data_Current` [A] range[-16.384..16.3835]
    - `MPPT_Sweep_Data_Voltage` [V] range[-327.68..327.67]

- **MPPT_A_SetMode** measurement=`209` (dec 521, len 1)
    - `MPPT_Set_Enable` range[0..2]  choices={"0": "Disabled", "1": "Enabled", "2": "Enabled - Constant Voltage"}

- **MPPT_A_PerformSweep** measurement=`210` (dec 528, len 5)
    - `MPPT_Set_Sweep_Start` [V] range[-327.68..327.67]
    - `MPPT_Set_Sweep_End` [A] range[-16.384..16.3835]
    - `MPPT_Set_Sweep_Size` range[4..128]

- **MPPT_A_SetOutputVoltageLimit** measurement=`211` (dec 529, len 2)
    - `MPPT_SetOutputVoltageLimit` [V] range[-327.68..327.67]

- **MPPT_A_SetOutputCurrentLimit** measurement=`212` (dec 530, len 2)
    - `MPPT_SetOutputCurrentLimit` [A] range[-16.384..16.3835]

- **MPPT_B_PowerMeasurements** measurement=`220` (dec 544, len 8)
    - `MPPT_Input_Voltage` [V] range[-327.68..327.67]
    - `MPPT_Input_Current` [A] range[-16.384..16.3835]
    - `MPPT_Output_Voltage` [V] range[-327.68..327.67]
    - `MPPT_Output_Current` [A] range[-16.384..16.3835]

- **MPPT_B_Status** measurement=`221` (dec 545, len 5)
    - `MPPT_Mode`  choices={"0": "Constant Input Voltage", "1": "Constant Input Current", "2": "Minimum Input Current", "3": "Constant Output Voltage", "4": "Constant Output Current", "5": "Temperature De-Rating", "6": "FAULT"}
    - `MPPT_Fault`  choices={"0": "OK", "1": "Configuration Error", "2": "Input Over Voltage", "3": "Output Over Voltage", "4": "Output Over Current", "5": "Input Over Current", "6": "Input Under Current", "7": "Phase Over Current", "8": "Unknown Fault"}
    - `MPPT_Enabled` range[0..2]  choices={"0": "Disabled", "1": "Enabled", "2": "Enabled - Constant Voltage"}
    - `MPPT_AmbientTemperature` [Â°C] range[-128..127]
    - `MPPT_HeatsinkTemperature` [Â°C] range[-128..127]

- **MPPT_B_SweepMeasurements** measurement=`222` (dec 546, len 6)
    - `MPPT_Sweep_Data_cnt` range[0..127]
    - `MPPT_Sweep_Data_Current` [A] range[-16.384..16.3835]
    - `MPPT_Sweep_Data_Voltage` [V] range[-327.68..327.67]

- **MPPT_B_SetMode** measurement=`229` (dec 553, len 1)
    - `MPPT_Set_Enable` range[0..2]  choices={"0": "Disabled", "1": "Enabled", "2": "Enabled - Constant Voltage"}

- **MPPT_B_PerformSweep** measurement=`230` (dec 560, len 5)
    - `MPPT_Set_Sweep_Start` [V] range[-327.68..327.67]
    - `MPPT_Set_Sweep_End` [A] range[-16.384..16.3835]
    - `MPPT_Set_Sweep_Size` range[4..128]

- **MPPT_B_SetOutputVoltageLimit** measurement=`231` (dec 561, len 2)
    - `MPPT_SetOutputVoltageLimit` [V] range[-327.68..327.67]

- **MPPT_B_SetOutputCurrentLimit** measurement=`232` (dec 562, len 2)
    - `MPPT_SetOutputCurrentLimit` [A] range[-16.384..16.3835]

- **MPPT_C_PowerMeasurements** measurement=`240` (dec 576, len 8)
    - `MPPT_Input_Voltage` [V] range[-327.68..327.67]
    - `MPPT_Input_Current` [A] range[-16.384..16.3835]
    - `MPPT_Output_Voltage` [V] range[-327.68..327.67]
    - `MPPT_Output_Current` [A] range[-16.384..16.3835]

- **MPPT_C_Status** measurement=`241` (dec 577, len 5)
    - `MPPT_Mode`  choices={"0": "Constant Input Voltage", "1": "Constant Input Current", "2": "Minimum Input Current", "3": "Constant Output Voltage", "4": "Constant Output Current", "5": "Temperature De-Rating", "6": "FAULT"}
    - `MPPT_Fault`  choices={"0": "OK", "1": "Configuration Error", "2": "Input Over Voltage", "3": "Output Over Voltage", "4": "Output Over Current", "5": "Input Over Current", "6": "Input Under Current", "7": "Phase Over Current", "8": "Unknown Fault"}
    - `MPPT_Enabled` range[0..2]  choices={"0": "Disabled", "1": "Enabled", "2": "Enabled - Constant Voltage"}
    - `MPPT_AmbientTemperature` [Â°C] range[-128..127]
    - `MPPT_HeatsinkTemperature` [Â°C] range[-128..127]

- **MPPT_C_SweepMeasurements** measurement=`242` (dec 578, len 6)
    - `MPPT_Sweep_Data_cnt` range[0..127]
    - `MPPT_Sweep_Data_Current` [A] range[-16.384..16.3835]
    - `MPPT_Sweep_Data_Voltage` [V] range[-327.68..327.67]

- **MPPT_C_SetMode** measurement=`249` (dec 585, len 1)
    - `MPPT_Set_Enable` range[0..2]  choices={"0": "Disabled", "1": "Enabled", "2": "Enabled - Constant Voltage"}

- **MPPT_C_PerformSweep** measurement=`250` (dec 592, len 5)
    - `MPPT_Set_Sweep_Start` [V] range[-327.68..327.67]
    - `MPPT_Set_Sweep_End` [A] range[-16.384..16.3835]
    - `MPPT_Set_Sweep_Size` range[4..128]

- **MPPT_C_SetOutputVoltageLimit** measurement=`251` (dec 593, len 2)
    - `MPPT_SetOutputVoltageLimit` [V] range[-327.68..327.67]

- **MPPT_C_SetOutputCurrentLimit** measurement=`252` (dec 594, len 2)
    - `MPPT_SetOutputCurrentLimit` [A] range[-16.384..16.3835]

- **Supp_Battery_Status** measurement=`300` (dec 768, len 6)
    - `Supplemental_Battery_Fault` range[0..255]  choices={"0": "OK", "1": "Under-Voltage", "2": "Over-Voltage", "3": "Over-Current (Discharge)", "4": "Over-Current (Charge)", "5": "Unknown Fault"}
    - `Supplemental_Battery_Voltage` [V] range[0..30]
    - `Supplemental_Battery_Current` [A] range[-32.768..32.767]
    - `FrameID_Supp` range[0..255]

- **Supp_Charger_Status** measurement=`301` (dec 769, len 6)
    - `Supplemental_Charger_Status` range[0..15]  choices={"0": "Charge Disabled", "1": "Trickle Charging", "2": "Precharge", "3": "Fast Charging", "4": "Taper", "5": "ERROR", "6": "Topping Off", "7": "Done"}
    - `BQ25756E_Error` range[0..7]  choices={"0": "OK", "1": "i2c_error", "2": "Input_UV", "3": "Input_OV", "4": "Battery_OC", "5": "Battery_OV", "6": "Over-Temperature"}
    - `BQ25756E_Watchdog` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `Supplemental_Charge_Current` [A] range[-32.768..32.767]
    - `Supp_Charge_Current_Limit` [mA] range[0..65535]
    - `FrameID_Supp_Charger` range[0..255]

- **Supp_Vicor_Stats** measurement=`302` (dec 770, len 5)
    - `Supplemental_Vicor_Voltage` [V] range[0..65.535]
    - `Supplemental_Vicor_Current` [A] range[-32.768..32.767]
    - `FrameID_Supp_Charger` range[0..255]

- **PDU_Status_Arr** measurement=`350` (dec 848, len 5)  [ARRAY idx tag=`HSS_Channel_idx`]
    - `HSS_Fault`  choices={"0": "OK", "1": "FAULT"}
    - `HSS_Enabled`  choices={"0": "Disabled", "1": "Enabled"}
    - `HSS_Measured_Voltage` [V] range[0..65.535]
    - `HSS_Measured_Current` [A] range[0..65.535]

- **PDU_Set_Switch_Arr** measurement=`351` (dec 849, len 1)  [ARRAY idx tag=`HSS_Channel_idx`]
    - `HSS_SetSwitch`  choices={"0": "Do Nothing", "1": "Toggle On", "2": "Toggle Off"}

- **PDU_Set_Current_Limit_Arr** measurement=`352` (dec 850, len 3)  [ARRAY idx tag=`HSS_Channel_idx`]
    - `HSS_Current_Limit` [A] range[0..8]

- **Pump_Status** measurement=`500` (dec 1280, len 6)
    - `Pump_DutyCycle` range[0..100]
    - `Pump_Fault`  choices={"0": "OK", "1": "FAULT"}
    - `FlowRate_1` [L/min] range[0..65.535]
    - `FlowRate_2` [L/min] range[0..65.535]

- **Coolant_Temperature** measurement=`501` (dec 1281, len 4)
    - `Coolant_Temperature_1` [Â°C] range[-327.68..327.67]
    - `Coolant_Temperature_2` [Â°C] range[-327.68..327.67]

- **Radiator_FanSpeed** measurement=`502` (dec 1282, len 8)
    - `Radiator_Fan_Speed_Measurement_1` [rpm] range[0..65535]
    - `Radiator_Fan_Speed_Measurement_2` [rpm] range[0..65535]
    - `Radiator_Fan_Speed_Target_1` [rpm] range[0..65535]
    - `Radiator_Fan_Speed_Target_2` [rpm] range[0..65535]

- **LV_Carrier_Status** measurement=`600` (dec 1536, len 1)
    - `LTC4421_HVDCDC_Selected` range[0..1]  choices={"0": "-", "1": "Selected"}
    - `LTC4421_HVDCDC_Fault` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `LTC4421_HVDCDC_Valid` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `LTC4421_SuppBatt_Selected` range[0..1]  choices={"0": "-", "1": "Selected"}
    - `LTC4421_SuppBatt_Fault` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `LTC4421_SuppBatt_Valid` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `LV_EN_SupplementalBattery` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}
    - `LV_EN_PowerSupply` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}

- **Brake_Pressure_1** measurement=`650` (dec 1616, len 5)
    - `Brake_Pressure` [PSI] range[0..3000]
    - `Brake_Pressure_ADC` range[0..4095]
    - `FrameID_Pedals` range[0..255]

- **Brake_Pressure_2** measurement=`651` (dec 1617, len 5)
    - `Brake_Pressure` [PSI] range[0..3000]
    - `Brake_Pressure_ADC` range[0..4095]
    - `FrameID_Pedals` range[0..255]

- **BPS_Command_Ack** measurement=`667` (dec 1639, len 1)
    - `BPS_Drive_Profile_Enable_Master` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}
    - `BPS_Regen_Allow` range[0..1]  choices={"0": "False", "1": "True"}
    - `BPS_Adv_MPPT_Control` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}
    - `BPS_Soft_Shdn` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}
    - `BPS_Vsag_Compensation` range[0..1]  choices={"0": "Disabled", "1": "Enabled"}

- **BPS_Module_Override_Ack** measurement=`669` (dec 1641, len 8)
    - `Module0_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module1_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module2_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module3_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module4_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module5_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module6_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module7_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module8_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module9_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module10_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module11_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module12_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module13_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module14_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module15_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module16_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module17_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module18_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module19_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module20_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module21_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module22_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module23_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module24_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module25_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module26_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module27_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module28_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module29_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module30_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}
    - `Module31_Override` range[0..3]  choices={"0": "NORMAL_OPERATION", "1": "VOLTAGE_OVERRIDE", "2": "TEMP_OVERRIDE", "3": "OVERRIDE_ALL"}

- **Display_Status** measurement=`680` (dec 1664, len 2)
    - `Display_FrameRate` [FPS] range[0..60]
    - `Camera_Status_Backup`  choices={"0": "NOT OK", "1": "OK"}
    - `Camera_Status_Left`  choices={"0": "NOT OK", "1": "OK"}
    - `Camera_Status_Right`  choices={"0": "NOT OK", "1": "OK"}

- **Telemetry_Heartbeat** measurement=`700` (dec 1792, len 1)
    - `Telemetry_Heartbeat` range[0..1]

- **BPS_Temp_ADC_Aggregate_Arr** measurement=`750` (dec 1872, len 4)  [ARRAY idx tag=`BPS_Tap_idx`]
    - `BPS_Temperature_Tap_ADC` range[0..4095]
    - `FrameID_BPS_Temperature` range[0..255]

- **Supp_Measurements_ADC** measurement=`751` (dec 1873, len 5)
    - `Supp_Battery_Voltage_ADC` range[0..4095]
    - `Supp_Battery_Current_ADC` range[0..4095]
    - `FrameID_Supp` range[0..255]

- **Supp_Vicor_Measurements_ADC** measurement=`752` (dec 1874, len 5)
    - `Supp_Vicor_Voltage_ADC` range[0..4095]
    - `Supp_Vicor_Current_ADC` range[0..4095]
    - `FrameID_Supp_Charger` range[0..255]

- **Pedal_Brake_ADC** measurement=`753` (dec 1875, len 4)
    - `BrakePedal_Main_ADC` range[0..4095]
    - `BrakePedal_Redundant_ADC` range[0..4095]
    - `FrameID_Pedals` range[0..255]

- **Pedal_Accel_ADC** measurement=`754` (dec 1876, len 4)
    - `AccelPedal_Main_ADC` range[0..4095]
    - `AccelPedal_Redundant_ADC` range[0..4095]
    - `FrameID_Pedals` range[0..255]

## network = `DAqCAN`  (19 messages)


- **TelemLeader_Center** measurement=`1000` (dec 4096, len 8)
    - `Timestamp` range[0..65535]

- **IMU_Accel_FR** measurement=`11A0` (dec 4512, len 8)
    - `Timestamp` range[0..65535]
    - `Accel_X` range[0..65535]
    - `Accel_Y` range[0..65535]
    - `Accel_Z` range[0..65535]

- **IMU_Gyro_FR** measurement=`11A1` (dec 4513, len 8)
    - `Timestamp` range[0..65535]
    - `Gyro_X` range[0..65535]
    - `Gyro_Y` range[0..65535]
    - `Gyro_Z` range[0..65535]

- **IMU_Accel_Back** measurement=`11B0` (dec 4528, len 8)
    - `Timestamp` range[0..65535]
    - `Accel_X` range[0..65535]
    - `Accel_Y` range[0..65535]
    - `Accel_Z` range[0..65535]

- **IMU_Gyro_Back** measurement=`11B1` (dec 4529, len 8)
    - `Timestamp` range[0..65535]
    - `Gyro_X` range[0..65535]
    - `Gyro_Y` range[0..65535]
    - `Gyro_Z` range[0..65535]

- **IMU_Accel_FL** measurement=`11D0` (dec 4560, len 8)
    - `Timestamp` range[0..65535]
    - `Accel_X` range[0..65535]
    - `Accel_Y` range[0..65535]
    - `Accel_Z` range[0..65535]

- **IMU_Gyro_FL** measurement=`11D1` (dec 4561, len 8)
    - `Timestamp` range[0..65535]
    - `Gyro_X` range[0..65535]
    - `Gyro_Y` range[0..65535]
    - `Gyro_Z` range[0..65535]

- **Suspension_FR** measurement=`12A0` (dec 4768, len 8)
    - `Timestamp` range[0..65535]
    - `SUS_Data1` range[0..4095]
    - `SUS_Data2` range[0..4095]
    - `SUS_Data3` range[0..4095]
    - `SUS_Data4` range[0..4095]

- **Suspension_Back** measurement=`12B0` (dec 4784, len 8)
    - `Timestamp` range[0..65535]
    - `SUS_Data1` range[0..4095]
    - `SUS_Data2` range[0..4095]
    - `SUS_Data3` range[0..4095]
    - `SUS_Data4` range[0..4095]

- **Suspension_FL** measurement=`12D0` (dec 4816, len 8)
    - `Timestamp` range[0..65535]
    - `SUS_Data1` range[0..4095]
    - `SUS_Data2` range[0..4095]
    - `SUS_Data3` range[0..4095]
    - `SUS_Data4` range[0..4095]

- **Pitot_FR** measurement=`13A0` (dec 5024, len 8)
    - `Pitot_Data1` range[0..4095]
    - `Pitot_Data2` range[0..4095]
    - `Pitot_Data3` range[0..4095]
    - `Pitot_Data4` range[0..4095]
    - `Timestamp` range[0..65535]

- **Pitot_FL** measurement=`13D0` (dec 5072, len 8)
    - `Pitot_Data1` range[0..4095]
    - `Pitot_Data2` range[0..4095]
    - `Pitot_Data3` range[0..4095]
    - `Pitot_Data4` range[0..4095]
    - `Timestamp` range[0..65535]

- **WheelRPM_FR** measurement=`14A0` (dec 5280, len 8)
    - `RPM` range[0..65535]
    - `Timestamp` range[0..65535]

- **WheelRPM_FL** measurement=`14D0` (dec 5328, len 8)
    - `RPM` range[0..65535]
    - `Timestamp` range[0..65535]

- **RideHeight_FR** measurement=`15A0` (dec 5536, len 8)
    - `Timestamp` range[0..65535]
    - `RH_Data3` range[0..65535]
    - `RH_Data2` range[0..65535]
    - `RH_Data1` range[0..65535]

- **RideHeight_Back** measurement=`15B0` (dec 5552, len 8)
    - `Timestamp` range[0..65535]
    - `RH_Data3` range[0..65535]
    - `RH_Data2` range[0..65535]
    - `RH_Data1` range[0..65535]

- **RideHeight_FL** measurement=`15D0` (dec 5584, len 8)
    - `Timestamp` range[0..65535]
    - `RH_Data3` range[0..65535]
    - `RH_Data2` range[0..65535]
    - `RH_Data1` range[0..65535]

- **Temp_1_Center** measurement=`17C0` (dec 6080, len 8)
    - `Temperature` range[0..65535]
    - `Humidity` range[0..65535]
    - `Timestamp` range[0..65535]

- **Temp_2_Center** measurement=`17C1` (dec 6081, len 8)
    - `Temperature` range[0..65535]
    - `Humidity` range[0..65535]
    - `Timestamp` range[0..65535]

## network = `ElconCAN`  (3 messages)


- **Elcon_Control** measurement=`1806E5F4` (dec 403105268, len 5)
    - `Elcon_VOL_SET` [V] range[0..6553.5]
    - `Elcon_CUR_SET` [A] range[0..6553.5]
    - `Elcon_CONTROL_FLAG` range[0..255]

- **Elcon_Control_Mux** measurement=`1806E6F4` (dec 403105524, len 8)  [MULTIPLEXED]
    - `Elcon_AH_NOMINAL` [Ah] range[0..6553.5] muxPage=[2]
    - `Elcon_BATTERY_VOL` [V] range[0..6553.5] muxPage=[4]
    - `Elcon_MAX_CELL_VOL` [V] range[0..6553.5] muxPage=[3]
    - `Elcon_NUM_CELLS_EXT` range[0..255] muxPage=[5]
    - `Elcon_VOL_SET` [V] range[0..6553.5] muxPage=[1]
    - `Elcon_AH_ACTUAL` [Ah] range[0..6553.5] muxPage=[2]
    - `Elcon_BATTERY_CHARGE_CUR` [A] range[0..6553.5] muxPage=[4]
    - `Elcon_CUR_SET` [A] range[0..6553.5] muxPage=[1]
    - `Elcon_MIN_CELL_VOL` [V] range[0..6553.5] muxPage=[3]
    - `Elcon_BATTERY_SOC` [%] range[0..100] muxPage=[4]
    - `Elcon_CELL_OV_THRESH` [V] range[0..6553.5] muxPage=[2]
    - `Elcon_CELL_UV_THRESH` [V] range[0..6553.5] muxPage=[3]
    - `Elcon_CONTROL_FLAG` range[0..255] muxPage=[1]
    - `Elcon_DISCUR_MAX` [A] range[0..2550] muxPage=[1]
    - `Elcon_TEMP_MAX` [Â°C] range[0..255] muxPage=[4]
    - `Elcon_NUM_CELLS` range[0..255] muxPage=[2]
    - `Elcon_TEMP_MIN` [Â°C] range[0..255] muxPage=[4]
    - `Elcon_BATTERY_STATE_UV` range[0..1] muxPage=[3]
    - `Elcon_BATTERY_STATE_OV` range[0..1] muxPage=[3]
    - `Elcon_MuxPage` range[0..255]  choices={"1": "Page 1", "2": "Page 2", "3": "Page 3", "4": "Page 4", "5": "Page 5"}

- **Elcon_CCS_Status** measurement=`18FF50E5` (dec 419385573, len 5)
    - `Elcon_VOL_OUT` [V] range[0..6553.5]
    - `Elcon_CUR_OUT` [A] range[0..6553.5]
    - `Elcon_CMD_TIMEOUT` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `Elcon_START_STATE` range[0..1]  choices={"0": "NOT OK", "1": "OK"}
    - `Elcon_INPUT_VOL_ERROR` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `Elcon_OVER_TEMPERATURE` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `Elcon_HW_FAULT` range[0..1]  choices={"0": "OK", "1": "FAULT"}

## network = `LightingCAN`  (6 messages)


- **Lighting_Command** measurement=`660` (dec 1632, len 1)
    - `Lighting_Set_Headlights` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Set_Left_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Set_Right_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Blink_Sync` range[0..1]
    - `Lighting_Set_Brake` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Set_BPS_Strobe` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Set_Custom_Mode` range[0..1]  choices={"0": "Off", "1": "Mode 1 Active", "2": "Mode 2 Active", "3": "Mode 3 Active"}

- **Lighting_Front_Status** measurement=`670` (dec 1648, len 8)
    - `Lighting_Board_Fault` range[0..255]  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `Light_Headlight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Left_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Right_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_BPS_Strobe` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Brakelight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_CustomMode` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Addr_LED_Current` [A] range[0..4.095]
    - `Lighting_LED0_Current` [A] range[0..65.535]
    - `Lighting_LED1_Current` [A] range[0..65.535]

- **Lighting_Left_Status** measurement=`671` (dec 1649, len 8)
    - `Lighting_Board_Fault` range[0..255]  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `Light_Headlight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Left_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Right_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_BPS_Strobe` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Brakelight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_CustomMode` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Addr_LED_Current` [A] range[0..4.095]
    - `Lighting_LED0_Current` [A] range[0..65.535]
    - `Lighting_LED1_Current` [A] range[0..65.535]

- **Lighting_Rear_Status** measurement=`672` (dec 1650, len 8)
    - `Lighting_Board_Fault` range[0..255]  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `Light_Headlight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Left_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Right_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_BPS_Strobe` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Brakelight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_CustomMode` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Addr_LED_Current` [A] range[0..4.095]
    - `Lighting_LED0_Current` [A] range[0..65.535]
    - `Lighting_LED1_Current` [A] range[0..65.535]

- **Lighting_Right_Status** measurement=`673` (dec 1651, len 8)
    - `Lighting_Board_Fault` range[0..255]  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `Light_Headlight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Left_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Right_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_BPS_Strobe` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Brakelight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_CustomMode` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Addr_LED_Current` [A] range[0..4.095]
    - `Lighting_LED0_Current` [A] range[0..65.535]
    - `Lighting_LED1_Current` [A] range[0..65.535]

- **Lighting_Canopy_Status** measurement=`674` (dec 1652, len 8)
    - `Lighting_Board_Fault` range[0..255]  choices={"0": "OK", "1": "Addr LED Undercurrent", "2": "LED0 Undercurrent", "3": "LED1 Undercurrent", "4": "Addr LED Overcurrent", "5": "LED0 Overcurrent", "6": "LED1 Overcurrent", "7": "Light Command Watchdog", "8": "Watchdog"}
    - `Light_Headlight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Left_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Right_Indicator` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_BPS_Strobe` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_Brakelight` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Light_CustomMode` range[0..1]  choices={"0": "Off", "1": "On"}
    - `Lighting_Addr_LED_Current` [A] range[0..4.095]
    - `Lighting_LED0_Current` [A] range[0..65.535]
    - `Lighting_LED1_Current` [A] range[0..65.535]

## network = `MotorCAN`  (18 messages)


- **MC_DriveCommand** measurement=`401` (dec 1025, len 8)
    - `MC_MotorVelocitySetpoint` [rpm] range[0..12000]
    - `MC_MotorCurrentSetpoint` [%] range[0..1]

- **MC_PowerCommand** measurement=`402` (dec 1026, len 4)
    - `MC_MotorPowerSetpoint` [%] range[0..1]

- **MC_ResetCommand** measurement=`403` (dec 1027, len 1)
    - `MC_Reset`

- **MC_Info** measurement=`420` (dec 1056, len 8)
    - `MC_TritiumID`
    - `MC_SerialNumber`

- **MC_Status** measurement=`421` (dec 1057, len 8)
    - `MC_LIMIT_OutputVoltagePWM` range[0..1]  choices={"0": "OK", "1": "LIMIT"}
    - `MC_LIMIT_MotorCurrent` range[0..1]  choices={"0": "OK", "1": "LIMIT"}
    - `MC_LIMIT_Velocity` range[0..1]  choices={"0": "OK", "1": "LIMIT"}
    - `MC_LIMIT_BusCurrent` range[0..1]  choices={"0": "OK", "1": "LIMIT"}
    - `MC_LIMIT_BusVoltageUpper` range[0..1]  choices={"0": "OK", "1": "LIMIT"}
    - `MC_LIMIT_BusVoltageLower` range[0..1]  choices={"0": "OK", "1": "LIMIT"}
    - `MC_LIMIT_MotorTemp` range[0..1]  choices={"0": "OK", "1": "LIMIT"}
    - `MC_LIMIT_Reserved` range[0..511]  choices={"0": "OK", "1": "LIMIT"}
    - `MC_FAULT_HardwareOverCurrent` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_SoftwareOverCurrent` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_DcBusOverVoltage` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_BadMotorPositionHallSeq` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_WatchdogCausedLastReset` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_ConfigRead` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_15vRailUnderVoltage` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_DesaturationFault` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_MotorOverSpeed` range[0..1]  choices={"0": "OK", "1": "FAULT"}
    - `MC_FAULT_Reserved`  choices={"0": "OK", "1": "FAULT"}
    - `MC_ActiveMotor`
    - `MC_TxErrorCount`
    - `MC_RxErrorCount`

- **MC_BusMeasurement** measurement=`422` (dec 1058, len 8)
    - `MC_BusVoltage` [V]
    - `MC_BusCurrent` [A]

- **MC_VelocityMeasurement** measurement=`423` (dec 1059, len 8)
    - `MC_MotorVelocity` [rpm]
    - `MC_VehicleVelocity` [m/s]

- **MC_PhaseCurrentMeasurement** measurement=`424` (dec 1060, len 8)
    - `MC_PhaseCurrentB` [A_rms]
    - `MC_PhaseCurrentC` [A_rms]

- **MC_MotorVoltageVectorMeasurement** measurement=`425` (dec 1061, len 8)
    - `MC_Vq` [V]
    - `MC_Vd` [V]

- **MC_MotorCurrentVectorMeasurement** measurement=`426` (dec 1062, len 8)
    - `MC_Iq` [A]
    - `MC_Id` [A]

- **MC_BackEMFMeasurementPrediction** measurement=`427` (dec 1063, len 8)
    - `MC_BEMFq` [V]
    - `MC_BEMFd` [V]

- **MC_15V_RailMeasurement** measurement=`428` (dec 1064, len 8)
    - `MC_Supply15V` [V]

- **MC_3V3_19V_RailMeasurement** measurement=`429` (dec 1065, len 8)
    - `MC_Supply1V9` [V]
    - `MC_Supply3V3` [V]

- **MC_Motor_TempMeasurement** measurement=`42B` (dec 1067, len 8)
    - `MC_MotorTemp` [Â°C]
    - `MC_HeatsinkTemp` [Â°C]

- **MC_DspBoardTempMeasurement** measurement=`42C` (dec 1068, len 8)
    - `MC_DspBoardTemp` [Â°C]

- **MC_OdometerBusAhMeasurement** measurement=`42E` (dec 1070, len 8)
    - `MC_TripOdometer` [m]
    - `MC_DCBusAh` [Ah]

- **MC_SlipSpeedMeasurement** measurement=`437` (dec 1079, len 8)
    - `MC_SlipSpeed` [Hz]

- **Set_Motor_Cmd_Src** measurement=`7A1` (dec 1953, len 1)
    - `Motor_Command_Source` range[0..1]  choices={"0": "VCU", "1": "Tritium External"}

## network = `SteeringCAN`  (2 messages)


- **LWS_Standard** measurement=`2B0` (dec 688, len 5)
    - `LWS_Angle` [Â°] range[-780..780]
    - `LWS_Speed` [Â°/s] range[0..1016]
    - `LWS_Fault` range[0..1]  choices={"0": "OK", "1": "Internal Fault"}
    - `LWS_CalibrationStaus` range[0..1]  choices={"0": "Sensor Not Calibrated", "1": "Sensor Calibrated"}
    - `LWS_Trimming_Status` range[0..1]  choices={"0": "FAULT - Sensor Not Trimmed", "1": "Sensor Trimmed"}
    - `LWS_SF1_5` range[0..31]
    - `LWS_MSG_CNT` range[0..15]
    - `LWS_CHK_SUM` range[0..15]

- **LWS_Config** measurement=`7C0` (dec 1984, len 2)
    - `LWS_CCW` range[0..15]  choices={"3": "Sets the signal LWS_Angle to 0Â°", "5": "Resets calibration status"}
    - `LWS_RES` range[0..4095]