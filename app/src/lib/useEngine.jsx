// React bindings over engineClient: one shared connection via context, plus
// hooks for status and live batches. Theme/editor agents consume these — they
// must not open their own WS.

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { engineClient } from './engineClient.js';
import { DEFAULT_STATUS } from './engineContract.js';

const EngineContext = createContext(engineClient);

export function EngineProvider({ client = engineClient, children }) {
  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);
  return <EngineContext.Provider value={client}>{children}</EngineContext.Provider>;
}

export const useEngineClient = () => useContext(EngineContext);

/** Latest engine status + live connection flag. */
export function useEngineStatus() {
  const client = useEngineClient();
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [connected, setConnected] = useState(client.connected);

  useEffect(() => {
    const offStatus = client.on('status', setStatus);
    const offOpen = client.on('open', () => setConnected(true));
    const offClose = client.on('close', () => setConnected(false));
    return () => {
      offStatus();
      offOpen();
      offClose();
    };
  }, [client]);

  return { status, connected };
}

/**
 * Subscribe to live_message_batch. `onBatch` runs for each batch; use it to push
 * into a ref/store. Returning data directly would re-render on every batch
 * (100ms cadence in v3), so we leave buffering to the caller.
 * @param {(messages: import('./engineContract.js').EngineMessage[]) => void} onBatch
 */
export function useLiveMessages(onBatch) {
  const client = useEngineClient();
  const cb = useRef(onBatch);
  cb.current = onBatch;
  useEffect(() => client.on('live_message_batch', (msgs) => cb.current(msgs)), [client]);
}
