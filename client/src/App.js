import {useEffect, useState} from "react";
import {
    ThemeProvider,
    createTheme,
    CssBaseline,
} from "@mui/material";
import io from 'socket.io-client';
import TitleBar from "./components/TitleBar";
import Battery from "./components/tabs/Battery";
import Overview from "./components/tabs/Overview";
import MPPT from "./components/tabs/MPPT";
import MotorController from "./components/tabs/MotorController";
import DriverControls from "./components/tabs/Controls";
import ContactorDriver from "./components/tabs/ContactorDriver";
import SupplementalBattery from "./components/tabs/SupplementalBattery";

import "./styles/App.css";

const darkTheme = createTheme({
    palette: {
        mode: "dark",
        background: {
            default: "#121212",
            paper: "#1e1e1e",
        },
        primary: {main: "#90caf9"},
        secondary: {main: "#f48fb1"},
    },
    typography: {
        fontFamily: "Inter, Roboto, sans-serif",
    },
});

const socket = io('http://localhost:5000', {
    reconnection: true,
    reconnectionDelay: 1000,
    transports: ['websocket']
});

function App() {
    const [isConnected, setIsConnected] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    const [connectionState, setConnectionStatus] = useState({
        candapter: false,
        battery: false,
        mppt_a: false,
        mppt_b: false,
        motor_controller: false,
        driver_controls: false,
        contactor_driver: false,
        supplemental_battery: false,
    });

    const [batteryData, setBatteryData] = useState({
        BPS_Trip: true,
        BPS_All_Clear: false,
        HV_Contactor: false,
        Array_Contactor: false,
        Current: 0,
        Voltage_Array: Array(32).fill(6900),
        Temperature_Array: Array(32).fill(4200),
        SoC: 0,
        Charge_Enable: false,
        Pack_Voltage: 0,
        Voltage_Range: 0,
        Average_Temp: 0,
        Temperature_Range: 0,
        BPS_Fault_State: 0,
        Boost_Enable: false,
    })

    const [mpptData, setMPPTData] = useState({
        MPPT_A: {
            MPPT_Enabled: false,
            MPPT_HeatsinkTemperature: 0,
            MPPT_AmbientTemperature: 0,
            MPPT_Fault: 0,
            MPPT_Mode: 0,
            MPPT_Iout: 0,
            MPPT_Vout: 0,
            MPPT_Iin: 0,
            MPPT_Vin: 0,
        },
        MPPT_B: {
            MPPT_Enabled: false,
            MPPT_HeatsinkTemperature: 0,
            MPPT_AmbientTemperature: 0,
            MPPT_Fault: 0,
            MPPT_Mode: 0,
            MPPT_Iout: 0,
            MPPT_Vout: 0,
            MPPT_Iin: 0,
            MPPT_Vin: 0,
        }
    })

    const [suppData, setSuppData] = useState({
        Supplemental_Voltage: 0
    })

    const [controlsData, setControlsData] = useState({
        Acceleration_Percentage: 0,
        Brake_Percentage: 0,
        IGN_Array: false,
        IGN_Motor: false,
        Forward_Gear: false,
        Reverse_Gear: false,
        Brake_Light: false,
        Motor_Controller_Fault: false,
        BPS_Fault: false,
        Controls_Fault: false,
        Motor_Safe: false,
        Motor_Current_Setpoint: 0,
        Motor_Velocity_Setpoint: 0,
        Motor_Power_Setpoint: 0
    })

    const [contactorData, setContactorData] = useState({
        Motor_Precharge_Timeout: false,
        Array_Precharge_Timeout: false,
        Actual_Motor_Sense: false,
        Motor_Sense_Fault: false,
        Motor_Precharge_Sense: false,
        Motor_Precharge_Sense_Fault: false,
        Array_Precharge_Sense: false,
        Array_Precharge_Sense_Fault: false
    })

    const [mocoData, setMocoData] = useState({
        TritiumID: "",
        SerialNumber: "",
        LimitIpmOrMotorTemp: false,
        LimitBusVoltageLower: false,
        LimitBusVoltageUpper: false,
        LimitBusCurrent: false,
        LimitVelocity: false,
        LimitMotorCurrent: false,
        LimitOutputVoltagePWM: false,
        ErrorMotorOverSpeed: false,
        ErrorDesaturationFault: false,
        Error15vRailUnderVoltage: false,
        ErrorConfigRead: false,
        ErrorWatchdogCausedLastReset: false,
        ErrorBadMotorPositionHallSeq: false,
        ErrorDcBusOverVoltage: false,
        ErrorSoftwareOverCurrent: false,
        ErrorHardwareOverCurrent: false,
        ActiveMotor: 0,
        TxErrorCount: 0,
        RxErrorCount: 0,
        BusVoltage: 0,
        BusCurrent: 0,
        MotorVelocity: 0,
        VehicleVelocity: 0,
        PhaseCurrentB: 0,
        PhaseCurrentC: 0,
        Vq: 0,
        Vd: 0,
        Iq: 0,
        Id: 0,
        BEMFq: 0,
        BEMFd: 0,
        Supply15V: 0,
        ReservedSupply15V: 0,
        Supply1V9: 0,
        Supply3V3: 0,
        MotorTemp: 0,
        HeatsinkTemp: 0,
        DspBoardTemp: 0,
        Odometer: 0,
        DCBusAh: 0
    })

    const [adapterNick, setAdapterNick] = useState("Unknown")

    useEffect(() => {
        socket.on('connect', () => {
            setIsConnected(true);
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
        });

        socket.on('can_update', (data) => {
            setBatteryData(data["BATTERY"]);
            setMPPTData({
                MPPT_A: data["MPPT_A"],
                MPPT_B: data["MPPT_B"]
            });
            setSuppData(data["SUPPLEMENTAL_BATTERY"])
            setControlsData(data["CONTROLS"])
            setMocoData(data["MOTOR_CONTROLLER"])
            setContactorData(data["CONTACTOR_DRIVER"])
            console.log(data["CONTROLS"])
        });

        socket.on('connection_state', (data) => {
            setConnectionStatus({
                ...connectionState,
                candapter: data["CANDAPTER"],
                battery: data["BATTERY"],
                mppt_a: data["MPPT_A"],
                mppt_b: data["MPPT_B"],
                supplemental_battery: data["SUPPLEMENTAL_BATTERY"],
                controls: data["CONTROLS"],
                motor_controller: data["MOTOR_CONTROLLER"],
                contactor_driver: data["CONTACTOR_DRIVER"],
            })
            setAdapterNick(data["dev_nick"])
        })


        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('can_update');
        };
    }, []);

    useEffect(() => {
        if (isConnected) {
            console.log('Connected to server');
        } else {
            console.log('Disconnected from server');
        }
    }, [isConnected]);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    const handleBatteryReset = () => {
        socket.emit('bps_reset');
        setBatteryData({
            ...batteryData,
            BPS_Trip: false,
            BPS_Fault_State: 0,
            Boost_Enable: false,
        })
    }

    return (
        <div className={"App"}>
            <ThemeProvider theme={darkTheme}>
                <CssBaseline/>

                <TitleBar tabs={
                    [
                        {label: "Home", icon: "home"},
                        {label: "Battery", status: [connectionState.battery]},
                        {label: "TPEE MPPT", status: [connectionState.mppt_a, connectionState.mppt_b]},
                        {label: "Prohelion WaveSculptor22", status: [connectionState.motor_controller]},
                        {label: "Driver Controls", status: [connectionState.controls]},
                        {label: "HV Control", status: [connectionState.contactor_driver]},
                        {label: "Supplemental Battery", status: [connectionState.supplemental_battery]},
                    ]
                }
                          activeTab={activeTab}
                          handleTabChange={handleTabChange}
                          serverStatus={isConnected}
                          candapterStatus={connectionState.candapter}
                          candapterNickname={adapterNick}
                />

                <div style={{
                    height: "100%",
                    backgroundColor: "#252525",
                    width: "100%",
                }}>
                    {
                        activeTab === 0 && <Overview/>
                    }
                    {
                        activeTab === 1 && <Battery data={batteryData} handleReset={handleBatteryReset}/>
                    }
                    {
                        activeTab === 2 && <MPPT data = {mpptData} />
                    }
                    {
                        activeTab === 3 && <MotorController data={mocoData} />
                    }
                    {
                        activeTab === 4 && <DriverControls data={controlsData} />
                    }
                    {
                        activeTab === 5 && <ContactorDriver data={contactorData} />
                    }
                    {
                        activeTab === 6 && <SupplementalBattery data={suppData} />
                    }
                </div>
            </ThemeProvider>
        </div>
    );
}

export default App;