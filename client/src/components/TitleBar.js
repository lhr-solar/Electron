import React from "react";
import { AppBar, Toolbar, Typography, Box, Tabs, Tab, useTheme } from "@mui/material";
import {FaHome} from "react-icons/fa";
import StatusDot from "./StatusDot";
import BlinkingStatusDot from "./BlinkingStatusDot";

const TitleBar = ({ tabs, activeTab, handleTabChange, serverStatus, candapterStatus, candapterNickname }) => {
    const theme = useTheme();

    return (
        <AppBar position="static" color="default" elevation={1}>
            <Toolbar sx={{ bgcolor: theme.palette.background.paper, px: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                    {/* Left side: Logo and Tabs */}
                    <Box display="flex" alignItems="center">
                        <Box display="flex" alignItems="center">
                            <img
                                src="/logo.png"
                                alt="Team Logo"
                                style={{ height: 32, marginRight: 8 }}
                            />
                            <Typography variant="h6" noWrap fontWeight="bold">
                                Electron
                            </Typography>
                        </Box>

                        <Box sx={{ width: "90%" }}>
                            <Tabs
                                value={activeTab}
                                onChange={handleTabChange}
                                textColor="primary"
                                indicatorColor="primary"
                                variant="scrollable"
                                scrollButtons="auto"
                            >
                                {tabs.map((tab, index) => (
                                    <Tab
                                        key={index}
                                        label={
                                            <Box display="flex" alignItems="center">
                                                {tab.icon && <FaHome style={{
                                                    marginRight: 4,
                                                }}/>}
                                                {tab.label}
                                                {tab.status?.map((status, index) => (
                                                    <StatusDot
                                                        key={index}
                                                        active={serverStatus && candapterStatus && status}
                                                    />
                                                ))}
                                            </Box>
                                        }
                                    />
                                ))}
                            </Tabs>
                        </Box>
                    </Box>

                    {/* Right side: Status indicators */}
                    <Box display="flex" alignItems="center" gap={2}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2">Server</Typography>
                            <BlinkingStatusDot connected={serverStatus} label="Server" />
                        </Box>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body2">{candapterNickname}</Typography>
                            <BlinkingStatusDot connected={serverStatus && candapterStatus} label="CANdapter" />
                        </Box>
                    </Box>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default TitleBar;
