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
            return "Unknown Fault";
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
            return "Unknown Mode";
    }
}

export {
    batteryFaultReadable,
    mpptFaultReadable,
    mpptModeReadable
}