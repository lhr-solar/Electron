import React from 'react';
import { Container, SimpleGrid } from '@mantine/core';
import { Header } from './components/Header';
import { ConfigDeck } from './components/ConfigDeck';
import { DbcManagement } from './components/DbcManagement';
import { DatabaseManagement } from './components/DatabaseManagement';

function App() {
  return (
    <div style={{ backgroundColor: 'var(--mantine-color-dark-9)' }}>
      <Container size="xl" py="lg">
        <Header />
        <SimpleGrid
          cols={{ base: 1, md: 2, lg: 3 }}
          spacing="lg"
          mt="lg"
        >
          <ConfigDeck />
          <DbcManagement />
          <DatabaseManagement />
        </SimpleGrid>
      </Container>
    </div>
  );
}

export default App;
