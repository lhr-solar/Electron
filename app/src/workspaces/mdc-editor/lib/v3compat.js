// ponytail: bridges editor v3 field names to @mdc-lib helpers still on v2 keys until tools flatten lands.

/** send_type labels excluded from bus-load (contract.md §7). */
export const SEND_TYPE_TRIGGERED = new Set([
  'ifactive',
  'triggered',
  'event',
  'nosig',
  'nosigsend',
  'spontaneous',
  'none',
  'nomsgsendtype',
]);

/** True when a message counts toward bus load. */
export function isCyclicMessage(message) {
  const st = String(message?.send_type ?? '').toLowerCase();
  return !SEND_TYPE_TRIGGERED.has(st);
}

/** CAN FD implied by network fd_baudrate (contract.md §3.4). */
export function networkIsFd(network) {
  return network?.fd_baudrate != null && network.fd_baudrate > 0;
}

/** Adapt a v3 signal for legacy @mdc-lib bit/mux validators. */
export function legacySignalForValidation(signal) {
  const mux = signal.is_multiplexer
    ? { role: 'multiplexor' }
    : signal.multiplexer_signal
      ? {
          role: 'multiplexed',
          multiplexorName: signal.multiplexer_signal,
          ids: signal.multiplexer_ids ?? [],
        }
      : undefined;
  return {
    ...signal,
    startBit: signal.start,
    lengthBits: signal.length,
    byteOrder: signal.byte_order,
    multiplexer: mux,
  };
}

/** Adapt a v3 message for legacy @mdc-lib validators. */
export function legacyMessageForValidation(message) {
  if (!message) return message;
  return {
    ...message,
    signals: (message.signals ?? []).map(legacySignalForValidation),
  };
}
