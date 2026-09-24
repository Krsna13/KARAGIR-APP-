import { describe, it, expect } from 'vitest';
import { checkDevToolsEnabled, getActiveDevRoute } from '../devTools';

describe('DevTools Gating Configuration', () => {
  it('enables dev tools when VITE_ENABLE_DEV_TOOLS is "true", even in non-DEV builds (phone testing)', () => {
    const isEnabled = checkDevToolsEnabled({
      VITE_ENABLE_DEV_TOOLS: 'true',
      DEV: false,
    });
    expect(isEnabled).toBe(true);
  });

  it('disables dev tools when VITE_ENABLE_DEV_TOOLS is "false"', () => {
    const isEnabled = checkDevToolsEnabled({
      VITE_ENABLE_DEV_TOOLS: 'false',
      DEV: true,
    });
    expect(isEnabled).toBe(false);
  });

  it('disables dev tools in production web build (DEV=false, VITE_ENABLE_DEV_TOOLS undefined)', () => {
    const isEnabled = checkDevToolsEnabled({
      VITE_ENABLE_DEV_TOOLS: undefined,
      DEV: false,
    });
    expect(isEnabled).toBe(false);
  });

  it('enables dev tools in local dev server (DEV=true, VITE_ENABLE_DEV_TOOLS undefined)', () => {
    const isEnabled = checkDevToolsEnabled({
      VITE_ENABLE_DEV_TOOLS: undefined,
      DEV: true,
    });
    expect(isEnabled).toBe(true);
  });

  describe('getActiveDevRoute', () => {
    it('returns "device-check" when visiting /dev/device-check and dev tools are enabled', () => {
      expect(getActiveDevRoute('/dev/device-check', '', true)).toBe('device-check');
      expect(getActiveDevRoute('/', '#/dev/device-check', true)).toBe('device-check');
    });

    it('returns "voice-input" when visiting /dev/voice-input and dev tools are enabled', () => {
      expect(getActiveDevRoute('/dev/voice-input', '', true)).toBe('voice-input');
      expect(getActiveDevRoute('/', '#/dev/voice-input', true)).toBe('voice-input');
    });

    it('returns "dataset-collector" when visiting /dev/dataset-collector and dev tools are enabled', () => {
      expect(getActiveDevRoute('/dev/dataset-collector', '', true)).toBe('dataset-collector');
      expect(getActiveDevRoute('/', '#/dev/dataset-collector', true)).toBe('dataset-collector');
    });

    it('returns null for normal application routes', () => {
      expect(getActiveDevRoute('/', '', true)).toBe(null);
      expect(getActiveDevRoute('/store', '', true)).toBe(null);
    });

    it('returns null for dev routes when dev tools are disabled (production web build)', () => {
      expect(getActiveDevRoute('/dev/device-check', '', false)).toBe(null);
      expect(getActiveDevRoute('/dev/voice-input', '', false)).toBe(null);
      expect(getActiveDevRoute('/dev/dataset-collector', '', false)).toBe(null);
    });
  });
});
