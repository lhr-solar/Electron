"""
AUTO-GENERATED FILE — DO NOT EDIT
UTF-8 SAFE OUTPUT
Provides IDE-autocomplete for ECUs, Messages, and Signals.
"""


class BPS_LVBatteryMonitor:
    SEND_IDS = [267]
    pass

class Controls_MotorCommander:
    SEND_IDS = [545, 546, 547]
    pass

class Telemetry_Leader:
    SEND_IDS = [1793, 1794, 1795, 1796, 1797, 1921, 1930]
    pass

class TPEE_MPPT_B:
    SEND_IDS = [528, 529]
    pass

class Prohelion_WaveSculptor22:
    SEND_IDS = [576, 577, 578, 579, 580, 581, 582, 583, 584, 585, 587, 588, 590, 599]
    pass

class TPEE_MPPT_A:
    SEND_IDS = [512, 513]
    pass

class Power_Precharge:
    SEND_IDS = [1024, 1025]
    pass

class Controls_DriverUserInterface:
    SEND_IDS = [1409, 1411, 1412, 1413]
    pass

class BPS_Leader:
    SEND_IDS = [2, 257, 258, 259, 260, 261, 262, 263, 264, 268, 269, 270, 271, 521, 537]
    pass

class DAQ_RF_Bytes_Transmited:
    ID = 1793
    LENGTH = 4
    ECU = 'Telemetry_Leader'
    class Signals:
        DAQ_Bytes_Transmited = 'DAQ_Bytes_Transmited'

Telemetry_Leader.DAQ_RF_Bytes_Transmited = DAQ_RF_Bytes_Transmited

class DAQ_RF_Transmission_Fail_Count:
    ID = 1794
    LENGTH = 2
    ECU = 'Telemetry_Leader'
    class Signals:
        DAQ_TX_Fail_Count = 'DAQ_TX_Fail_Count'

Telemetry_Leader.DAQ_RF_Transmission_Fail_Count = DAQ_RF_Transmission_Fail_Count

class DAQ_RF_Last_Packet_RSSI:
    ID = 1795
    LENGTH = 1
    ECU = 'Telemetry_Leader'
    class Signals:
        DAQ_RSSI = 'DAQ_RSSI'

Telemetry_Leader.DAQ_RF_Last_Packet_RSSI = DAQ_RF_Last_Packet_RSSI

class DAQ_RF_Good_Packet_RX_Count:
    ID = 1796
    LENGTH = 2
    ECU = 'Telemetry_Leader'
    class Signals:
        DAQ_Good_Packet_Receive_Count = 'DAQ_Good_Packet_Receive_Count'

Telemetry_Leader.DAQ_RF_Good_Packet_RX_Count = DAQ_RF_Good_Packet_RX_Count

class DAQ_RF_MAC_ACK_Failure_Count:
    ID = 1797
    LENGTH = 2
    ECU = 'Telemetry_Leader'
    class Signals:
        DAQ_MAC_ACK_Fail_Count = 'DAQ_MAC_ACK_Fail_Count'

Telemetry_Leader.DAQ_RF_MAC_ACK_Failure_Count = DAQ_RF_MAC_ACK_Failure_Count

class DAQ_LTECellularSignalStrength:
    ID = 1921
    LENGTH = 1
    ECU = 'Telemetry_Leader'
    class Signals:
        DAQ_LTE_RSSI = 'DAQ_LTE_RSSI'

Telemetry_Leader.DAQ_LTECellularSignalStrength = DAQ_LTECellularSignalStrength

class DAQ_ServerHeartbeat:
    ID = 1930
    LENGTH = 1
    ECU = 'Telemetry_Leader'
    class Signals:
        DAQ_Heartbeat = 'DAQ_Heartbeat'

Telemetry_Leader.DAQ_ServerHeartbeat = DAQ_ServerHeartbeat

