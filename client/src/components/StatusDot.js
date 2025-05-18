import React from "react";
import { Box } from "@mui/material";

const StatusDot = ({active}) => (
    <Box
        sx={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: active ? "#4caf50" : "#f44336",
            display: "inline-block",
            ml: 1,
        }}
    />
);

export default StatusDot;