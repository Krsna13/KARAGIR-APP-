import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActiveBackend,
  setDevBackendOverride,
  toggleDevBackend,
  runSegmentation,
  runSTT,
  runSLM,
  NotImplementedError,
} from '../aiRuntimeService';

vi.mock('@imgly/background-removal', () => ({
  removeBackground: vi.fn().mockImplementation(async (blob: Blob) => {
    if (blob.size === 0) {
      throw new Error('Empty blob');
    }
    if (blob.size === 999) {
      throw new Error('Simulated model execution failure');
    }
    return new Blob(['segmented-transparent-png'], { type: 'image/png' });
  }),
}));

declare const process: { env: Record<string, string | undefined> };

describe('aiRuntimeService', () => {
  const originalEnv = process.env.VITE_AI_BACKEND;

  beforeEach(() => {
    // Reset manual override and env before each test
    setDevBackendOverride(null);
    delete process.env.VITE_AI_BACKEND;
  });

  afterEach(() => {
    setDevBackendOverride(null);
    if (originalEnv !== undefined) {
      process.env.VITE_AI_BACKEND = originalEnv;
    } else {
      delete process.env.VITE_AI_BACKEND;
    }
  });

  describe('getActiveBackend()', () => {
    it('returns "cloud" by default in standard development/test environments', () => {
      expect(getActiveBackend()).toBe('cloud');
    });

    it('returns "on-device" when VITE_AI_BACKEND is configured as "on-device"', () => {
      process.env.VITE_AI_BACKEND = 'on-device';
      expect(getActiveBackend()).toBe('on-device');
    });

    it('returns "cloud" when VITE_AI_BACKEND is configured as "cloud"', () => {
      process.env.VITE_AI_BACKEND = 'cloud';
      expect(getActiveBackend()).toBe('cloud');
    });

    it('respects manual dev overrides over environment variables', () => {
      process.env.VITE_AI_BACKEND = 'cloud';
      setDevBackendOverride('on-device');
      expect(getActiveBackend()).toBe('on-device');

      setDevBackendOverride('cloud');
      expect(getActiveBackend()).toBe('cloud');
    });

    it('toggles active backend between "cloud" and "on-device" via toggleDevBackend()', () => {
      expect(getActiveBackend()).toBe('cloud');
      const toggled1 = toggleDevBackend();
      expect(toggled1).toBe('on-device');
      expect(getActiveBackend()).toBe('on-device');

      const toggled2 = toggleDevBackend();
      expect(toggled2).toBe('cloud');
      expect(getActiveBackend()).toBe('cloud');
    });
  });

  describe('runSegmentation()', () => {
    it('throws a clear error when an empty or invalid Blob is passed', async () => {
      const emptyBlob = new Blob([], { type: 'image/jpeg' });
      await expect(runSegmentation(emptyBlob)).rejects.toThrow('Empty or invalid image Blob');
    });

    it('successfully processes valid image blob and returns background-removed blob', async () => {
      const validBlob = new Blob(['valid-image-bytes-data'], { type: 'image/jpeg' });
      const result = await runSegmentation(validBlob);
      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('image/png');
    });

    it('rethrows errors clearly upon segmentation failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Create a blob with size 999 to trigger mock failure
      const failingBlob = new Blob([new Uint8Array(999)], { type: 'image/jpeg' });

      await expect(runSegmentation(failingBlob)).rejects.toThrow('Simulated model execution failure');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('runSTT()', () => {
    it('throws NotImplementedError cleanly without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const dummyAudioBlob = new Blob(['sample audio data'], { type: 'audio/wav' });

      setDevBackendOverride('cloud');
      await expect(runSTT(dummyAudioBlob, 'hi')).rejects.toThrow(NotImplementedError);

      try {
        await runSTT(dummyAudioBlob, 'hi');
      } catch (err) {
        expect(err).toBeInstanceOf(NotImplementedError);
        const error = err as NotImplementedError;
        expect(error.name).toBe('NotImplementedError');
        expect(error.feature).toBe('runSTT');
        expect(error.backend).toBe('cloud');
        expect(error.message).toContain("runSTT");
      }

      consoleSpy.mockRestore();
    });
  });

  describe('runSLM()', () => {
    it('throws NotImplementedError cleanly without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const dummyPrompt = 'Extract dimensions from dining table photo';
      const dummySchema = { type: 'object' };

      setDevBackendOverride('on-device');
      await expect(runSLM(dummyPrompt, dummySchema)).rejects.toThrow(NotImplementedError);

      try {
        await runSLM(dummyPrompt, dummySchema);
      } catch (err) {
        expect(err).toBeInstanceOf(NotImplementedError);
        const error = err as NotImplementedError;
        expect(error.name).toBe('NotImplementedError');
        expect(error.feature).toBe('runSLM');
        expect(error.backend).toBe('on-device');
        expect(error.message).toContain("runSLM");
      }

      consoleSpy.mockRestore();
    });
  });
});
