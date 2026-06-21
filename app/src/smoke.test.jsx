import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter } from 'react-router-dom';
import { expect, it, beforeAll, vi } from 'vitest';
import App from './App.jsx';
import { EngineProvider } from './lib/useEngine.jsx';
import { createEngineClient } from './lib/engineClient.js';
import { teslaTheme } from './theme/teslaTheme.js';

const READY_STATUS = {
  gitInstalled: true,
  cloned: true,
  branch: 'custom_mdc',
  dirty: false,
  canRootExists: true,
  remoteUrl: 'https://github.com/lhr-solar/Embedded-Sharepoint.git',
  commit: 'abc1234',
};

beforeAll(() => {
  window.matchMedia ||= (q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() {} });
  globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
  globalThis.WebSocket ||= class { constructor() {} close() {} send() {} };

  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/api/sharepoint/status')) {
      return { ok: true, json: async () => READY_STATUS };
    }
    if (u.includes('/api/settings')) {
      return {
        ok: true,
        json: async () => ({
          defaultVehicle: null,
          defaultReadBitrate: 500000,
          sharepoint: { remoteUrl: READY_STATUS.remoteUrl, branch: 'custom_mdc' },
        }),
      };
    }
    if (u.includes('/api/vehicles')) {
      return { ok: true, json: async () => [] };
    }
    if (u.includes('/api/config')) {
      return {
        ok: true,
        json: async () => ({
          role: 'desktop',
          sources: [],
          sinks: [],
          api: { host: '127.0.0.1', port: 8350 },
          server: { listeners: [] },
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  }));
});

it('mounts the full app tree without throwing', async () => {
  const client = createEngineClient({ baseUrl: 'http://127.0.0.1:8350' });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <StrictMode>
        <MantineProvider theme={teslaTheme} defaultColorScheme="dark">
          <EngineProvider client={client}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </EngineProvider>
        </MantineProvider>
      </StrictMode>,
    );
  });
  expect(el.textContent).toContain('CAN');
  act(() => root.unmount());
});
