import React, { useState, useEffect, useCallback } from 'react';
import { ActionCard } from './ActionCard';
import { ScrollArea, Table, Group, ActionIcon, Text, FileInput, Tooltip, Modal, Button, TextInput, Stack } from '@mantine/core';
import { Trash2, Upload, RefreshCw, Search } from 'lucide-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';

export const FileExplorerCard = ({ title, icon, directoryKey, fileExtension, onFileSelect, activeFile }) => {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [deleteModal, { open: openDelete, close: closeDelete }] = useDisclosure(false);
    const [overwriteModal, { open: openOverwrite, close: closeOverwrite }] = useDisclosure(false);
    const [fileToUpload, setFileToUpload] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchFiles = useCallback(() => {
        fetch(`/api/files/${directoryKey}`).then(res => res.json()).then(setFiles);
    }, [directoryKey]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const handleUpload = async (file, overwrite = false) => {
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`/api/files/${directoryKey}?overwrite=${overwrite}`, { method: 'POST', body: formData });
            if (response.status === 409) {
                setFileToUpload(file);
                openOverwrite();
            } else if (response.ok) {
                notifications.show({ title: 'Success', message: `${file.name} uploaded.`, color: 'teal' });
                fetchFiles();
            } else {
                const err = await response.json();
                notifications.show({ title: 'Upload Failed', message: err.detail, color: 'red' });
            }
        } finally {
            setUploading(false);
            setFileToUpload(null);
        }
    };

    const handleDelete = (filename) => {
        setSelectedFile(filename);
        openDelete();
    };

    const confirmDelete = async () => {
        await fetch(`/api/files/${directoryKey}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: selectedFile }),
        });
        notifications.show({ title: 'File Deleted', message: `${selectedFile} moved to trash.`, color: 'blue' });
        fetchFiles();
        closeDelete();
    };

    const filteredFiles = files.filter(file => file.toLowerCase().includes(searchQuery.toLowerCase()));

    const rows = filteredFiles.map((file) => (
        <Table.Tr 
            key={file} 
            bg={file === activeFile ? 'var(--mantine-color-blue-9)' : undefined} 
            onClick={() => onFileSelect(file)} 
            style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
            className="hover:bg-zinc-800"
        >
            <Table.Td style={{ padding: '12px 16px' }}>
                <Text size="sm" truncate fw={file === activeFile ? 600 : 400} c={file === activeFile ? 'blue.1' : 'dimmed'}>
                    {file}
                </Text>
            </Table.Td>
            <Table.Td style={{ padding: '12px 16px', width: '50px' }}>
                <Group gap="xs" justify="flex-end">
                    <Tooltip label="Delete">
                        <ActionIcon color="red" variant="subtle" onClick={(e) => { e.stopPropagation(); handleDelete(file); }}>
                            <Trash2 size={16} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Table.Td>
        </Table.Tr>
    ));

    return (
        <>
            <ActionCard title={title} icon={icon} rightSection={<ActionIcon variant="default" onClick={fetchFiles}><RefreshCw size={16} /></ActionIcon>}>
                <Stack gap="md">
                    <TextInput
                        placeholder="Search files..."
                        leftSection={<Search size={14} />}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                        size="xs"
                        mt="sm"
                    />
                    
                    <ScrollArea h={200} type="auto" offsetScrollbars>
                        <Table verticalSpacing="sm" striped highlightOnHover withRowBorders={false}>
                            <Table.Tbody>{rows}</Table.Tbody>
                        </Table>
                        {filteredFiles.length === 0 && (
                            <Text c="dimmed" size="sm" ta="center" py="xl">No files found</Text>
                        )}
                    </ScrollArea>

                    <FileInput
                        placeholder={`Upload ${fileExtension} file...`}
                        onChange={handleUpload}
                        accept={fileExtension}
                        leftSection={<Upload size={16} />}
                        loading={uploading || undefined}
                        clearable
                        size="sm"
                    />
                </Stack>
            </ActionCard>

            <Modal opened={deleteModal} onClose={closeDelete} title="Confirm Deletion" centered>
                <Text size="sm">Are you sure you want to move <Text span fw={700} c="white">{selectedFile}</Text> to the trash?</Text>
                <Group justify="flex-end" mt="xl">
                    <Button variant="default" onClick={closeDelete} size="xs">Cancel</Button>
                    <Button color="red" onClick={confirmDelete} size="xs">Delete</Button>
                </Group>
            </Modal>

            <Modal opened={overwriteModal} onClose={closeOverwrite} title="Confirm Overwrite" centered>
                <Text size="sm"><Text span fw={700} c="white">{fileToUpload?.name}</Text> already exists. Do you want to move the old file to trash and overwrite it?</Text>
                <Group justify="flex-end" mt="xl">
                    <Button variant="default" onClick={closeOverwrite} size="xs">Cancel</Button>
                    <Button color="orange" onClick={() => { handleUpload(fileToUpload, true); closeOverwrite(); }} size="xs">Overwrite</Button>
                </Group>
            </Modal>
        </>
    );
};
