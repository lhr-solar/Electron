import React from 'react';
import {Divider, Grid, Paper, Typography, Button, Container} from "@mui/material";

import StatusDot from "../StatusDot";
import {batteryFaultReadable} from "../../utils/deviceStateReadable";

const getSnakingGrid = () => {
    const rows = [];
    for (let row = 0; row < 4; row++) {
        const rowData = [];
        for (let col = 0; col < 8; col++) {
            const index = row * 8 + col;
            rowData.push(index);
        }
        if (row % 2 === 0) {
            rowData.reverse(); // Snake: reverse every other row starting with first
        }
        rows.push(rowData);
    }
    return rows;
};

const BatteryModule = ({index, voltage, temperature}) => (
    <Paper
        elevation={2}
        sx={{
            p: 1.5,
            textAlign: "center",
            height: "90px",
            borderRadius: 2,
            border: "1px solid #333",
            width: "95px"
        }}
    >
        <Typography variant="caption" color="text.secondary">
            Module {index + 1}
        </Typography>
        <Typography variant="body2">{voltage.toFixed(2)} V</Typography>
        <Typography variant="body2">{temperature.toFixed(1)} °C</Typography>
    </Paper>
);

const BatteryStatusPanel = ({
                         data,
                         onReset = () => {
                             console.log("Default Reset system");
                         }
                     }) => (
    <Paper
        elevation={3}
        sx={{
            p: 2,
            mb: 3,
            borderRadius: 2,
            border: "1px solid #333",
            width: "100%",
        }}
    >
        <Typography variant="h6" gutterBottom>
            Battery Status
        </Typography>
        <Divider sx={{mb: 2, backgroundColor: "#333"}}/>

        <Grid container spacing={4} sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: "30px",
        }}>
            {/* Left Column: Boolean Statuses */}
            <Grid item xs={12} md={6} width={"250px"}>
                <Typography variant="body2" mt={1}>
                    BPS Trip: <StatusDot active={!data.BPS_Trip}/>
                </Typography>

                <Typography variant="body2" mt={1}>
                    All Clear: <StatusDot active={data.BPS_All_Clear}/>
                </Typography>
                <Typography variant="body2" mt={1}>
                    MPPT Boost Enabled: <StatusDot active={data.Boost_Enable}/>
                </Typography>
                <Typography variant="body2" mt={1} sx={{
                    color: "#f44336",
                    fontWeight: "bold",
                }}>
                    {data.BPS_Fault_State !== 0 ? batteryFaultReadable(data.BPS_Fault_State) : "⠀"}
                </Typography>
            </Grid>

            <Grid item xs={12} md={6} width={"200px"}>
                <Typography variant="body2" mb={1}>
                    Current: {(data.Current / 1000)?.toFixed(2)} A
                </Typography>

                <Typography variant="body2" mb={1}>
                    Pack Voltage: {(data.Pack_Voltage / 1000)?.toFixed(2)} V
                </Typography>

                <Typography variant="body2" mb={1}>
                    Average Temp: {(data.Average_Temp / 1000)?.toFixed(1)} °C
                </Typography>

                <Typography variant="body2" mb={1}>
                    SoC: {(data.SoC / 1000000)?.toFixed(1)}%
                </Typography>
                <Typography variant="body2" mb={1}>
                    Charging: <StatusDot active={data.Charge_Enable}/>
                </Typography>
            </Grid>

            <Grid item xs={12} md={6} width={"200px"}>
                <Typography variant="body2" mb={1}>
                    +/- Contactor: <StatusDot active={data.HV_Contactor}/> {" "}
                    {data.HV_Contactor ? "Closed" : "Open"}
                </Typography>

                <Typography variant="body2" mb={1}>
                    Array Contactor: <StatusDot active={data.Array_Contactor}/> {" "}
                    {data.Array_Contactor? "Closed" : "Open"}
                </Typography>

            </Grid>

            <Grid
                item
                xs={12}
                md={4}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: {xs: "flex-start", md: "center"},
                }}
                width={"200px"}
            >
                <Button
                    variant="outlined"
                    color="error"
                    onClick={onReset}
                    sx={{
                        borderColor: "#f44336",
                        color: "#f44336",
                        "&:hover": {
                            backgroundColor: "#f44336",
                            color: "#fff",
                        },
                    }}
                >
                    Reset System
                </Button>
            </Grid>
        </Grid>
    </Paper>
);

const Battery = ({data, handleReset}) => {
    const snakingGrid = getSnakingGrid();

    return (
        <Paper sx={{padding: 2, background: "none", height: "100%"}}>
            <Container sx={{
                py: 4,
            }}>
                <BatteryStatusPanel
                    data={data}
                    onReset={handleReset}
                />

                <Grid container direction="column" spacing={2} width="100%">
                    {snakingGrid.map((row, rowIdx) => (
                        <Grid item key={rowIdx}>
                            <Grid container spacing={2} sx={{
                                display: 'flex',
                                width: "100%",
                                justifyContent: 'center',
                                alignItems: 'center',
                                flexDirection: 'row',
                            }}>
                                {row.map((index) => (
                                    <Grid item key={index} xs={{width: "95px"}}>
                                        <BatteryModule
                                            index={index}
                                            voltage={(data.Voltage_Array ? data.Voltage_Array[index] : 0) / 1000}
                                            temperature={(data.Temperature_Array? data.Temperature_Array[index] : 0) / 1000}
                                        />
                                    </Grid>
                                ))}
                            </Grid>
                        </Grid>
                    ))}
                </Grid>
            </Container>
        </Paper>
    );
}

export default Battery;