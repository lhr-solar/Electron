import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';

const theme = createTheme({
  primaryColor: 'dark',
  defaultRadius: 'xs',
  fontFamily: 'var(--font-sans)',
  colors: {
    dark: [
      '#e4e4e7',
      '#a1a1aa',
      '#71717a',
      '#52525b',
      '#3f3f46',
      '#27272a',
      '#18181b',
      '#0f0f11',
      '#0a0a0b',
      '#050506',
    ],
  },
  other: {
    border: '#1f1f23',
    surface: '#0f0f11',
    surfaceHover: '#18181b',
  },
  components: {
    Select: {
      defaultProps: {
        styles: {
          input: { backgroundColor: '#0f0f11', borderColor: '#1f1f23', color: '#e4e4e7' },
        },
      },
    },
    TextInput: {
      defaultProps: {
        styles: {
          input: { backgroundColor: '#0f0f11', borderColor: '#1f1f23', color: '#e4e4e7' },
        },
      },
    },
    SegmentedControl: {
      defaultProps: {
        styles: {
          root: { backgroundColor: '#0a0a0b' },
          indicator: { backgroundColor: '#27272a' },
          label: { color: '#a1a1aa' },
        },
      },
    },
    Button: {
      defaultProps: {
        styles: {
          root: { borderColor: '#1f1f23', color: '#e4e4e7' },
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="bottom-left" autoClose={3000} />
      <App />
    </MantineProvider>
  </React.StrictMode>
);
