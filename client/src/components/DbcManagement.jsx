import React, { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import { FileExplorerCard } from './common/FileExplorerCard';

export const DbcManagement = () => {
    const [activeDbc, setActiveDbc] = useState('');

    useEffect(() => {
        fetch('/api/config').then(res => res.json()).then(config => setActiveDbc(config.DBC_FILE));
    }, []);

    const handleDbcSelect = (filename) => {
        // The active file in the explorer includes the extension
        setActiveDbc(filename);
        // The config setting should not include the extension
        const newDbcName = filename.replace('.dbc', '');
        fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'DBC_FILE', value: newDbcName }),
        });
    };

    return (
        <FileExplorerCard
            title="DBC Management"
            icon={<Database />}
            directoryKey="dbc" // Use the key for the API endpoint
            fileExtension=".dbc"
            onFileSelect={handleDbcSelect}
            activeFile={activeDbc}
        />
    );
};
