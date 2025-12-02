import React, { useState, useEffect, useMemo } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
    reconnection: true,
    reconnectionDelay: 1000,
    transports: ['websocket']
});

const ConnectionStatus = ({ connectionStates }) => (
    <div className="container mx-auto flex flex-wrap gap-2 p-4 bg-gray-900 rounded-lg shadow-inner">
        {Object.entries(connectionStates).map(([name, isConnected]) => (
            <div
                key={name}
                className={`badge text-sm font-bold shadow-md ${isConnected ? 'bg-green-500 text-black' : 'bg-red-500 text-black'}`}
            >
                {name.replace(/_/g, ' ')}
            </div>
        ))}
    </div>
);

const DataCard = ({ signalKey, value }) => (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700 transition-transform hover:translate-y-[-3px]">
        <h3 className="font-bold text-gray-400">{signalKey}</h3>
        <div className="text-2xl font-mono font-bold text-white">
            {typeof value === 'number' ? value.toFixed(2) : String(value)}
        </div>
    </div>
);

const ArrayCard = ({ signalKey, data }) => (
    <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700 col-span-1 md:col-span-2">
        <h3 className="font-bold text-gray-400">{signalKey}</h3>
        <div className="array-container mt-2 bg-black p-2 rounded-md max-h-60 overflow-y-auto">
            {data.map((val, idx) => (
                <div key={idx} className="font-mono text-sm">
                    <span className="text-gray-500">{idx}:</span> {val !== null ? val.toFixed(2) : 'N/A'}
                </div>
            ))}
        </div>
    </div>
);


// --- Main App Component ---

function App() {
    // --- State Management ---
    const [sessionStarted, setSessionStarted] = useState(false);
    const [availableDbcs, setAvailableDbcs] = useState([]);
    const [fullState, setFullState] = useState({});
    const [connectionStates, setConnectionStates] = useState({});
    const [activeTab, setActiveTab] = useState('');
    const [error, setError] = useState('');

    // Config State
    const [selectedDbc, setSelectedDbc] = useState('');
    const [inputMode, setInputMode] = useState('serial');
    const [serialPort, setSerialPort] = useState('COM3');
    const [serialBaud, setSerialBaud] = useState(125000);
    const [tcpIp, setTcpIp] = useState('3.141.38.115');
    const [tcpPort, setTcpPort] = useState(8187);
    const [fileContent, setFileContent] = useState(null);

    // --- Memoized Derived State ---
    const deviceNames = useMemo(() => Object.keys(fullState).sort(), [fullState]);

    // --- Effects ---
    useEffect(() => {
        // Setup Socket.IO listeners
        socket.on('connect', () => console.log('Connected to server.'));
        socket.on('available_dbcs', (data) => {
            setAvailableDbcs(data.dbcs);
            if (data.dbcs.length > 0) {
                setSelectedDbc(data.dbcs[0]);
            }
        });
        socket.on('session_started', () => setSessionStarted(true));
        socket.on('init_error', (data) => setError(data.message));

        socket.on('can_update', (update) => {
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
            setConnectionStates(prev => ({ ...prev, ...update }));
        });

        // Initial request for DBCs
        socket.emit('request_dbcs');

        // Cleanup on unmount
        return () => {
            socket.off('connect');
            socket.off('available_dbcs');
            socket.off('session_started');
            socket.off('init_error');
            socket.off('can_update');
            socket.off('connection_state');
        };
    }, []);

    useEffect(() => {
        // Set the first tab as active when devices appear
        if (deviceNames.length > 0 && !activeTab) {
            setActiveTab(deviceNames[0]);
        }
    }, [deviceNames, activeTab]);


    // --- Handlers ---
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

    // --- Render Logic ---

    if (!sessionStarted) {
        return (
            <div className="bg-black min-h-screen flex items-center justify-center font-mono">
                <div className="card w-full max-w-lg bg-gray-900 shadow-2xl border border-gray-700 rounded-lg">
                    <div className="card-body">
                        <h2 className="card-title text-2xl text-white">Session Configuration</h2>
                        
                        <div className="form-control w-full">
                            <label className="label"><span className="label-text text-gray-400">DBC File</span></label>
                            <select value={selectedDbc} onChange={e => setSelectedDbc(e.target.value)} className="select select-bordered bg-black border-gray-600 rounded">
                                {availableDbcs.map(dbc => <option key={dbc} value={dbc}>{dbc}</option>)}
                            </select>
                        </div>

                        <div className="form-control w-full">
                            <label className="label"><span className="label-text text-gray-400">Connection Mode</span></label>
                            <select value={inputMode} onChange={e => setInputMode(e.target.value)} className="select select-bordered bg-black border-gray-600 rounded">
                                <option value="serial">Serial</option>
                                <option value="tcp">TCP</option>
                                <option value="file">File</option>
                            </select>
                        </div>

                        {inputMode === 'serial' && (
                            <div className="flex flex-col gap-2 mt-2">
                                <input type="text" value={serialPort} onChange={e => setSerialPort(e.target.value)} placeholder="COM Port" className="input input-bordered bg-black border-gray-600 rounded" />
                                <input type="number" value={serialBaud} onChange={e => setSerialBaud(parseInt(e.target.value))} placeholder="Baudrate" className="input input-bordered bg-black border-gray-600 rounded" />
                            </div>
                        )}
                        {inputMode === 'tcp' && (
                             <div className="flex flex-col gap-2 mt-2">
                                <input type="text" value={tcpIp} onChange={e => setTcpIp(e.target.value)} placeholder="IP Address" className="input input-bordered bg-black border-gray-600 rounded" />
                                <input type="number" value={tcpPort} onChange={e => setTcpPort(parseInt(e.target.value))} placeholder="Port" className="input input-bordered bg-black border-gray-600 rounded" />
                            </div>
                        )}
                        {inputMode === 'file' && (
                            <div className="mt-2">
                                <input type="file" onChange={handleFileChange} className="file-input file-input-bordered w-full bg-black border-gray-600 rounded" />
                            </div>
                        )}

                        <div className="card-actions justify-end mt-4">
                            <button onClick={handleConnect} className="btn bg-gray-700 hover:bg-gray-600 border-gray-500 rounded shadow-lg">Connect</button>
                        </div>
                        {error && <p className="text-red-500 mt-4">{error}</p>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-black min-h-screen text-gray-300 font-mono">
            <header className="bg-gray-900 p-4 shadow-lg border-b border-gray-700">
                <ConnectionStatus connectionStates={connectionStates} />
            </header>
            <main className="container mx-auto p-4">
                <div role="tablist" className="tabs tabs-lifted">
                    {deviceNames.map(name => (
                        <a key={name} role="tab" onClick={() => setActiveTab(name)} className={`tab ${activeTab === name ? 'tab-active bg-gray-800 text-white' : 'text-gray-500'}`}>
                            {name.replace(/_/g, ' ')}
                        </a>
                    ))}
                </div>
                <div className="bg-gray-800 p-4 rounded-b-lg rounded-r-lg border border-t-0 border-gray-700">
                    {deviceNames.map(name => (
                        <div key={name} className={`${activeTab === name ? 'block' : 'hidden'}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {fullState[name] && Object.entries(fullState[name]).map(([sigKey, sigValue]) => (
                                    Array.isArray(sigValue)
                                        ? <ArrayCard key={sigKey} signalKey={sigKey} data={sigValue} />
                                        : <DataCard key={sigKey} signalKey={sigKey} value={sigValue} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}

export default App;