class Driver_IO_State:
    ID = 1409
    LENGTH = 8
    ECU = 'Controls_DriverUserInterface'
    class Signals:
        Pedal_Accel_Position = 'Pedal_Accel_Position'
        Pedal_Brake_Position = 'Pedal_Brake_Position'
        Ignition_Array = 'Ignition_Array'
        Ignition_Motor = 'Ignition_Motor'
        Driver_Regen = 'Driver_Regen'
        Gear_Forward = 'Gear_Forward'
        Gear_Reverse = 'Gear_Reverse'
        Driver_CruiseControl = 'Driver_CruiseControl'
        Driver_CruiseSet = 'Driver_CruiseSet'
        Brake = 'Brake'

Controls_DriverUserInterface.Driver_IO_State = Driver_IO_State

class Controls_Fault:
    ID = 1411
    LENGTH = 1
    ECU = 'Controls_DriverUserInterface'
    class Signals:
        Controls_FAULT_Generic = 'Controls_FAULT_Generic'
        Controls_FAULT_Motor = 'Controls_FAULT_Motor'
        Controls_FAULT_BPS = 'Controls_FAULT_BPS'
        Controls_FAULT_Pedals = 'Controls_FAULT_Pedals'
        Controls_FAULT_CarCAN = 'Controls_FAULT_CarCAN'
        Controls_FAULT_Internal = 'Controls_FAULT_Internal'
        Controls_FAULT_OS = 'Controls_FAULT_OS'
        Controls_FAULT_Lakshay = 'Controls_FAULT_Lakshay'

Controls_DriverUserInterface.Controls_Fault = Controls_Fault

class Controls_Motor_Safe:
    ID = 1412
    LENGTH = 1
    ECU = 'Controls_DriverUserInterface'
    class Signals:
        Controls_Motor_Safe = 'Controls_Motor_Safe'
        Controls_Motor_Unsafe_Error = 'Controls_Motor_Unsafe_Error'

Controls_DriverUserInterface.Controls_Motor_Safe = Controls_Motor_Safe

class MC_PowerCommand:
    ID = 546
    LENGTH = 4
    ECU = 'Controls_MotorCommander'
    class Signals:
        MC_MotorPowerSetpoint = 'MC_MotorPowerSetpoint'

Controls_MotorCommander.MC_PowerCommand = MC_PowerCommand

class MC_Info:
    ID = 576
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_TritiumID = 'MC_TritiumID'
        MC_SerialNumber = 'MC_SerialNumber'

Prohelion_WaveSculptor22.MC_Info = MC_Info

class MC_Status:
    ID = 577
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_LIMIT_OutputVoltagePWM = 'MC_LIMIT_OutputVoltagePWM'
        MC_LIMIT_MotorCurrent = 'MC_LIMIT_MotorCurrent'
        MC_LIMIT_Velocity = 'MC_LIMIT_Velocity'
        MC_LIMIT_BusCurrent = 'MC_LIMIT_BusCurrent'
        MC_LIMIT_BusVoltageUpper = 'MC_LIMIT_BusVoltageUpper'
        MC_LIMIT_BusVoltageLower = 'MC_LIMIT_BusVoltageLower'
        MC_LIMIT_MotorTemp = 'MC_LIMIT_MotorTemp'
        MC_LIMIT_Reserved = 'MC_LIMIT_Reserved'
        MC_FAULT_HardwareOverCurrent = 'MC_FAULT_HardwareOverCurrent'
        MC_FAULT_SoftwareOverCurrent = 'MC_FAULT_SoftwareOverCurrent'
        MC_FAULT_DcBusOverVoltage = 'MC_FAULT_DcBusOverVoltage'
        MC_FAULT_BadMotorPositionHallSeq = 'MC_FAULT_BadMotorPositionHallSeq'
        MC_FAULT_WatchdogCausedLastReset = 'MC_FAULT_WatchdogCausedLastReset'
        MC_FAULT_ConfigRead = 'MC_FAULT_ConfigRead'
        MC_FAULT_15vRailUnderVoltage = 'MC_FAULT_15vRailUnderVoltage'
        MC_FAULT_DesaturationFault = 'MC_FAULT_DesaturationFault'
        MC_FAULT_MotorOverSpeed = 'MC_FAULT_MotorOverSpeed'
        MC_FAULT_Reserved = 'MC_FAULT_Reserved'
        MC_ActiveMotor = 'MC_ActiveMotor'
        MC_TxErrorCount = 'MC_TxErrorCount'
        MC_RxErrorCount = 'MC_RxErrorCount'

