// ponytail: one boolean + one URL resolver — no @tauri-apps/* imports so the
// browser build never hard-depends on Tauri at module load.

const DEFAULT_DESKTOP_BASE = 'http://127.0.0.1:8350';

const trimTrailingSlash = (v) => String(v).replace(/\/+$/, '');

/** True when running inside the Tauri webview (desktop sidecar). */
export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI__);
}

/**
 * Resolve the REST/WS base URL.
 * Priority: explicit override → VITE_ENGINE_BASE_URL → same-origin (browser) → 127.0.0.1:8350 (Tauri).
 * @param {{ explicit?: string, locationOrigin?: string, inTauri?: boolean }} [opts] test hooks
 */
export function resolveApiBase(opts = {}) {
  const explicit = trimTrailingSlash(opts.explicit ?? import.meta?.env?.VITE_ENGINE_BASE_URL ?? '');
  if (explicit) return explicit;

  const inTauri = opts.inTauri ?? isTauri();
  if (!inTauri) {
    const origin = opts.locationOrigin ?? (typeof window !== 'undefined' ? window.location?.origin : '');
    if (origin && origin !== 'null') return trimTrailingSlash(origin);
  }

  return DEFAULT_DESKTOP_BASE;
}
