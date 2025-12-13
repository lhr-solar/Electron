import React, { useState, useEffect, useCallback } from 'react';
import { TextInput, Select, SegmentedControl, Group, ActionIcon, Loader, Tooltip } from '@mantine/core';
import { Settings, Wifi, Usb, FileCode, RefreshCw, FileText } from 'lucide-react';
import { ActionCard } from './common/ActionCard';
import { notifications } from '@mantine/notifications';
import { socket } from '../socket';
import { FileExplorerCard } from './common/FileExplorerCard';

export const ConfigDeck = () => {
    const [config, setConfig] = useState(null);
    const [serialPorts, setSerialPorts] = useState([]);
    const [isRunning, setIsRunning] = useState(false);

    const fetchSerialPorts = useCallback(() => {
        fetch('/api/serial-ports')
            .then((res) => res.json())
            .then(ports => setSerialPorts(ports.map(p => ({ value: p.device, label: `${p.device} - ${p.description}` }))));
    }, []);

    useEffect(() => {
        fetch('/api/config').then((res) => res.json()).then(setConfig);
        fetchSerialPorts(); // Fetch ports on initial load
        socket.on('status', (data) => setIsRunning(data.service_running));
        return () => socket.off('status');
    }, [fetchSerialPorts]);

    const updateConfig = (key, value) => {
        setConfig((prev) => ({ ...prev, [key]: value }));
        fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        }).then(res => {
            if (!res.ok) notifications.show({ title: 'Config Error', message: 'Failed to update setting.', color: 'red' });
        });
    };

    if (!config) return <ActionCard title="Configuration" icon={<Settings />}><Loader /></ActionCard>;

    const renderSettings = () => {
        switch (config.INPUT_MODE) {
            case 'serial':
                return (
                    <>
                        <Group>
                            <Select 
                                label="Serial Port" 
                                data={serialPorts} 
                                value={config.SERIAL_PORT} 
                                onChange={(value) => updateConfig('SERIAL_PORT', value)} 
                                style={{ flex: 1 }} 
                                disabled={isRunning}
                                searchable
                            />
                            <Tooltip label="Refresh Ports">
                                <ActionIcon variant="default" onClick={fetchSerialPorts} mt="xl" disabled={isRunning}>
                                    <RefreshCw size={18} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                        <Select label="Baud Rate" data={['9600', '115200']} value={String(config.SERIAL_BAUDRATE)} onChange={(value) => updateConfig('SERIAL_BAUDRATE', parseInt(value))} disabled={isRunning} />
                        <Select label="CAN Bitrate" data={['125000', '250000', '500000', '1000000']} value={String(config.CAN_BITRATE)} onChange={(value) => updateConfig('CAN_BITRATE', parseInt(value))} disabled={isRunning} />
                    </>
                );
            case 'tcp':
                return (
                    <>
                        <TextInput label="IP Address" defaultValue={config.TCP_IP || '3.141.38.115'} onChange={(e) => updateConfig('TCP_IP', e.target.value)} disabled={isRunning} />
                        <TextInput label="Port" type="number" defaultValue={config.TCP_PORT || 8187} onChange={(e) => updateConfig('TCP_PORT', parseInt(e.target.value))} disabled={isRunning} />
                    </>
                );
            case 'file':
                return (
                    <FileExplorerCard
                        title="Log File"
                        icon={<FileText size={16} />}
                        directoryKey="log" // Use the key for the API endpoint
                        fileExtension=".log,.txt"
                        onFileSelect={(filename) => updateConfig('REPLAY_FILE_PATH', filename)}
                        activeFile={config.REPLAY_FILE_PATH}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <ActionCard title="Configuration" icon={<Settings />}>
            <SegmentedControl
                fullWidth
                value={config.INPUT_MODE}
                onChange={(value) => updateConfig('INPUT_MODE', value)}
                data={[
                    { label: <Group gap="xs" justify="center"><Usb size={16} /> Serial</Group>, value: 'serial' },
                    { label: <Group gap="xs" justify="center"><Wifi size={16} /> TCP</Group>, value: 'tcp' },
                    { label: <Group gap="xs" justify="center"><FileCode size={16} /> File</Group>, value: 'file' },
                ]}
                mb="md"
                disabled={isRunning}
            />
            {renderSettings()}
        </ActionCard>
    );
};
