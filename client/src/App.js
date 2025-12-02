import React, { useState, useEffect, useMemo } from 'react';
import io from 'socket.io-client';

const socket = io();

// --- Helper Components (Assumed to be the same) ---
const ConnectionStatus = ({ connectionStates }) => (
    <div className="container mx-auto flex flex-wrap gap-2 p-4 bg-gray-900 rounded-lg shadow-inner">
        {Object.entries(connectionStates).map(([name, isConnected]) => (
            <div key={name} className={`badge text-sm font-bold shadow-md ${isConnected ? 'bg-green-500 text-black' : 'bg-red-500 text-black'}`}>
                {name.replace(/_/g, ' ')}
            </div>
        ))}
    </div>
);
const DataCard = ({ signalKey, value }) => (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
        <h3 className="font-bold text-gray-400">{signalKey}</h3>
        <div className="text-2xl font-mono font-bold text-white">
            {typeof value === 'number' ? value.toFixed(2) : String(value)}
        </div>
    </div>
);
const ArrayCard = ({ signalKey, data }) => (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700 col-span-1 md:col-span-2">
        <h3 className="font-bold text-gray-400">{signalKey}</h3>
        <div className="mt-2 bg-black p-2 rounded-md max-h-60 overflow-y-auto">
            {data.map((val, idx) => (
                <div key={idx} className="font-mono text-sm">
                    <span className="text-gray-500">{idx}:</span> {val !== null && val !== undefined ? val.toFixed(2) : 'N/A'}
                </div>
            ))}
        </div>
    </div>
);

// --- Main App Component ---
function App() {
    const [sessionStatus, setSessionStatus] = useState('initializing');
    const [availableDbcs, setAvailableDbcs] = useState([]);
    const [fullState, setFullState] = useState({});
    const [connectionStates, setConnectionStates] = useState({});
    const [activeTab, setActiveTab] = useState('');
    const [error, setError] = useState('');

    const [selectedDbc, setSelectedDbc] = useState('');
    const [inputMode, setInputMode] = useState('serial');
    const [serialPort, setSerialPort] = useState('COM3');
    const [serialBaud, setSerialBaud] = useState(125000);
    const [tcpIp, setTcpIp] = useState('3.141.38.115');
    const [tcpPort, setTcpPort] = useState(8187);
    const [fileContent, setFileContent] = useState(null);

    const deviceNames = useMemo(() => Object.keys(fullState).sort(), [fullState]);

    useEffect(() => {
        socket.on('connect', () => console.log('Socket connected. Waiting for server state...'));
        
        socket.on('available_dbcs', (data) => {
            console.log('Server is ready for configuration.', data.dbcs);
            setAvailableDbcs(data.dbcs);
            if (data.dbcs.length > 0) setSelectedDbc(data.dbcs[0]);
            setSessionStatus('needs_config');
        });

        socket.on('session_started', () => {
            console.log("New session started successfully.");
            setSessionStatus('active');
        });

        socket.on('session_resumed', (data) => {
            console.log("Session already in progress. Resuming state.", data);
            // This is now the single point of entry for a resuming client
            setFullState(data.full_data_state);
            setConnectionStates(data.connection_states);
            setSelectedDbc(data.selected_dbc);
            setSessionStatus('active'); // Switch to the dashboard
        });

        socket.on('init_error', (data) => setError(data.message));

        socket.on('can_update', (update) => {
            console.log("RAW [can_update]:", JSON.parse(JSON.stringify(update)));
            setFullState(prevState => {
                const newState = { ...prevState };
                for (const deviceName in update) {
                    if (!newState[deviceName]) newState[deviceName] = {};
                    for (const signalKey in update[deviceName]) {
                        const value = update[deviceName][signalKey];
                        if (Array.isArray(newState[deviceName][signalKey])) {
                            if (Array.isArray(value)) {
                                value.forEach(item => {
                                    newState[deviceName][signalKey][item.idx] = item.value;
                                });
                            }
                        } else {
                            newState[deviceName][signalKey] = value;
                        }
                    }
                }
                return newState;
            });
        });

        socket.on('connection_state', (update) => {
            console.log("RAW [connection_state]:", update);
            setConnectionStates(prev => ({ ...prev, ...update }));
        });

        return () => {
            socket.off('connect');
            socket.off('available_dbcs');
            socket.off('session_started');
            socket.off('session_resumed');
            socket.off('init_error');
            socket.off('can_update');
            socket.off('connection_state');
        };
    }, []);

    useEffect(() => {
        if (deviceNames.length > 0 && !activeTab) {
            setActiveTab(deviceNames[0]);
        }
    }, [deviceNames, activeTab]);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => setFileContent(e.target.result);
        reader.readAsText(file);
    };

    const handleConnect = () => {
        if (inputMode === 'file' && !fileContent) {
            setError('Please select a file to upload.');
            return;
        }
        setError('');
        const config = {
            DBC_FILE: selectedDbc,
            INPUT_MODE: inputMode,
            SERIAL_PORT: serialPort,
            SERIAL_BAUDRATE: serialBaud,
            TCP_IP: tcpIp,
            TCP_PORT: tcpPort,
            REPLAY_CONTENT: fileContent,
            LOG_ENABLED: true,
        };
        socket.emit('start_session', config);
    };

    // --- Render Logic (remains the same) ---
    if (sessionStatus === 'initializing') {
        return <div className="bg-black min-h-screen flex items-center justify-center font-mono text-white">Connecting to server...</div>;
    }

    if (sessionStatus === 'needs_config') {
        return (
            <div className="bg-black min-h-screen flex items-center justify-center font-mono">
                {/* ... Configuration Screen JSX ... */}
            </div>
        );
    }

    return (
        <div className="bg-black min-h-screen text-gray-300 font-mono">
            {/* ... Dashboard Screen JSX ... */}
        </div>
    );
}

export default App;
