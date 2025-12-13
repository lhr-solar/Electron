import React, { useState, useEffect } from 'react';
import { Group, Title, Button, Badge, Tooltip, Paper } from '@mantine/core';
import { Power, Usb, AlertCircle, Database, Wifi, FileText } from 'lucide-react';
import { socket } from '../socket';
import { notifications } from '@mantine/notifications';

const StatusIndicator = ({ label, isConnected, icon, connectedText = "Connected", disconnectedText = "Disconnected" }) => {
    if (isConnected === null || isConnected === undefined) return null;
    const color = isConnected ? 'teal' : 'red';
    return (
        <Tooltip label={label}>
            <Badge color={color} variant="light" leftSection={React.cloneElement(icon, { size: 14 })}>
                {isConnected ? connectedText : disconnectedText}
            </Badge>
        </Tooltip>
    );
};

export const Header = () => {
    const [status, setStatus] = useState({
        service_running: false,
        influx_connected: false,
        parser_status: 'idle',
        parser_connection_state: null,
        error_message: null,
    });
    const [isLoading, setIsLoading] = useState(false);
    const [inputMode, setInputMode] = useState('file');

    useEffect(() => {
        fetch('/api/config').then(res => res.json()).then(data => setInputMode(data.INPUT_MODE));

        const handleStatus = (data) => {
            setStatus(data);
            if (data.error_message && data.parser_status === 'error') {
                notifications.show({
                    id: 'parser-error',
                    title: 'Parser Error',
                    message: data.error_message,
                    color: 'red',
                    icon: <AlertCircle />,
                    autoClose: 5000,
                });
            }
        };
        socket.on('status', handleStatus);
        return () => socket.off('status');
    }, []);

    const handleToggle = async () => {
        setIsLoading(true);
        const endpoint = status.service_running ? '/api/stop' : '/api/start';
        try {
            const response = await fetch(endpoint, { method: 'POST' });
            if (!response.ok) {
                const errorData = await response.json();
                notifications.show({ title: 'Error', message: errorData.detail || 'Failed to toggle service', color: 'red' });
            }
        } catch (error) {
            notifications.show({ title: 'Network Error', message: 'Could not connect to the backend', color: 'red' });
        } finally {
            setIsLoading(false);
        }
    };

    const getParserStatusBadge = () => {
        if (!status.service_running) return <Badge color="gray">Idle</Badge>;
        switch (status.parser_status) {
            case 'running': return <Badge color="teal" variant="light">Active</Badge>;
            case 'error': return <Badge color="red" variant="light">Error</Badge>;
            case 'finished': return <Badge color="blue" variant="light">Finished</Badge>;
            default: return <Badge color="gray">Idle</Badge>;
        }
    };
    
    const getDeviceIcon = () => {
        switch(inputMode) {
            case 'serial': return <Usb size={14} />;
            case 'tcp': return <Wifi size={14} />;
            case 'file': return <FileText size={14} />;
            default: return <Usb size={14} />;
        }
    }

    return (
        <Paper withBorder p="md" radius="md" shadow="sm">
            <Group justify="space-between">
                <Group>
                    <Title order={3}>Telemetry Control</Title>
                    <Badge color={status.service_running ? 'teal' : 'red'} size="lg" variant="dot">
                        {status.service_running ? 'Online' : 'Offline'}
                    </Badge>
                </Group>
                <Group>
                    <StatusIndicator label="InfluxDB" isConnected={status.influx_connected} icon={<Database size={14} />} />
                    <Badge color="gray" variant="outline">Parser: {getParserStatusBadge()}</Badge>
                    <StatusIndicator label="Device/Source" isConnected={status.parser_connection_state} icon={getDeviceIcon()} />
                </Group>
                <Button
                    onClick={handleToggle}
                    loading={isLoading}
                    color={status.service_running ? 'red' : 'teal'}
                    leftSection={<Power size={18} />}
                    size="sm"
                >
                    {status.service_running ? 'Stop' : 'Start'}
                </Button>
            </Group>
        </Paper>
    );
};
