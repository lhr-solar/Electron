import {useEffect, useState} from "react";
import {Box} from "@mui/material";


const BlinkingStatusDot = ({connected}) => {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (!connected) return;
        const interval = setInterval(() => setVisible((v) => !v), 500);
        return () => clearInterval(interval);
    }, [connected]);

    return (
        <Box
            sx={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                backgroundColor: connected && visible ? "#4caf50" : "transparent",
                border: connected ? "1px solid #4caf50" : "1px solid #f44336",
                display: "inline-block",
                ml: 1,
            }}
        />
    );
};

export default BlinkingStatusDot;