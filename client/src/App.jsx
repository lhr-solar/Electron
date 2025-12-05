import React, { useState, useEffect, useMemo } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
    reconnection: true,
    reconnectionDelay: 1000,
    transports: ['websocket']
});


// --- Main App Component ---

function App() {
    // --- Effects ---
    useEffect(() => {
        // Setup Socket.IO listeners
        socket.on('connect', () => console.log('Connected to server.'));

        // Cleanup on unmount
        return () => {
            socket.off('connect');
        };
    }, []);

    const handleConnect = () => {

    };

    return (
        <div className="">

        </div>
    );
}

export default App;
