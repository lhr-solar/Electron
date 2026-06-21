import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEngineClient } from './engineClient.js';

describe('engineClient MDC routes', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function okJson(data) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => data,
    });
  }

  it('getSpec hits /api/mdc/{spec_id}', async () => {
    okJson({ vehicles: [] });
    const client = createEngineClient({ baseUrl: 'http://127.0.0.1:8350' });
    await client.getSpec('lhr-ev1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8350/api/mdc/lhr-ev1',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('saveSpec PUTs to /api/mdc/{spec_id}', async () => {
    okJson({ id: 'default' });
    const client = createEngineClient({ baseUrl: 'http://127.0.0.1:8350' });
    const spec = { schemaVersion: '1.0.0', vehicles: [] };
    await client.saveSpec('default', spec);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8350/api/mdc/default',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(spec),
      }),
    );
  });

  it('listMdc hits GET /api/mdc', async () => {
    okJson([{ id: 'default', metadata: {} }]);
    const client = createEngineClient({ baseUrl: 'http://127.0.0.1:8350' });
    await client.listMdc();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8350/api/mdc',
      expect.any(Object),
    );
  });
});
