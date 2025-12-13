import React, { useState, useEffect, useCallback } from 'react';
import { TextInput, Select, SegmentedControl, Group, ActionIcon, Loader, Tooltip } from '@mantine/core';
import { Settings, Wifi, Usb, FileCode, RefreshCw, FileText } from 'lucide-react';
import { ActionCard } from './common/ActionCard';
import { notifications } from '@mantine/notifications';
import { socket } from '../socket';
import { FileExplorerCard } from './common/FileExplorerCard';

export const ConfigDeck = () => {
    const [config, setConfig] = useState(null);
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        fetch('/api/config').then((res) => res.json()).then(setConfig);
        socket.on('status', (data) => setIsRunning(data.service_running));
        return () => socket.off('status');
    }, []);

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

    const handleDbcSelect = (filename) => {
        updateConfig('DBC_FILE', filename.replace('.dbc', ''));
    }

    const renderSettings = () => {
        switch (config.INPUT_MODE) {
            case 'serial':
                return (
                    <>
                        <Group>
                            <Select label="Serial Port" data={[]} value={config.SERIAL_PORT} onChange={(value) => updateConfig('SERIAL_PORT', value)} style={{ flex: 1 }} />
                        </Group>
                        <Select label="Baud Rate" data={['9600', '115200']} value={String(config.SERIAL_BAUDRATE)} onChange={(value) => updateConfig('SERIAL_BAUDRATE', parseInt(value))} />
                        <Select label="CAN Bitrate" data={['125000', '250000', '500000', '1000000']} value={String(config.CAN_BITRATE)} onChange={(value) => updateConfig('CAN_BITRATE', parseInt(value))} />
                    </>
                );
            case 'tcp':
                return (
                    <>
                        <TextInput label="IP Address" value={config.TCP_IP || '127.0.0.1'} onChange={(e) => updateConfig('TCP_IP', e.target.value)} />
                        <TextInput label="Port" type="number" value={config.TCP_PORT || 8187} onChange={(e) => updateConfig('TCP_PORT', parseInt(e.target.value))} />
                    </>
                );
            case 'file':
                return null;
            default:
                return null;
        }
    };

    const tabs = [
        { id: 'serial', icon: <Usb size={16} />, label: 'Serial' },
        { id: 'tcp', icon: <Wifi size={16} />, label: 'TCP' },
        { id: 'file', icon: <FileCode size={16} />, label: 'File' },
    ];

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
            {config.INPUT_MODE === 'file' && (
                <FileExplorerCard
                    title="Log File"
                    icon={<FileText size={16} />}
                    directoryKey="LOG_DIR"
                    fileExtension=".log,.txt"
                    onFileSelect={(filename) => updateConfig('REPLAY_FILE_PATH', filename)}
                    activeFile={config.REPLAY_FILE_PATH}
                />
            )}
        </ActionCard>
    );
};
