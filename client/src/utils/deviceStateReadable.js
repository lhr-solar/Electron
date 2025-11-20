const batteryFaultReadable = (faultCode) => {
    switch (faultCode) {
        case 0:
            return " ";
        case 1:
            return "Under Voltage Fault";
        case 2:
            return "Over Voltage Fault";
        case 3:
            return "Over Temperature Fault";
        case 4:
            return "Over Current Fault";
        case 5:
            return "Open Wire Fault";
        case 6:
            return "Handler Fault";
        case 7:
            return "OS Fault";
        case 8:
            return "Watchdog Fault";
        case 9:
            return "CRC (IsoSPI) Fault";
        case 10:
            return "E-STOP/Contactor Fault";
        case 11:
            return "MPPT Fault";
        default:
            return "Unknown Fault";
    }
}

const mpptFaultReadable = (faultCode) => {
    switch (faultCode) {
        case 0:
            return " ";
        case 1:
            return "Config Error";
        case 2:
            return "Input Over Voltage";
        case 3:
            return "Output Over Voltage";
        case 4:
            return "Output Over Current";
        case 5:
            return "Input Over Current";
        case 6:
            return "Input Under Current";
        case 7:
            return "Phase Over Current";
        case 8:
            return "Generic Fault";
        default:
            return faultCode;
    }
}

const mpptModeReadable = (mode) => {
    switch (mode) {
        case 0:
            return "Constant Input Voltage";
        case 1:
            return "Constant Input Current";
        case 2:
            return "Minimum Input Current";
        case 3:
            return "Constant Output Voltage";
        case 4:
            return "Constant Output Current";
        case 5:
            return "Temperature Derating";
        default:
            return mode;
    }
}

const contactorFaultReadable = (data) => {
    if (data.Motor_Precharge_Timeout) {
        return "Motor Precharge Timeout"
    } else if (data. Array_Precharge_Timeout) {
        return "Array Precharge Timeout"
    } else if (data.Motor_Sense_Fault) {
        return "Motor Contactor Sense Fault"
    } else if (data.Motor_Precharge_Sense_Fault) {
        return "Motor Precharge Contactor Sense Fault"
    } else if (data.Array_Precharge_Sense_Fault) {
        return "Array Precharge Contactor Sense Fault"
    } else {
        return "No Fault"
    }
}

export {
    batteryFaultReadable,
    mpptFaultReadable,
    mpptModeReadable,
    contactorFaultReadable
}