"""AUTO-GENERATED FILE — DO NOT EDIT"""

# -*- coding: utf-8 -*-

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

    IS_ARRAY_MESSAGE = False

    ECU = 'Telemetry_Leader'

Telemetry_Leader.DAQ_RF_Bytes_Transmited = DAQ_RF_Bytes_Transmited

class DAQ_RF_Transmission_Fail_Count:

    ID = 1794

    IS_ARRAY_MESSAGE = False

    ECU = 'Telemetry_Leader'

Telemetry_Leader.DAQ_RF_Transmission_Fail_Count = DAQ_RF_Transmission_Fail_Count

class DAQ_RF_Last_Packet_RSSI:

    ID = 1795

    IS_ARRAY_MESSAGE = False

    ECU = 'Telemetry_Leader'

Telemetry_Leader.DAQ_RF_Last_Packet_RSSI = DAQ_RF_Last_Packet_RSSI

class DAQ_RF_Good_Packet_RX_Count:

    ID = 1796

    IS_ARRAY_MESSAGE = False

    ECU = 'Telemetry_Leader'

Telemetry_Leader.DAQ_RF_Good_Packet_RX_Count = DAQ_RF_Good_Packet_RX_Count

class DAQ_RF_MAC_ACK_Failure_Count:

    ID = 1797

    IS_ARRAY_MESSAGE = False

    ECU = 'Telemetry_Leader'

Telemetry_Leader.DAQ_RF_MAC_ACK_Failure_Count = DAQ_RF_MAC_ACK_Failure_Count

class DAQ_LTECellularSignalStrength:

    ID = 1921

    IS_ARRAY_MESSAGE = False

    ECU = 'Telemetry_Leader'

Telemetry_Leader.DAQ_LTECellularSignalStrength = DAQ_LTECellularSignalStrength

class DAQ_ServerHeartbeat:

    ID = 1930

    IS_ARRAY_MESSAGE = False

    ECU = 'Telemetry_Leader'

Telemetry_Leader.DAQ_ServerHeartbeat = DAQ_ServerHeartbeat

class Driver_IO_State:

    ID = 1409

    IS_ARRAY_MESSAGE = False

    ECU = 'Controls_DriverUserInterface'

Controls_DriverUserInterface.Driver_IO_State = Driver_IO_State

class Controls_Fault:

    ID = 1411

    IS_ARRAY_MESSAGE = False

    ECU = 'Controls_DriverUserInterface'

Controls_DriverUserInterface.Controls_Fault = Controls_Fault

class Controls_Motor_Safe:

    ID = 1412

    IS_ARRAY_MESSAGE = False

    ECU = 'Controls_DriverUserInterface'

Controls_DriverUserInterface.Controls_Motor_Safe = Controls_Motor_Safe

class MC_PowerCommand:

    ID = 546

    IS_ARRAY_MESSAGE = False

    ECU = 'Controls_MotorCommander'

Controls_MotorCommander.MC_PowerCommand = MC_PowerCommand

class MC_Info:

    ID = 576

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_Info = MC_Info

class MC_Status:

    ID = 577

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_Status = MC_Status

class MC_BusMeasurement:

    ID = 578

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_BusMeasurement = MC_BusMeasurement

class MC_VelocityMeasurement:

    ID = 579

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_VelocityMeasurement = MC_VelocityMeasurement

class Controls_Pedals_Raw:

    ID = 1413

    IS_ARRAY_MESSAGE = False

    ECU = 'Controls_DriverUserInterface'

Controls_DriverUserInterface.Controls_Pedals_Raw = Controls_Pedals_Raw

class Precharge_Timeout:

    ID = 1025

    IS_ARRAY_MESSAGE = False

    ECU = 'Power_Precharge'

Power_Precharge.Precharge_Timeout = Precharge_Timeout

class Contactor_State:

    ID = 1024

    IS_ARRAY_MESSAGE = False

    ECU = 'Power_Precharge'

Power_Precharge.Contactor_State = Contactor_State

class BPS_Trip:

    ID = 2

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.BPS_Trip = BPS_Trip

class BPS_All_Clear:

    ID = 257

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.BPS_All_Clear = BPS_All_Clear

class BPS_Contactor_State:

    ID = 258

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.BPS_Contactor_State = BPS_Contactor_State

class Battery_Current:

    ID = 259

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.Battery_Current = Battery_Current

class Battery_Voltage_Array:

    ID = 260

    IS_ARRAY_MESSAGE = True

    INDEX_SIGNAL_KEY = 'BPS_Volt_Array_idx'

    DATA_SIGNAL_KEYS = ['Battery_ModuleVoltage']

    ECU = 'BPS_Leader'

