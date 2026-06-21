import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SharepointGuard from './components/SharepointGuard.jsx';
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

const SETTINGS = {
  defaultVehicle: null,
  defaultReadBitrate: 500000,
  sharepoint: { remoteUrl: READY_STATUS.remoteUrl, branch: 'custom_mdc' },
};

beforeEach(() => {
  window.matchMedia ||= () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {},
  });
  globalThis.ResizeObserver ||= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.WebSocket ||= class {
    constructor() {}
    close() {}
    send() {}
  };
});

function mountGuard(status, settings = SETTINGS) {
  const fetchMock = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/api/sharepoint/status')) {
      return { ok: true, json: async () => status };
    }
    if (u.includes('/api/settings')) {
      return { ok: true, json: async () => settings };
    }
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);

  const client = createEngineClient({ baseUrl: 'http://127.0.0.1:8350' });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);

  act(() => {
    root.render(
      <StrictMode>
        <MantineProvider theme={teslaTheme} defaultColorScheme="dark">
          <EngineProvider client={client}>
            <SharepointGuard>
              <div data-testid="app-ready">ready</div>
            </SharepointGuard>
          </EngineProvider>
        </MantineProvider>
      </StrictMode>,
    );
  });

  return { el, root };
}

describe('SharepointGuard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows Install Git when gitInstalled is false', async () => {
    const { el, root } = mountGuard({
      ...READY_STATUS,
      gitInstalled: false,
      cloned: false,
      canRootExists: false,
    });
    await act(async () => {});
    expect(el.textContent).toContain('Install Git');
    expect(el.textContent).not.toContain('ready');
    act(() => root.unmount());
  });

  it('shows Set up data when not cloned or canRoot missing', async () => {
    const { el, root } = mountGuard({
      ...READY_STATUS,
      cloned: false,
      canRootExists: false,
      branch: null,
      commit: null,
    });
    await act(async () => {});
    expect(el.textContent).toContain('Set up data');
    expect(el.textContent).toContain('Clone');
    expect(el.textContent).not.toContain('ready');
    act(() => root.unmount());
  });

  it('renders children when git and checkout are ready', async () => {
    const { el, root } = mountGuard(READY_STATUS);
    await act(async () => {});
    expect(el.textContent).toContain('ready');
    expect(el.textContent).not.toContain('Install Git');
    expect(el.textContent).not.toContain('Set up data');
    act(() => root.unmount());
  });
});
