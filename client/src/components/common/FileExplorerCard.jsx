import React, { useState, useEffect, useCallback } from 'react';
import { ActionCard } from './ActionCard';
import { ScrollArea, Table, Group, ActionIcon, Text, FileInput, Tooltip, Modal, Button } from '@mantine/core';
import { Trash2, Upload, RefreshCw } from 'lucide-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';

export const FileExplorerCard = ({ title, icon, directoryKey, fileExtension, onFileSelect, activeFile }) => {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [deleteModal, { open: openDelete, close: closeDelete }] = useDisclosure(false);
    const [overwriteModal, { open: openOverwrite, close: closeOverwrite }] = useDisclosure(false);
    const [fileToUpload, setFileToUpload] = useState(null);

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

    const rows = files.map((file) => (
        <Table.Tr key={file} bg={file === activeFile ? 'blue.9' : undefined} onClick={() => onFileSelect(file)} style={{ cursor: 'pointer' }}>
            <Table.Td><Text size="sm" truncate>{file}</Text></Table.Td>
            <Table.Td>
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
                <ScrollArea h={150} mb="md">
                    <Table verticalSpacing="xs" striped>
                        <Table.Tbody>{rows}</Table.Tbody>
                    </Table>
                </ScrollArea>
                <FileInput
                    placeholder={`Upload ${fileExtension} file...`}
                    onChange={handleUpload}
                    accept={fileExtension}
                    leftSection={<Upload size={16} />}
                    loading={uploading || undefined}
                    clearable
                />
            </ActionCard>

            <Modal opened={deleteModal} onClose={closeDelete} title="Confirm Deletion">
                <Text>Are you sure you want to move <Text span fw={700}>{selectedFile}</Text> to the trash?</Text>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={closeDelete}>Cancel</Button>
                    <Button color="red" onClick={confirmDelete}>Delete</Button>
                </Group>
            </Modal>

            <Modal opened={overwriteModal} onClose={closeOverwrite} title="Confirm Overwrite">
                <Text><Text span fw={700}>{fileToUpload?.name}</Text> already exists. Do you want to move the old file to trash and overwrite it?</Text>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={closeOverwrite}>Cancel</Button>
                    <Button color="orange" onClick={() => { handleUpload(fileToUpload, true); closeOverwrite(); }}>Overwrite</Button>
                </Group>
            </Modal>
        </>
    );
};
