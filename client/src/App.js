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
import Controls from "./components/tabs/Controls";
import ContactorDriver from "./components/tabs/ContactorDriver";

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
        server: false,
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
        });


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

    useEffect(() => {
        console.log(mpptData)
    }, [mpptData])

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    const handleBatteryReset = () => {
        socket.emit('bps_reset');
        setBatteryData({
            ...batteryData,
            BPS_Trip: true,
            BPS_Fault_State: 0,
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
                        {label: "Driver Controls", status: [connectionState.driver_controls]},
                        {label: "HV Control", status: [connectionState.contactor_driver]},
                        {label: "Supplemental Battery", status: [connectionState.supplemental_battery]},
                    ]
                }
                          activeTab={activeTab}
                          handleTabChange={handleTabChange}
                          serverStatus={connectionState.server}
                          candapterStatus={connectionState.candapter}
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
                        activeTab === 1 && <Battery data={batteryData} />
                    }
                    {
                        activeTab === 2 && <MPPT data = {mpptData} />
                    }
                    {
                        activeTab === 3 && <MotorController/>
                    }
                    {
                        activeTab === 4 && <Controls/>
                    }
                    {
                        activeTab === 5 && <ContactorDriver/>
                    }
                </div>
            </ThemeProvider>
        </div>
    );
}

export default App;