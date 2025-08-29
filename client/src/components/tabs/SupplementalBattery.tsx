import React from 'react';
import {Paper, Typography, Divider, Grid, Container} from "@mui/material";

const SupplementalBattery = ({data}) => {
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
                    <Typography variant="h6" gutterBottom> Supplemental Battery</Typography>
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
                                Voltage: {data.Supplemental_Voltage / 1000}V
                            </Typography>
                        </Grid>
                    </Grid>
                </Paper>
            </Container>
        </Paper>
    );
};

export default SupplementalBattery;
