/**
 * Stage 6.4: photo resize before upload.
 *
 * REAL LOGIC: computeResizedDimensions (all the maths) and resizeImageForUpload's
 * orchestration (decode -> size -> encode at q=0.85 -> release bitmap).
 * MOCKED AT THE BROWSER BOUNDARY: createImageBitmap and the canvas encoder,
 * because jsdom has no image decoder; the tests assert the orientation option
 * and the sizes/quality handed to them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeResizedDimensions,
  decodeWithOrientation,
  resizeImageForUpload,
  UPLOAD_JPEG_QUALITY,
  UPLOAD_MAX_SIDE,
  type ResizeDeps,
} from '../imageResize';

describe('computeResizedDimensions (real maths)', () => {
  it('uses 1600px max side and JPEG quality 0.85', () => {
    expect(UPLOAD_MAX_SIDE).toBe(1600);
    expect(UPLOAD_JPEG_QUALITY).toBe(0.85);
  });

  it.each([
    ['landscape 4:3', 4000, 3000, 1600, 1200],
    ['portrait 3:4', 3000, 4000, 1200, 1600],
    ['phone camera 4032x3024', 4032, 3024, 1600, 1200],
    ['square', 2000, 2000, 1600, 1600],
    ['16:9 video still', 3840, 2160, 1600, 900],
    ['just over the limit rounds the short side', 1601, 1000, 1600, 999],
    ['extreme panorama keeps at least 1px', 50000, 10, 1600, 1],
  ])('%s: %ix%i -> %ix%i', (_label, w, h, ew, eh) => {
    expect(computeResizedDimensions(w, h)).toEqual({ width: ew, height: eh, scaled: true });
  });

  it('the longest side always lands exactly on the limit and aspect ratio is kept within rounding', () => {
    for (const [w, h] of [[4000, 2999], [2999, 4000], [1777, 1600], [5000, 3333]]) {
      const r = computeResizedDimensions(w, h);
      expect(Math.max(r.width, r.height)).toBe(1600);
      expect(Math.abs(r.width / r.height - w / h)).toBeLessThan(0.01);
    }
  });

  it('never upscales: images already within 1600px keep their size (re-encoded only)', () => {
    expect(computeResizedDimensions(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(computeResizedDimensions(1600, 1200)).toEqual({ width: 1600, height: 1200, scaled: false });
    expect(computeResizedDimensions(1600, 1600)).toEqual({ width: 1600, height: 1600, scaled: false });
  });

  it('rejects impossible dimensions instead of guessing a size', () => {
    for (const [w, h] of [[0, 100], [100, -1], [NaN, 100], [Infinity, 100]]) {
      expect(() => computeResizedDimensions(w, h)).toThrow('Invalid image dimensions');
    }
  });
});

describe('resizeImageForUpload (real orchestration, fake decoder/encoder)', () => {
  const makeDeps = (width: number, height: number) => {
    const close = vi.fn();
    const source = { tag: 'bitmap' } as unknown as CanvasImageSource;
    const out = new Blob(['jpeg'], { type: 'image/jpeg' });
    const deps: ResizeDeps = {
      decode: vi.fn(async () => ({ width, height, source, close })),
      encode: vi.fn(async () => out),
    };
    return { deps, close, source, out };
  };

  it('encodes at the computed size with quality 0.85 and releases the bitmap', async () => {
    const { deps, close, source, out } = makeDeps(4032, 3024);
    const input = new Blob(['raw'], { type: 'image/jpeg' });

    await expect(resizeImageForUpload(input, deps)).resolves.toBe(out);
    expect(deps.decode).toHaveBeenCalledWith(input);
    expect(deps.encode).toHaveBeenCalledWith(source, 1600, 1200, 0.85);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('EXIF orientation: sizes come from the UPRIGHT (decoded) image, so a sideways-stored portrait stays portrait', async () => {
    // A portrait photo stored as 4032x3024 pixels with EXIF orientation 6 decodes
    // (imageOrientation: 'from-image') as 3024x4032.
    const { deps } = makeDeps(3024, 4032);
    await resizeImageForUpload(new Blob(['raw']), deps);
    expect(deps.encode).toHaveBeenCalledWith(expect.anything(), 1200, 1600, 0.85);
  });

  it('releases the bitmap even when encoding fails, and surfaces the error', async () => {
    const { deps, close } = makeDeps(2000, 1000);
    deps.encode = vi.fn(async () => {
      throw new Error('JPEG encoding failed');
    });
    await expect(resizeImageForUpload(new Blob(['raw']), deps)).rejects.toThrow('JPEG encoding failed');
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('decodeWithOrientation (browser boundary)', () => {
  const original = (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
  afterEach(() => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = original;
  });

  it("asks the browser to apply EXIF orientation (imageOrientation: 'from-image')", async () => {
    const bitmap = { width: 3024, height: 4032, close: vi.fn() };
    const spy = vi.fn(async () => bitmap);
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = spy;

    const blob = new Blob(['raw'], { type: 'image/jpeg' });
    const decoded = await decodeWithOrientation(blob);

    expect(spy).toHaveBeenCalledWith(blob, { imageOrientation: 'from-image' });
    expect(decoded).toMatchObject({ width: 3024, height: 4032 });
    decoded.close?.();
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('throws (so the caller can fall back) when createImageBitmap is unavailable', async () => {
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = undefined;
    await expect(decodeWithOrientation(new Blob(['x']))).rejects.toThrow('createImageBitmap is not available');
  });
});
