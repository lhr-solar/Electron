import {useEffect, useState} from "react";
import {
    ThemeProvider,
    createTheme,
    CssBaseline,
    Box,
    Grid,
    Paper,
    Typography,
    Container,
    Divider, Button,
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
        Array_Contactor: false,
        HV_Positive_Contactor: false,
        Charge_Enable: false,
        BPS_All_Clear: false,
        Voltage_Array: Array(32).fill(6900),
        SOC: 0,
        Pack_Voltage: 0,
        Temperature_Array: Array(32).fill(4200),
        Voltage_Range: 0,
        Average_Temp: 0,
        Current: 0,
        BPS_Fault_Status: 0,
        Boost_Enable: false,
    })

    const [mpptData, setMPPTData] = useState({
        MPPT_A: {
            Voltage_Input: 0,
            Voltage_Output: 0,
            Current_Input: 0,
            Current_Output: 0,
            Mode: 0,
            Fault: 0,
            Enabled: false,
            Ambient_Temp: 0,
            Heatsink_Temp: 0,

        },
        MPPT_B: {
            Voltage_Input: 0,
            Voltage_Output: 0,
            Current_Input: 0,
            Current_Output: 0,
            Mode: 0,
            Fault: 0,
            Enabled: false,
            Ambient_Temp: 0,
            Heatsink_Temp: 0,
        }
    })

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    return (
        <div className={"App"}>
            <ThemeProvider theme={darkTheme}>
                <CssBaseline/>

                <TitleBar tabs={
                    [
                        {label: "Overview"},
                        {label: "Battery", status: [connectionState.battery]},
                        {label: "TPEE MPPT", status: [connectionState.mppt_a, connectionState.mppt_b]},
                        {label: "Prohelion WaveSculptor22", status: [connectionState.motor_controller]},
                        {label: "Driver Controls", status: [connectionState.driver_controls]},
                        {label: "HV Controls", status: [connectionState.contactor_driver]},
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