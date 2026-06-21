// v3-native bus-load math (mirrors @mdc-lib/busload.mjs with cantools field names).

import { DEFAULT_CYCLE_TIME_MS } from './mdcModel.js';
import { isCyclicMessage, networkIsFd } from './v3compat.js';

/** Standard CAN bitrates (bps), identical set + order everywhere. */
export const STANDARD_SPEEDS = [125000, 250000, 500000, 1000000, 33333, 50000, 800000];

// ponytail: renamed in destructure to avoid collision with v3 field read at call site.
export function bitsPerFrame({ length, isExtended = false, isFd = false }) {
  const dlc = length;
  const dataBits = 8 * dlc;
  if (isFd) {
    const crc = dlc > 16 ? 21 : 17;
    const overhead = isExtended ? 32 : 28;
    const fixedStuff = 6;
    return overhead + dataBits + crc + fixedStuff;
  }
  const base = isExtended ? 67 : 47;
  const stuffableBase = isExtended ? 39 : 34;
  const stuffing = Math.ceil((stuffableBase + dataBits) / 4);
  return base + dataBits + stuffing;
}

function messageBitsPerSecond(message, network) {
  const cycleTimeMs =
    typeof message.cycle_time === 'number' && message.cycle_time > 0
      ? message.cycle_time
      : DEFAULT_CYCLE_TIME_MS;
  const framesPerSecond = 1000 / cycleTimeMs;
  return (
    framesPerSecond *
    bitsPerFrame({
      length: message.length,
      isExtended: message.is_extended_frame,
      isFd: message.is_fd || networkIsFd(network),
    })
  );
}

export function loadPercentAt(messages, bitrate, network = null) {
  const bitsPerSecond = messages
    .filter(isCyclicMessage)
    .reduce((sum, m) => sum + messageBitsPerSecond(m, network), 0);
  return (bitsPerSecond / bitrate) * 100;
}

export function networkSpeeds(messages, configured, network = null) {
  const speedSet = new Set(STANDARD_SPEEDS);
  if (typeof configured === 'number') speedSet.add(configured);
  return [...speedSet]
    .map((speed) => ({
      speed,
      loadPercent: loadPercentAt(messages, speed, network),
      isConfigured: speed === configured,
    }))
    .sort((a, b) => {
      if (a.isConfigured !== b.isConfigured) return a.isConfigured ? -1 : 1;
      return a.speed - b.speed;
    });
}

export function computeBusLoad(project) {
  const networks = [];
  for (const network of project?.networks ?? []) {
    const messages = network.messages ?? [];
    networks.push({
      network: network.id,
      busType: networkIsFd(network) ? 'canfd' : 'can',
      bitrate: network.baudrate ?? null,
      cyclicMessageCount: messages.filter(isCyclicMessage).length,
      speeds: networkSpeeds(messages, network.baudrate, network),
    });
  }
  return { networks };
}

export function busLoadForNetwork(network) {
  const messages = network?.messages ?? [];
  return {
    busType: networkIsFd(network) ? 'canfd' : 'can',
    bitrate: network?.baudrate ?? null,
    cyclicMessageCount: messages.filter(isCyclicMessage).length,
    speeds: networkSpeeds(messages, network?.baudrate, network),
  };
}

export function formatSpeed(bps) {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(bps % 1_000_000 ? 3 : 0)} Mbit/s`;
  return `${Math.round(bps / 1000)} kbit/s`;
}
