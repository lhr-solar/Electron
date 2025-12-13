import React, { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import { FileExplorerCard } from './common/FileExplorerCard';

export const DbcManagement = () => {
    const [activeDbc, setActiveDbc] = useState('');

    useEffect(() => {
        fetch('/api/config').then(res => res.json()).then(config => setActiveDbc(config.DBC_FILE));
    }, []);

    const handleDbcSelect = (filename) => {
        const newDbcName = filename.replace('.dbc', '');
        setActiveDbc(newDbcName);
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
            directoryKey="DBC_DIR"
            fileExtension=".dbc"
            onFileSelect={handleDbcSelect}
            activeFile={activeDbc}
        />
    );
};
