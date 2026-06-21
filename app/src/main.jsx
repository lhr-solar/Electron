import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import App from './App.jsx';
import { EngineProvider } from './lib/useEngine.jsx';
import { teslaTheme } from './theme/teslaTheme.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={teslaTheme} defaultColorScheme="dark">
      <Notifications position="bottom-left" autoClose={3000} />
      <EngineProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </EngineProvider>
    </MantineProvider>
  </StrictMode>,
);
