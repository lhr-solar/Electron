import React from "react";
import { AppBar, Toolbar, Typography, Box, Tabs, Tab, useTheme } from "@mui/material";
import StatusDot from "./StatusDot";
import BlinkingStatusDot from "./BlinkingStatusDot";

const TitleBar = ({ tabs, activeTab, handleTabChange, serverStatus, candapterStatus }) => {
    const theme = useTheme();

    return (
        <AppBar position="static" color="default" elevation={1}>
            <Toolbar sx={{ bgcolor: theme.palette.background.paper, px: 2 }}>
                <Box display="flex" alignItems="center" mr={4}>
                    <img
                        src="/logo.png"
                        alt="Team Logo"
                        style={{ height: 32, marginRight: 8 }}
                    />
                    <Typography variant="h6" noWrap fontWeight="bold">
                        Electron
                    </Typography>
                </Box>

                <Box flexGrow={1}>
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        textColor="primary"
                        indicatorColor="primary"
                    >
                        {tabs.map((tab, index) => (
                            <Tab
                                key={index}
                                label={
                                    <Box display="flex" alignItems="center">
                                        {tab.label}
                                        {tab.status?.map((status, index) => (
                                            <StatusDot
                                                key={index}
                                                active={status}
                                            />
                                        ))}
                                    </Box>
                                }
                            />
                        ))}
                    </Tabs>
                </Box>

                <Box display="flex" alignItems="center" gap={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2">Server</Typography>
                        <BlinkingStatusDot connected={serverStatus} label="Server" />
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2">CANdapter</Typography>
                        <BlinkingStatusDot connected={candapterStatus} label="CANdapter" />
                    </Box>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default TitleBar;
