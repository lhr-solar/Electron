import React from 'react';
import {Paper, Typography, Divider, Grid, Container} from "@mui/material";
import StatusDot from "../StatusDot";
import {mpptFaultReadable, mpptModeReadable} from "../../utils/deviceStateReadable";

const MPPTStatusPanel = ({label, data}) => (
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
            {label}
        </Typography>
        <Divider sx={{mb: 2, backgroundColor: "#333"}}/>

        <Grid container spacing={3} sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
        }}>
            <Grid item xs={12} md={6} width={"250px"}>
                <Typography variant="body2" mb={1}>
                    Input Voltage: {data.Voltage_Input?.toFixed(2)} V
                </Typography>
                <Typography variant="body2" mb={1}>
                    Output Voltage: {data.Voltage_Output?.toFixed(2)} V
                </Typography>
                <Typography variant="body2" mb={1}>
                    Input Current: {data.Current_Input?.toFixed(2)} A
                </Typography>
                <Typography variant="body2" mb={1}>
                    Output Current: {data.Current_Output?.toFixed(2)} A
                </Typography>
            </Grid>

            <Grid item xs={12} md={6} width={"250px"}>
                <Typography variant="body2" mb={1}>
                    Enabled: <StatusDot active={data.Enabled}/>
                </Typography>
                <Typography variant="body2" mb={1}>
                    Mode: {mpptModeReadable(data.Mode)}
                </Typography>
                <Typography variant="body2" mb={1}>
                    Ambient Temp: {data.Ambient_Temp?.toFixed(1)} °C
                </Typography>
                <Typography variant="body2" mb={1}>
                    Heatsink Temp: {data.Heatsink_Temp?.toFixed(1)} °C
                </Typography>
                {data.Fault !== 0 && (
                    <Typography
                        variant="body2"
                        mb={1}
                        sx={{color: "#f44336", fontWeight: "bold"}}
                    >
                        {mpptFaultReadable(data.Fault)}
                    </Typography>
                )}
            </Grid>
        </Grid>
    </Paper>
);

const MPPT = ({data}) => {
    return (
        <Paper sx={{padding: 2, background: "none", height: "100%", width: "100%"}}>
            <Container sx={{
                py: 4,
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                width: "100%",
                justifyContent: "center",
                alignItems: "center",
            }}>
                <MPPTStatusPanel label="MPPT A" data={data.MPPT_A}/>
                <MPPTStatusPanel label="MPPT B" data={data.MPPT_B}/>
            </Container>
        </Paper>
    );
};

export default MPPT;
