import React from 'react';
import { Box, Divider, Paper, Typography } from "@mui/material";

const MotorController = () => {
    return (
        <Paper sx={{padding: 2, backgroundColor: "#1e1e1e"}}>
            <Typography variant="h6">Battery</Typography>
            <Divider/>
            <Box sx={{marginTop: 2}}>
                <Typography variant="body1">Motor & Motor Controller Status</Typography>
                {/* Add battery status components here */}
            </Box>
        </Paper>
    );
}

export default MotorController;