import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  colors: {
    // Custom "Deep Dark" palette
    dark: [
      '#C1C2C5', // 0
      '#A6A7AB', // 1
      '#909296', // 2
      '#5C5F66', // 3
      '#373A40', // 4
      '#2C2E33', // 5
      '#25262B', // 6
      '#1A1B1E', // 7
      '#141517', // 8
      '#101113', // 9 (Deepest black)
    ],
  },
  components: {
    Paper: {
      defaultProps: {
        bg: 'dark.8', // Use a very dark gray for cards
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="bottom-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>
);
