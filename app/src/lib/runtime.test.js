import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTauri, resolveApiBase } from './runtime.js';

describe('isTauri', () => {
  afterEach(() => {
    delete globalThis.window.__TAURI__;
  });

  it('returns false when __TAURI__ is absent', () => {
    globalThis.window.__TAURI__ = undefined;
    expect(isTauri()).toBe(false);
  });

  it('returns true when __TAURI__ is present', () => {
    globalThis.window.__TAURI__ = {};
    expect(isTauri()).toBe(true);
  });
});

describe('resolveApiBase', () => {
  it('prefers an explicit override', () => {
    expect(resolveApiBase({ explicit: 'http://api.test/' })).toBe('http://api.test');
  });

  it('uses same-origin in the browser (non-Tauri)', () => {
    expect(
      resolveApiBase({
        explicit: '',
        inTauri: false,
        locationOrigin: 'http://vehicle.local:8350',
      }),
    ).toBe('http://vehicle.local:8350');
  });

  it('falls back to 127.0.0.1:8350 in Tauri when no override', () => {
    expect(resolveApiBase({ explicit: '', inTauri: true })).toBe('http://127.0.0.1:8350');
  });
});