Prohelion_WaveSculptor22.MC_Status = MC_Status

class MC_BusMeasurement:
    ID = 578
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_BusVoltage = 'MC_BusVoltage'
        MC_BusCurrent = 'MC_BusCurrent'

Prohelion_WaveSculptor22.MC_BusMeasurement = MC_BusMeasurement

class MC_VelocityMeasurement:
    ID = 579
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_MotorVelocity = 'MC_MotorVelocity'
        MC_VehicleVelocity = 'MC_VehicleVelocity'

Prohelion_WaveSculptor22.MC_VelocityMeasurement = MC_VelocityMeasurement

class Controls_Pedals_Raw:
    ID = 1413
    LENGTH = 4
    ECU = 'Controls_DriverUserInterface'
    class Signals:
        Pedal_Brake_Raw = 'Pedal_Brake_Raw'
        Pedal_Accel_Raw = 'Pedal_Accel_Raw'

Controls_DriverUserInterface.Controls_Pedals_Raw = Controls_Pedals_Raw

class Precharge_Timeout:
    ID = 1025
    LENGTH = 1
    ECU = 'Power_Precharge'
    class Signals:
        Motor_Precharge_Timeout = 'Motor_Precharge_Timeout'
        Array_Precharge_Timeout = 'Array_Precharge_Timeout'

Power_Precharge.Precharge_Timeout = Precharge_Timeout

class Contactor_State:
    ID = 1024
    LENGTH = 2
    ECU = 'Power_Precharge'
    class Signals:
        Motor_Contactor_State = 'Motor_Contactor_State'
        Motor_Contactor_State_Expected = 'Motor_Contactor_State_Expected'
        Motor_Contactor_Fault = 'Motor_Contactor_Fault'
        Motor_Precharge_State = 'Motor_Precharge_State'
        Motor_Precharge_State_Expected = 'Motor_Precharge_State_Expected'
        Motor_Precharge_Fault = 'Motor_Precharge_Fault'
        Array_Precharge_State = 'Array_Precharge_State'
        Array_Precharge_State_Expected = 'Array_Precharge_State_Expected'
        Array_Precharge_Fault = 'Array_Precharge_Fault'

Power_Precharge.Contactor_State = Contactor_State

class BPS_Trip:
    ID = 2
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        BPS_Trip = 'BPS_Trip'

BPS_Leader.BPS_Trip = BPS_Trip

class BPS_All_Clear:
    ID = 257
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        BPS_AllClear = 'BPS_AllClear'

BPS_Leader.BPS_All_Clear = BPS_All_Clear

class BPS_Contactor_State:
    ID = 258
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        BPS_HVContactors = 'BPS_HVContactors'
        BPS_ArrayContactor = 'BPS_ArrayContactor'

BPS_Leader.BPS_Contactor_State = BPS_Contactor_State

class Battery_Current:
    ID = 259
    LENGTH = 4
    ECU = 'BPS_Leader'
    class Signals:
        Battery_Current = 'Battery_Current'

BPS_Leader.Battery_Current = Battery_Current

class Battery_Voltage_Array:
    ID = 260
    LENGTH = 6
    ECU = 'BPS_Leader'
    class Signals:
        BPS_Module_idx = 'BPS_Module_idx'
        Battery_ModuleVoltage = 'Battery_ModuleVoltage'

BPS_Leader.Battery_Voltage_Array = Battery_Voltage_Array

class Battery_Temperature_Array:
    ID = 261
    LENGTH = 6
    ECU = 'BPS_Leader'
    class Signals:
        BPS_Module_idx = 'BPS_Module_idx'
        Battery_ModuleTemperature = 'Battery_ModuleTemperature'

BPS_Leader.Battery_Temperature_Array = Battery_Temperature_Array

class Battery_SoC:
    ID = 262
    LENGTH = 4
    ECU = 'BPS_Leader'
    class Signals:
        BPS_SoC = 'BPS_SoC'

