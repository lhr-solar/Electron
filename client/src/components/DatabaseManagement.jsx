import React, { useState, useEffect } from 'react';
import { Select, TextInput, Button, Group, ActionIcon, Text, ScrollArea, Paper } from '@mantine/core';
import { Server, PlusCircle, Trash2 } from 'lucide-react';
import { ActionCard } from './common/ActionCard';
import { notifications } from '@mantine/notifications';

export const DatabaseManagement = () => {
    const [buckets, setBuckets] = useState([]);
    const [newBucketName, setNewBucketName] = useState('');
    const [selectedBucket, setSelectedBucket] = useState('');

    const fetchBuckets = () => {
        fetch('/api/influx/buckets').then((res) => res.json()).then(setBuckets);
    };

    useEffect(() => {
        fetchBuckets();
        fetch('/api/config').then(res => res.json()).then(config => setSelectedBucket(config.INFLUX_BUCKET));
    }, []);

    const handleBucketChange = (value) => {
        setSelectedBucket(value);
        fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'INFLUX_BUCKET', value }),
        });
    };

    const handleCreateBucket = async (e) => {
        e.preventDefault();
        if (!newBucketName) return;
        await fetch('/api/influx/buckets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newBucketName }),
        });
        setNewBucketName('');
        fetchBuckets();
    };

    const handleDeleteBucket = async (bucketName) => {
        if (window.confirm(`Are you sure you want to delete the bucket "${bucketName}"? This action cannot be undone.`)) {
            const res = await fetch(`/api/influx/buckets/${bucketName}`, { method: 'DELETE' });
            if (res.ok) {
                notifications.show({ title: 'Success', message: `Bucket '${bucketName}' deleted.`, color: 'teal' });
                fetchBuckets();
            } else {
                const err = await res.json();
                notifications.show({ title: 'Error', message: err.detail || 'Failed to delete bucket.', color: 'red' });
            }
        }
    };

    return (
        <ActionCard title="Database Management" icon={<Server />}>
            <Select
                label="Target Bucket"
                data={buckets}
                value={selectedBucket}
                onChange={handleBucketChange}
                mb="md"
            />
            <form onSubmit={handleCreateBucket}>
                <Group>
                    <TextInput
                        placeholder="New bucket name..."
                        value={newBucketName}
                        onChange={(e) => setNewBucketName(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <Button type="submit" leftSection={<PlusCircle size={16} />}>Create</Button>
                </Group>
            </form>
            <Text size="sm" mt="lg" mb="xs" fw={500}>Debug Buckets</Text>
            <ScrollArea h={100}>
                {buckets.filter(b => b.startsWith('debug')).map(bucket => (
                    <Paper key={bucket} withBorder p="xs" radius="sm" mb="xs">
                        <Group justify="space-between">
                            <Text size="sm">{bucket}</Text>
                            <ActionIcon color="red" variant="subtle" onClick={() => handleDeleteBucket(bucket)}>
                                <Trash2 size={16} />
                            </ActionIcon>
                        </Group>
                    </Paper>
                ))}
            </ScrollArea>
        </ActionCard>
    );
};
