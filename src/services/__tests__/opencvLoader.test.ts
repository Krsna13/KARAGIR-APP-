import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOpenCV,
  isOpenCVLoaded,
  setOpenCVForTesting,
  resetOpenCVLoader,
} from '../opencvLoader';

describe('OpenCVLoader (Stage 6.3b)', () => {
  beforeEach(() => {
    resetOpenCVLoader();
  });

  afterEach(() => {
    resetOpenCVLoader();
  });

  it('reports not loaded initially when window.cv is absent', () => {
    expect(isOpenCVLoaded()).toBe(false);
  });

  it('returns injected mock instance when setOpenCVForTesting is used', async () => {
    const mockCv = { Mat: vi.fn(), version: '4.10.0' };
    setOpenCVForTesting(mockCv);

    expect(isOpenCVLoaded()).toBe(true);
    const loadedCv = await getOpenCV();
    expect(loadedCv).toBe(mockCv);
  });

  it('falls back to null cleanly in JSDOM / headless environment without throwing', async () => {
    // In JSDOM, getOpenCV returns null so callers can fall back to correctLighting
    const result = await getOpenCV();
    expect(result).toBeNull();
    expect(isOpenCVLoaded()).toBe(false);
  });
});