BPS_Leader.Battery_SoC = Battery_SoC

class BPS_WDog_Trip:
    ID = 263
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        BPS_WDog_Trig = 'BPS_WDog_Trig'

BPS_Leader.BPS_WDog_Trip = BPS_WDog_Trip

class BPS_CAN_Error:
    ID = 264
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        BPS_CANError = 'BPS_CANError'

BPS_Leader.BPS_CAN_Error = BPS_CAN_Error

class Supplemental_Voltage:
    ID = 267
    LENGTH = 2
    ECU = 'BPS_LVBatteryMonitor'
    class Signals:
        Supplemental_Voltage = 'Supplemental_Voltage'

BPS_LVBatteryMonitor.Supplemental_Voltage = Supplemental_Voltage

class BPS_Charge_Enabled:
    ID = 268
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        Battery_ChargeEnabled = 'Battery_ChargeEnabled'

BPS_Leader.BPS_Charge_Enabled = BPS_Charge_Enabled

class Battery_Voltage_Summary:
    ID = 269
    LENGTH = 8
    ECU = 'BPS_Leader'
    class Signals:
        Battery_Voltage = 'Battery_Voltage'
        Battery_VoltageRange = 'Battery_VoltageRange'
        BPS_Module_Voltage_Timestamp = 'BPS_Module_Voltage_Timestamp'

BPS_Leader.Battery_Voltage_Summary = Battery_Voltage_Summary

class Battery_Temperature_Summary:
    ID = 270
    LENGTH = 8
    ECU = 'BPS_Leader'
    class Signals:
        Battery_AverageTemp = 'Battery_AverageTemp'
        Battery_TemperatureRange = 'Battery_TemperatureRange'
        BPS_Module_Temperature_Timestamp = 'BPS_Module_Temperature_Timestamp'

BPS_Leader.Battery_Temperature_Summary = Battery_Temperature_Summary

class BPS_Fault_State:
    ID = 271
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        BPS_Fault = 'BPS_Fault'

BPS_Leader.BPS_Fault_State = BPS_Fault_State

class MC_ResetCommand:
    ID = 547
    LENGTH = 1
    ECU = 'Controls_MotorCommander'
    class Signals:
        MC_Reset = 'MC_Reset'

Controls_MotorCommander.MC_ResetCommand = MC_ResetCommand

class MC_DriveCommand:
    ID = 545
    LENGTH = 8
    ECU = 'Controls_MotorCommander'
    class Signals:
        MC_MotorVelocitySetpoint = 'MC_MotorVelocitySetpoint'
        MC_MotorCurrentSetpoint = 'MC_MotorCurrentSetpoint'

Controls_MotorCommander.MC_DriveCommand = MC_DriveCommand

class MC_PhaseCurrentMeasurement:
    ID = 580
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_PhaseCurrentB = 'MC_PhaseCurrentB'
        MC_PhaseCurrentC = 'MC_PhaseCurrentC'

Prohelion_WaveSculptor22.MC_PhaseCurrentMeasurement = MC_PhaseCurrentMeasurement

class MC_MotorVoltageVectorMeasurement:
    ID = 581
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_Vq = 'MC_Vq'
        MC_Vd = 'MC_Vd'

Prohelion_WaveSculptor22.MC_MotorVoltageVectorMeasurement = MC_MotorVoltageVectorMeasurement

class MC_MotorCurrentVectorMeasurement:
    ID = 582
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_Iq = 'MC_Iq'
        MC_Id = 'MC_Id'

Prohelion_WaveSculptor22.MC_MotorCurrentVectorMeasurement = MC_MotorCurrentVectorMeasurement

class MC_BackEMFMeasurementPrediction:
    ID = 583
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_BEMFq = 'MC_BEMFq'
        MC_BEMFd = 'MC_BEMFd'

Prohelion_WaveSculptor22.MC_BackEMFMeasurementPrediction = MC_BackEMFMeasurementPrediction

class MC_15VRailMeasurement:
    ID = 584
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_Supply15V = 'MC_Supply15V'

