/**
 * Merge live_message_batch items into the signal dashboard cache shape.
 * Pure function — safe to call from interval flushes without React setState storms.
 */

export function parseCacheKey(key) {
  const idx = key.indexOf('::');
  if (idx === -1) return { vehicle: '', sender: key };
  return { vehicle: key.slice(0, idx), sender: key.slice(idx + 2) };
}

export function mergeBatchIntoCache(prev, msgs) {
  const next = { ...prev };
  for (const msg of msgs) {
    const sender = msg.sender || 'Unknown';
    const vehicle = msg.vehicle || 'unknown';
    const cacheKey = `${vehicle}::${sender}`;
    const canId = msg.can_id_hex;
    if (!canId) continue;
    if (!next[cacheKey]) next[cacheKey] = {};
    next[cacheKey] = { ...next[cacheKey] };

    const arrayIndex = msg.array_index;
    if (arrayIndex != null) {
      const existing = next[cacheKey][canId];
      const mergedSignals = existing && existing.is_array ? { ...existing.signals } : {};
      const incoming = msg.signals || {};
      const indexSet = new Set(existing && existing.indices ? existing.indices : []);
      indexSet.add(arrayIndex);
      const indices = Array.from(indexSet).sort((a, b) => a - b);
      for (const [sigName, sigVal] of Object.entries(incoming)) {
        const map =
          mergedSignals[sigName] &&
          typeof mergedSignals[sigName] === 'object' &&
          !Array.isArray(mergedSignals[sigName])
            ? { ...mergedSignals[sigName] }
            : {};
        map[arrayIndex] = sigVal;
        mergedSignals[sigName] = map;
      }
      next[cacheKey][canId] = {
        message_name: msg.message_name,
        network: msg.network || 'not_found',
        signals: mergedSignals,
        units: msg.units || (existing && existing.units) || {},
        is_array: true,
        indices,
        raw_packet: msg.raw_packet || '',
        timestamp_ns: msg.timestamp_ns || 0,
      };
    } else {
      next[cacheKey][canId] = {
        message_name: msg.message_name,
        network: msg.network || 'not_found',
        signals: msg.signals || {},
        units: msg.units || {},
        raw_packet: msg.raw_packet || '',
        timestamp_ns: msg.timestamp_ns || 0,
      };
    }
  }
  return next;
}
