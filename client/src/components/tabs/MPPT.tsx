import React from 'react';
import {Paper, Typography, Divider, Grid, Container, Box} from "@mui/material";
import StatusDot from "../StatusDot.js";
import {mpptFaultReadable, mpptModeReadable} from "../../utils/deviceStateReadable";

const MPPTStatusPanel = ({label, data}) => (
    <Paper
        elevation={3}
        sx={{
            borderRadius: 3,
            border: "1px solid #333",
            backgroundColor: "background.paper",
            mb: 3
        }}
    >
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, p: 1.5 }}>
            {label}
        </Typography>
        <Divider sx={{ mb: 2 }} />

        <Grid container spacing={4} justifyContent="center" height={"100%"} width={"100%"}>
            {/* Electrical Measurements */}
            <Grid item xs={12} md={6} width={"300px"}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                        Electrical Measurements
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight={500}>
                                Input Voltage
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {data.MPPT_Vin?.toFixed(2)} V
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight={500}>
                                Output Voltage
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {data.MPPT_Vout?.toFixed(2)} V
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight={500}>
                                Input Current
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {data.MPPT_Iin?.toFixed(2)} A
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight={500}>
                                Output Current
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {data.MPPT_Iout?.toFixed(2)} A
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </Grid>

            {/* System Status */}
            <Grid item xs={12} md={6} width={"300px"}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                        System Status
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight={500}>
                                Enabled
                            </Typography>
                            <StatusDot active={data.MPPT_Enabled} />
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight={500}>
                                Mode
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {mpptModeReadable(data.MPPT_Mode)}
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight={500}>
                                Ambient Temp
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {data.MPPT_AmbientTemperature?.toFixed(1)} °C
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" fontWeight={500}>
                                Heatsink Temp
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {data.MPPT_HeatsinkTemperature?.toFixed(1)} °C
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </Grid>

            {/* Fault Status */}
            {data.MPPT_Fault !== 0 && (
                <>
                    <Grid item xs={12}>
                        <Divider sx={{ my: 2 }} />
                    </Grid>

                    <Grid item xs={12}>
                        <Box sx={{
                            p: 2,
                            borderRadius: 2,
                            backgroundColor: 'rgba(244, 67, 54, 0.1)',
                            border: '2px solid #f44336',
                            textAlign: 'center'
                        }}>
                            <Typography variant="h6" sx={{ fontWeight: 600, color: '#f44336' }}>
                                {mpptFaultReadable(data.MPPT_Fault)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Fault Status
                            </Typography>
                        </Box>
                    </Grid>
                </>
            )}
        </Grid>
    </Paper>
);

const MPPT = ({data}) => {
    return (
        <Container sx={{ py: 2, display: "flex", flexDirection: "column", maxHeight: "100%", maxWidth: "100%" }}>
            <MPPTStatusPanel label="MPPT A" data={data.MPPT_A}/>
            <MPPTStatusPanel label="MPPT B" data={data.MPPT_B}/>
        </Container>
    );
};

export default MPPT;