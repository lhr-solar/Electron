// Thin REST client for named start/stop events (backend/API_CONTRACT.md).
// Degrades gracefully when the backend has not shipped the routes yet.

/**
 * @typedef {Object} TelemetryEvent
 * @property {string} id
 * @property {string} name
 * @property {number} start_ts_ns
 * @property {number|null} [end_ts_ns]
 * @property {string[]} [tags]
 * @property {string} [note]
 */

/**
 * @param {(path: string, options?: RequestInit) => Promise<unknown>} apiJson
 * shared fetch helper (engineClient or engineApi)
 */
export function createEventsClient(apiJson) {
  async function safeJson(path, options) {
    try {
      return { ok: true, data: await apiJson(path, options) };
    } catch (e) {
      if (e?.status === 404) return { ok: false, unavailable: true, error: e };
      const msg = e?.message ?? String(e);
      if (/404|not found/i.test(msg)) return { ok: false, unavailable: true, error: e };
      throw e;
    }
  }

  return {
    /** Probe whether events routes exist (404 → unavailable). */
    async probe() {
      const res = await safeJson('/api/events/active');
      return res.ok || !res.unavailable;
    },

    /** @param {{ name: string, tags?: string[], note?: string }} body */
    start(body) {
      return apiJson('/api/events', { method: 'POST', body: JSON.stringify(body) });
    },

    /** @param {string} id */
    stop(id) {
      return apiJson(`/api/events/${encodeURIComponent(id)}/stop`, { method: 'POST' });
    },

    /** @returns {Promise<TelemetryEvent|null>} */
    async getActive() {
      const res = await safeJson('/api/events/active');
      if (!res.ok) return null;
      const data = res.data;
      if (data == null) return null;
      if (typeof data === 'object' && 'event' in data) return data.event ?? null;
      return data;
    },

    /**
     * @param {{ from?: string, to?: string }} [range] ISO timestamps for the query window
     * @returns {Promise<TelemetryEvent[]>}
     */
    async listRecent(range = {}) {
      const params = new URLSearchParams();
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      const qs = params.toString();
      const res = await safeJson(`/api/events${qs ? `?${qs}` : ''}`);
      if (!res.ok) return [];
      const data = res.data;
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.events)) return data.events;
      return [];
    },
  };
}
