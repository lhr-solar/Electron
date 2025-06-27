import React from 'react';
import { Box, Divider, Paper, Typography, Grid, Container } from "@mui/material";

// Utility function to convert motor controller faults/limits to readable strings
const motorControllerFaultReadable = (mocoData) => {
    // Check errors first (higher priority)
    if (mocoData.ErrorMotorOverSpeed) return "Motor Over Speed Error";
    if (mocoData.ErrorDesaturationFault) return "Desaturation Fault Error";
    if (mocoData.Error15vRailUnderVoltage) return "15V Rail Under Voltage Error";
    if (mocoData.ErrorConfigRead) return "Configuration Read Error";
    if (mocoData.ErrorWatchdogCausedLastReset) return "Watchdog Reset Error";
    if (mocoData.ErrorBadMotorPositionHallSeq) return "Bad Motor Position Hall Sequence Error";
    if (mocoData.ErrorDcBusOverVoltage) return "DC Bus Over Voltage Error";
    if (mocoData.ErrorSoftwareOverCurrent) return "Software Over Current Error";
    if (mocoData.ErrorHardwareOverCurrent) return "Hardware Over Current Error";

    // Check limits (lower priority)
    if (mocoData.LimitIpmOrMotorTemp) return "IPM or Motor Temperature Limit";
    if (mocoData.LimitBusVoltageLower) return "Bus Voltage Lower Limit";
    if (mocoData.LimitBusVoltageUpper) return "Bus Voltage Upper Limit";
    if (mocoData.LimitBusCurrent) return "Bus Current Limit";
    if (mocoData.LimitVelocity) return "Velocity Limit";
    if (mocoData.LimitMotorCurrent) return "Motor Current Limit";
    if (mocoData.LimitOutputVoltagePWM) return "Output Voltage PWM Limit";

    return "No Active Faults or Limits";
};

// Check if there are any active errors or limits
const hasActiveFaultOrLimit = (mocoData) => {
    return mocoData.ErrorMotorOverSpeed || mocoData.ErrorDesaturationFault ||
        mocoData.Error15vRailUnderVoltage || mocoData.ErrorConfigRead ||
        mocoData.ErrorWatchdogCausedLastReset || mocoData.ErrorBadMotorPositionHallSeq ||
        mocoData.ErrorDcBusOverVoltage || mocoData.ErrorSoftwareOverCurrent ||
        mocoData.ErrorHardwareOverCurrent || mocoData.LimitIpmOrMotorTemp ||
        mocoData.LimitBusVoltageLower || mocoData.LimitBusVoltageUpper ||
        mocoData.LimitBusCurrent || mocoData.LimitVelocity ||
        mocoData.LimitMotorCurrent || mocoData.LimitOutputVoltagePWM;
};

// Check if there are any active errors (not just limits)
const hasActiveError = (mocoData) => {
    return mocoData.ErrorMotorOverSpeed || mocoData.ErrorDesaturationFault ||
        mocoData.Error15vRailUnderVoltage || mocoData.ErrorConfigRead ||
        mocoData.ErrorWatchdogCausedLastReset || mocoData.ErrorBadMotorPositionHallSeq ||
        mocoData.ErrorDcBusOverVoltage || mocoData.ErrorSoftwareOverCurrent ||
        mocoData.ErrorHardwareOverCurrent;
};