Prohelion_WaveSculptor22.MC_15VRailMeasurement = MC_15VRailMeasurement

class MC_3V319VRailMeasurement:
    ID = 585
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_Supply1V9 = 'MC_Supply1V9'
        MC_Supply3V3 = 'MC_Supply3V3'

Prohelion_WaveSculptor22.MC_3V319VRailMeasurement = MC_3V319VRailMeasurement

class MC_Motor_TempMeasurement:
    ID = 587
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_MotorTemp = 'MC_MotorTemp'
        MC_HeatsinkTemp = 'MC_HeatsinkTemp'

Prohelion_WaveSculptor22.MC_Motor_TempMeasurement = MC_Motor_TempMeasurement

class MC_DspBoardTempMeasurement:
    ID = 588
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_DspBoardTemp = 'MC_DspBoardTemp'

Prohelion_WaveSculptor22.MC_DspBoardTempMeasurement = MC_DspBoardTempMeasurement

class MC_OdometerBusAhMeasurement:
    ID = 590
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_TripOdometer = 'MC_TripOdometer'
        MC_DCBusAh = 'MC_DCBusAh'

Prohelion_WaveSculptor22.MC_OdometerBusAhMeasurement = MC_OdometerBusAhMeasurement

class MC_SlipSpeedMeasurement:
    ID = 599
    LENGTH = 8
    ECU = 'Prohelion_WaveSculptor22'
    class Signals:
        MC_SlipSpeed = 'MC_SlipSpeed'

Prohelion_WaveSculptor22.MC_SlipSpeedMeasurement = MC_SlipSpeedMeasurement

class MPPT_B_SetMode:
    ID = 537
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        MPPT_SetMode = 'MPPT_SetMode'

BPS_Leader.MPPT_B_SetMode = MPPT_B_SetMode

class MPPT_A_SetMode:
    ID = 521
    LENGTH = 1
    ECU = 'BPS_Leader'
    class Signals:
        MPPT_SetMode = 'MPPT_SetMode'

BPS_Leader.MPPT_A_SetMode = MPPT_A_SetMode

class MPPT_B_Status:
    ID = 529
    LENGTH = 5
    ECU = 'TPEE_MPPT_B'
    class Signals:
        MPPT_Mode = 'MPPT_Mode'
        MPPT_Fault = 'MPPT_Fault'
        MPPT_Enabled = 'MPPT_Enabled'
        MPPT_AmbientTemperature = 'MPPT_AmbientTemperature'
        MPPT_HeatsinkTemperature = 'MPPT_HeatsinkTemperature'

TPEE_MPPT_B.MPPT_B_Status = MPPT_B_Status

class MPPT_B_Power:
    ID = 528
    LENGTH = 8
    ECU = 'TPEE_MPPT_B'
    class Signals:
        MPPT_Vin = 'MPPT_Vin'
        MPPT_Iin = 'MPPT_Iin'
        MPPT_Vout = 'MPPT_Vout'
        MPPT_Iout = 'MPPT_Iout'

TPEE_MPPT_B.MPPT_B_Power = MPPT_B_Power

class MPPT_A_Status:
    ID = 513
    LENGTH = 5
    ECU = 'TPEE_MPPT_A'
    class Signals:
        MPPT_Mode = 'MPPT_Mode'
        MPPT_Fault = 'MPPT_Fault'
        MPPT_Enabled = 'MPPT_Enabled'
        MPPT_AmbientTemperature = 'MPPT_AmbientTemperature'
        MPPT_HeatsinkTemperature = 'MPPT_HeatsinkTemperature'

TPEE_MPPT_A.MPPT_A_Status = MPPT_A_Status

class MPPT_A_Power:
    ID = 512
    LENGTH = 8
    ECU = 'TPEE_MPPT_A'
    class Signals:
        MPPT_Vin = 'MPPT_Vin'
        MPPT_Iin = 'MPPT_Iin'
        MPPT_Vout = 'MPPT_Vout'
        MPPT_Iout = 'MPPT_Iout'

TPEE_MPPT_A.MPPT_A_Power = MPPT_A_Power

