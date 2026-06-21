import { describe, it, expect, vi } from 'vitest';
import { createEventsClient } from './eventsClient.js';

describe('createEventsClient', () => {
  it('start posts to /api/events', async () => {
    const apiJson = vi.fn().mockResolvedValue({ id: 'e1', name: 'Lap 3' });
    const client = createEventsClient(apiJson);
    await client.start({ name: 'Lap 3', tags: ['test'] });
    expect(apiJson).toHaveBeenCalledWith('/api/events', {
      method: 'POST',
      body: JSON.stringify({ name: 'Lap 3', tags: ['test'] }),
    });
  });

  it('stop posts to /api/events/{id}/stop', async () => {
    const apiJson = vi.fn().mockResolvedValue({ id: 'e1', end_ts_ns: 1 });
    const client = createEventsClient(apiJson);
    await client.stop('abc-123');
    expect(apiJson).toHaveBeenCalledWith('/api/events/abc-123/stop', { method: 'POST' });
  });

  it('probe returns false on 404', async () => {
    const err = new Error('Not Found');
    err.status = 404;
    const apiJson = vi.fn().mockRejectedValue(err);
    const client = createEventsClient(apiJson);
    await expect(client.probe()).resolves.toBe(false);
  });

  it('listRecent returns [] when events API is unavailable', async () => {
    const err = new Error('Not Found');
    err.status = 404;
    const apiJson = vi.fn().mockRejectedValue(err);
    const client = createEventsClient(apiJson);
    await expect(client.listRecent()).resolves.toEqual([]);
  });

  it('getActive unwraps { event } payloads', async () => {
    const apiJson = vi.fn().mockResolvedValue({ event: { id: 'e1', name: 'Run' } });
    const client = createEventsClient(apiJson);
    await expect(client.getActive()).resolves.toEqual({ id: 'e1', name: 'Run' });
  });
});
