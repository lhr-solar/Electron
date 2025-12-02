document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- DOM Elements ---
    const configScreen = document.getElementById('config-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const dbcSelect = document.getElementById('dbc-select');
    const inputModeSelect = document.getElementById('input-mode-select');
    const connectBtn = document.getElementById('connect-btn');
    const errorMessage = document.getElementById('error-message');
    
    const serialInputs = document.getElementById('serial-inputs');
    const tcpInputs = document.getElementById('tcp-inputs');
    const fileInputs = document.getElementById('file-inputs');
    const fileUpload = document.getElementById('file-upload');

    const connectionStatusContainer = document.getElementById('connection-status-container');
    const tabsContainer = document.getElementById('tabs-container');
    const tabContentContainer = document.getElementById('tab-content-container');

    // --- State ---
    let fullState = {};
    let fileContent = null;

    // --- Event Listeners ---
    inputModeSelect.addEventListener('change', updateInputVisibility);

    fileUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            fileContent = e.target.result;
            console.log('File loaded.');
        };
        reader.readAsText(file);
    });

    connectBtn.addEventListener('click', () => {
        const config = {
            DBC_FILE: dbcSelect.value,
            INPUT_MODE: inputModeSelect.value,
            SERIAL_PORT: document.getElementById('serial-port').value,
            SERIAL_BAUDRATE: parseInt(document.getElementById('serial-baudrate').value, 10),
            TCP_IP: document.getElementById('tcp-ip').value,
            TCP_PORT: parseInt(document.getElementById('tcp-port').value, 10),
            REPLAY_CONTENT: fileContent, // Use content instead of path
            LOG_ENABLED: true,
        };
        
        if (config.INPUT_MODE === 'file' && !fileContent) {
            errorMessage.textContent = 'Please select a file to upload.';
            return;
        }
        
        errorMessage.textContent = '';
        socket.emit('start_session', config);
    });

    // --- Socket.IO Handlers ---
    socket.on('connect', () => {
        console.log('Connected to server. Requesting DBC list.');
        socket.emit('request_dbcs');
    });

    socket.on('available_dbcs', (data) => {
        console.log('Received available DBCs:', data.dbcs);
        dbcSelect.innerHTML = data.dbcs.map(dbc => `<option value="${dbc}">${dbc}</option>`).join('');
        updateInputVisibility();
    });

    socket.on('session_started', (data) => {
        console.log('Session started with config:', data);
        configScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
    });

    socket.on('init_error', (data) => {
        console.error('Initialization Error:', data.message);
        errorMessage.textContent = `Error: ${data.message}`;
    });

    socket.on('can_update', (update) => {
        // ... (rendering logic remains the same)
    });

    socket.on('connection_state', (update) => {
        // ... (rendering logic remains the same)
    });

    // --- UI Functions ---
    function updateInputVisibility() {
        serialInputs.classList.add('hidden');
        tcpInputs.classList.add('hidden');
        fileInputs.classList.add('hidden');

        const selectedMode = inputModeSelect.value;
        if (selectedMode === 'serial') {
            serialInputs.classList.remove('hidden');
        } else if (selectedMode === 'tcp') {
            tcpInputs.classList.remove('hidden');
        } else if (selectedMode === 'file') {
            fileInputs.classList.remove('hidden');
        }
    }
    
    // ... (All other UI functions like createTabForDevice, updateDOM, etc. remain the same)
});
