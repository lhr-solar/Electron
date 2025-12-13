import React from 'react';
import { Paper, Title, Group } from '@mantine/core';

export const ActionCard = ({ title, icon, children }) => {
  return (
    <Paper withBorder p="md" radius="md" shadow="sm">
      <Group>
        {React.cloneElement(icon, { size: 20 })}
        <Title order={4}>{title}</Title>
      </Group>
      <div className="mt-4">
        {children}
      </div>
    </Paper>
  );
};