const MotorController = ({ data }) => {
    // Convert KPH to MPH
    const vehicleSpeedMph = (data.VehicleVelocity * 0.621371).toFixed(1);
    const motorRpm = data.MotorVelocity.toFixed(0);

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            <Paper
                elevation={3}
                sx={{
                    p: 4,
                    borderRadius: 3,
                    border: "1px solid #333",
                    backgroundColor: "background.paper",
                    mb: 3
                }}
            >
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                    Motor Controller
                </Typography>
                <Divider sx={{ mb: 4 }} />

                {/* Vehicle Speed - Highly Visible */}
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                    <Typography
                        variant="h2"
                        sx={{
                            fontWeight: 700,
                            fontSize: { xs: '3rem', md: '4rem' },
                            color: 'primary.main',
                            mb: 1
                        }}
                    >
                        {vehicleSpeedMph}
                    </Typography>
                    <Typography variant="h5" color="text.secondary" sx={{ mb: 1 }}>
                        MPH
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Motor RPM: {motorRpm}
                    </Typography>
                </Box>

                <Divider sx={{ mb: 4 }} />

                <Grid container spacing={4} sx={{ display: 'flex', justifyContent: 'center'}}>
                    {/* Power & Electrical */}
                    <Grid item xs={12} md={6}>
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                                Power & Electrical
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Bus Voltage
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.BusVoltage?.toFixed(1)} V
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Bus Current
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.BusCurrent?.toFixed(1)} A
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Phase Current B
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.PhaseCurrentB?.toFixed(1)} A
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Phase Current C
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.PhaseCurrentC?.toFixed(1)} A
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        DC Bus Ah
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.DCBusAh?.toFixed(2)} Ah
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Grid>

                    {/* Control & Status */}
                    <Grid item xs={12} md={6}>
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                                Control & Status
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Active Motor
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.ActiveMotor}
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Vq
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Vq?.toFixed(2)} V
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Vd
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Vd?.toFixed(2)} V
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Iq
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Iq?.toFixed(2)} A
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Id
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Id?.toFixed(2)} A
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Grid>

                    {/* Temperatures & Power Supplies */}
                    <Grid item xs={12} md={6} width={"175px"}>
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                                Temperatures
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Motor
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.MotorTemp?.toFixed(1)} °C
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Heatsink
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.HeatsinkTemp?.toFixed(1)} °C
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        DSP Board
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.DspBoardTemp?.toFixed(1)} °C
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Grid>

                    {/* Power Supplies & Diagnostics */}
                    <Grid item xs={12} md={6}>
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="h6" sx={{ mb: 3, fontWeight: 500 }}>
                                Power Supplies & Diagnostics
                            </Typography>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        15V Supply
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Supply15V?.toFixed(2)} V
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        3.3V Supply
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Supply3V3?.toFixed(2)} V
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        1.9V Supply
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.Supply1V9?.toFixed(2)} V
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        Odometer
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {(data.Odometer * 0.621371).toFixed(1)} mi
                                    </Typography>
                                </Box>

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" fontWeight={500}>
                                        CAN Errors (TX/RX)
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.TxErrorCount}/{data.RxErrorCount}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </Grid>

                    {/* Fault/Limit Status */}
                    {hasActiveFaultOrLimit(data) && (
                        <>
                            <Grid item xs={12}>
                                <Divider sx={{ my: 2 }} />
                            </Grid>

                            <Grid item xs={12}>
                                <Box sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    backgroundColor: hasActiveError(data)
                                        ? 'rgba(244, 67, 54, 0.1)'
                                        : 'rgba(255, 152, 0, 0.1)',
                                    border: hasActiveError(data)
                                        ? '2px solid #f44336'
                                        : '2px solid #ff9800',
                                    textAlign: 'center'
                                }}>
                                    <Typography variant="h6" sx={{
                                        fontWeight: 600,
                                        color: hasActiveError(data) ? '#f44336' : '#ff9800'
                                    }}>
                                        {motorControllerFaultReadable(data)}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {hasActiveError(data) ? 'Error Status' : 'Limit Status'}
                                    </Typography>
                                </Box>
                            </Grid>
                        </>
                    )}

                    {/* Device Info */}
                    <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', flexDirection: 'column' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
                            <Typography variant="body2" color="text.secondary">
                                Serial: {data.SerialNumber || 'N/A'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Tritium ID: {data.TritiumID || 'N/A'}
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>
        </Container>
    );
};

export default MotorController;