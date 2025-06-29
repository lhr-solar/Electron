import React, {useEffect} from 'react';
import {Box, Container, Divider, Grid, Paper, Typography, LinearProgress} from "@mui/material";
import StatusDot from "../StatusDot";

const DriverControls = ({ data }) => {
    useEffect(() => {
        console.log(data)
    }, [data])
    const getGearState = () => {
        if (data.Forward_Gear) return "Forward";
        if (data.Reverse_Gear) return "Reverse";
        return "Neutral";
    };

    const getIgnitionState = () => {
        if (data.IGN_Motor) return "Motor";
        if (data.IGN_Array) return "Array";
        return "Off";
    };

    const gearDisplayColor = {
        Forward: "#4caf50",
        Reverse: "#f44336",
        Neutral: "#ff9800"
    };

    const ignitionDisplayColor = {
        Motor: "#4caf50",
        Array: "#2196f3",
        "Off": "#9e9e9e"
    };

    const gearColor = gearDisplayColor[getGearState()];
    const ignitionColor = ignitionDisplayColor[getIgnitionState()];

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            <Paper
                elevation={3}
                sx={{
                    p: 4,
                    borderRadius: 3,
                    border: "1px solid #333",
                    backgroundColor: "background.paper",
                }}
            >
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                    Driver Controls
                </Typography>
                <Divider sx={{ mb: 4 }} />

                <Grid container spacing={4} justifyContent="center">
                    {/* System Status Section */}
                    <Grid item xs={12} md={6}>
                        <Box sx={{ mb: 3 }} width={"210px"}>
                            <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                                System Status
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Brake Light
                                    </Typography>
                                    <StatusDot active={data.Brake_Light} />
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Motor Safe
                                    </Typography>
                                    <StatusDot active={data.Motor_Safe} />
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Power Setpoint:
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Motor_Power_Setpoint * 100} %
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Velocity Setpoint:
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Motor_Velocity_Setpoint} RPM
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Current Setpoint:
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Motor_Current_Setpoint * 100} %
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Grid>

                    {/* Fault Monitoring Section */}
                    <Grid item xs={12} md={6}>
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                                Fault Monitoring
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Motor Controller
                                    </Typography>
                                    <StatusDot
                                        active={!data.Motor_Controller_Fault}
                                        color={data.Motor_Controller_Fault ? "red" : "green"}
                                    />
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        BPS System
                                    </Typography>
                                    <StatusDot
                                        active={!data.BPS_Fault}
                                        color={data.BPS_Fault ? "red" : "green"}
                                    />
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Controls System
                                    </Typography>
                                    <StatusDot
                                        active={!data.Controls_Fault}
                                        color={data.Controls_Fault ? "red" : "green"}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Grid>

                    {/* Divider */}
                    <Grid item xs={12}>
                        <Divider sx={{ my: 2 }} />
                    </Grid>

                    {/* Control Inputs Section - Full Width Row */}
                    <Grid item xs={12}>
                        <Grid container spacing={4}>
                            {/* Progress Bars */}
                            <Grid item xs={12} md={6} width={"200px"}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                                    <Box sx={{ mb: 3 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2" fontWeight={500}>
                                                Acceleration Pedal
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {Math.round(data.Acceleration_Percentage || 0)}%
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={data.Acceleration_Percentage || 0}
                                            sx={{
                                                height: 12,
                                                borderRadius: 6,
                                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                                '& .MuiLinearProgress-bar': {
                                                    backgroundColor: 'success.main',
                                                    borderRadius: 6,
                                                }
                                            }}
                                        />
                                    </Box>

                                    <Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2" fontWeight={500}>
                                                Brake Pedal
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {Math.round(data.Brake_Percentage || 0)}%
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={data.Brake_Percentage || 0}
                                            sx={{
                                                height: 12,
                                                borderRadius: 6,
                                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                                '& .MuiLinearProgress-bar': {
                                                    backgroundColor: 'error.main',
                                                    borderRadius: 6,
                                                }
                                            }}
                                        />
                                    </Box>
                                </Box>
                            </Grid>

                            {/* Status Indicators */}
                            <Grid item xs={12} md={6}>
                                <Grid container spacing={2} sx={{ height: '100%' }}>
                                    <Grid item xs={6}>
                                        <Box sx={{
                                            p: 2,
                                            borderRadius: 2,
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            border: `2px solid ${gearColor}`,
                                            textAlign: 'center',
                                            height: '100%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center'
                                        }}>
                                            <Typography variant="h6" sx={{ fontWeight: 600, color: gearColor }}>
                                                {getGearState()}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Current Gear
                                            </Typography>
                                        </Box>
                                    </Grid>

                                    <Grid item xs={6}>
                                        <Box sx={{
                                            p: 2,
                                            borderRadius: 2,
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            border: `2px solid ${ignitionColor}`,
                                            textAlign: 'center',
                                            height: '100%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center'
                                        }}>
                                            <Typography variant="h6" sx={{ fontWeight: 600, color: ignitionColor }}>
                                                {getIgnitionState()}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Ignition State
                                            </Typography>
                                        </Box>
                                    </Grid>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </Paper>
        </Container>
    );
};

export default DriverControls;