BPS_Leader.Battery_Voltage_Array = Battery_Voltage_Array

class Battery_Temperature_Array:

    ID = 261

    IS_ARRAY_MESSAGE = True

    INDEX_SIGNAL_KEY = 'BPS_Temp_Array_idx'

    DATA_SIGNAL_KEYS = ['Battery_ModuleTemperature']

    ECU = 'BPS_Leader'

BPS_Leader.Battery_Temperature_Array = Battery_Temperature_Array

class Battery_SoC:

    ID = 262

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.Battery_SoC = Battery_SoC

class BPS_WDog_Trip:

    ID = 263

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.BPS_WDog_Trip = BPS_WDog_Trip

class BPS_CAN_Error:

    ID = 264

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.BPS_CAN_Error = BPS_CAN_Error

class Supplemental_Voltage:

    ID = 267

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_LVBatteryMonitor'

BPS_LVBatteryMonitor.Supplemental_Voltage = Supplemental_Voltage

class BPS_Charge_Enabled:

    ID = 268

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.BPS_Charge_Enabled = BPS_Charge_Enabled

class Battery_Voltage_Summary:

    ID = 269

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.Battery_Voltage_Summary = Battery_Voltage_Summary

class Battery_Temperature_Summary:

    ID = 270

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.Battery_Temperature_Summary = Battery_Temperature_Summary

class BPS_Fault_State:

    ID = 271

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.BPS_Fault_State = BPS_Fault_State

class MC_ResetCommand:

    ID = 547

    IS_ARRAY_MESSAGE = False

    ECU = 'Controls_MotorCommander'

Controls_MotorCommander.MC_ResetCommand = MC_ResetCommand

class MC_DriveCommand:

    ID = 545

    IS_ARRAY_MESSAGE = False

    ECU = 'Controls_MotorCommander'

Controls_MotorCommander.MC_DriveCommand = MC_DriveCommand

class MC_PhaseCurrentMeasurement:

    ID = 580

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_PhaseCurrentMeasurement = MC_PhaseCurrentMeasurement

class MC_MotorVoltageVectorMeasurement:

    ID = 581

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_MotorVoltageVectorMeasurement = MC_MotorVoltageVectorMeasurement

class MC_MotorCurrentVectorMeasurement:

    ID = 582

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_MotorCurrentVectorMeasurement = MC_MotorCurrentVectorMeasurement

class MC_BackEMFMeasurementPrediction:

    ID = 583

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_BackEMFMeasurementPrediction = MC_BackEMFMeasurementPrediction

class MC_15VRailMeasurement:

    ID = 584

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_15VRailMeasurement = MC_15VRailMeasurement

class MC_3V319VRailMeasurement:

    ID = 585

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_3V319VRailMeasurement = MC_3V319VRailMeasurement

class MC_Motor_TempMeasurement:

    ID = 587

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_Motor_TempMeasurement = MC_Motor_TempMeasurement

class MC_DspBoardTempMeasurement:

    ID = 588

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_DspBoardTempMeasurement = MC_DspBoardTempMeasurement

class MC_OdometerBusAhMeasurement:

    ID = 590

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_OdometerBusAhMeasurement = MC_OdometerBusAhMeasurement

class MC_SlipSpeedMeasurement:

    ID = 599

    IS_ARRAY_MESSAGE = False

    ECU = 'Prohelion_WaveSculptor22'

Prohelion_WaveSculptor22.MC_SlipSpeedMeasurement = MC_SlipSpeedMeasurement

class MPPT_B_SetMode:

    ID = 537

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.MPPT_B_SetMode = MPPT_B_SetMode

class MPPT_A_SetMode:

    ID = 521

    IS_ARRAY_MESSAGE = False

    ECU = 'BPS_Leader'

BPS_Leader.MPPT_A_SetMode = MPPT_A_SetMode

class MPPT_B_Status:

    ID = 529

    IS_ARRAY_MESSAGE = False

    ECU = 'TPEE_MPPT_B'

TPEE_MPPT_B.MPPT_B_Status = MPPT_B_Status

class MPPT_B_Power:

    ID = 528

    IS_ARRAY_MESSAGE = False

    ECU = 'TPEE_MPPT_B'

TPEE_MPPT_B.MPPT_B_Power = MPPT_B_Power

class MPPT_A_Status:

    ID = 513

    IS_ARRAY_MESSAGE = False

    ECU = 'TPEE_MPPT_A'

TPEE_MPPT_A.MPPT_A_Status = MPPT_A_Status

class MPPT_A_Power:

    ID = 512

    IS_ARRAY_MESSAGE = False

    ECU = 'TPEE_MPPT_A'

TPEE_MPPT_A.MPPT_A_Power = MPPT_A_Power
