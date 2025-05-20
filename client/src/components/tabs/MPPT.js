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
                    Input Voltage: {data.MPPT_Vin?.toFixed(2)} V
                </Typography>
                <Typography variant="body2" mb={1}>
                    Output Voltage: {data.MPPT_Vout?.toFixed(2)} V
                </Typography>
                <Typography variant="body2" mb={1}>
                    Input Current: {data.MPPT_Iin?.toFixed(2)} A
                </Typography>
                <Typography variant="body2" mb={1}>
                    Output Current: {data.MPPT_Iout?.toFixed(2)} A
                </Typography>
            </Grid>

            <Grid item xs={12} md={6} width={"250px"}>
                <Typography variant="body2" mb={1}>
                    Enabled: <StatusDot active={data.MPPT_Enabled}/>
                </Typography>
                <Typography variant="body2" mb={1}>
                    Mode: {mpptModeReadable(data.MPPT_Mode)}
                </Typography>
                <Typography variant="body2" mb={1}>
                    Ambient Temp: {data.MPPT_AmbientTemperature?.toFixed(1)} °C
                </Typography>
                <Typography variant="body2" mb={1}>
                    Heatsink Temp: {data. MPPT_HeatsinkTemperature?.toFixed(1)} °C
                </Typography>
                {data.Fault !== 0 && (
                    <Typography
                        variant="body2"
                        mb={1}
                        sx={{color: "#f44336", fontWeight: "bold"}}
                    >
                        {mpptFaultReadable(data.MPPT_Fault)}
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
