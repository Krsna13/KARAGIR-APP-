import { describe, it, expect, vi } from 'vitest';
import {
  checkPhotoQuality,
  checkCutout,
  downscaleGrayscale,
  computeVarianceOfLaplacian,
  computeLuminanceHistogramAndExposure,
  estimateNoiseFromFlatRegions,
  checkBlobPhotoQuality,
  checkBlobCutout,
  DEFAULT_QUALITY_THRESHOLDS,
  type PixelBuffer,
} from '../photoQualityService';

/**
 * Test helper: creates an RGBA PixelBuffer of specified dimensions filled with a generator function.
 */
function createTestBuffer(
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => [number, number, number, number]
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = pixelFn(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return { data, width, height };
}

describe('PhotoQualityService (Stage 6.3b, Part 1)', () => {
  describe('Resolution check', () => {
    it('passes resolution check when longest side is >= 800px', () => {
      const img = createTestBuffer(1000, 800, () => [128, 128, 128, 255]);
      const result = checkPhotoQuality(img);
      expect(result.quality_warnings).not.toContain('low_resolution');
    });

    it('flags low_resolution when both width and height are under 800px', () => {
      const img = createTestBuffer(640, 480, () => [128, 128, 128, 255]);
      const result = checkPhotoQuality(img);
      expect(result.quality_warnings).toContain('low_resolution');
    });

    it('passes when at least one side is >= 800px (e.g. 800x400)', () => {
      const img = createTestBuffer(800, 400, () => [128, 128, 128, 255]);
      const result = checkPhotoQuality(img);
      expect(result.quality_warnings).not.toContain('low_resolution');
    });
  });

  describe('Blur check (Variance of Laplacian on downscaled grayscale)', () => {
    it('flags blurry on a completely flat uniform image (zero Laplacian variance)', () => {
      const img = createTestBuffer(900, 900, () => [120, 120, 120, 255]);
      const result = checkPhotoQuality(img);
      expect(result.blurScore).toBe(0);
      expect(result.quality_warnings).toContain('blurry');
    });

    it('flags blurry on smooth gradients where second derivatives are negligible', () => {
      const img = createTestBuffer(800, 800, (x) => {
        const v = Math.floor((x / 800) * 200);
        return [v, v, v, 255];
      });
      const result = checkPhotoQuality(img);
      expect(result.blurScore).toBeLessThan(DEFAULT_QUALITY_THRESHOLDS.blurThreshold);
      expect(result.quality_warnings).toContain('blurry');
    });

    it('passes (not blurry) on images with high-frequency sharp edges and details', () => {
      // 10px alternating black and white vertical bars
      const img = createTestBuffer(800, 800, (x) => {
        const v = Math.floor(x / 10) % 2 === 0 ? 240 : 15;
        return [v, v, v, 255];
      });
      const result = checkPhotoQuality(img);
      expect(result.blurScore).toBeGreaterThan(DEFAULT_QUALITY_THRESHOLDS.blurThreshold);
      expect(result.quality_warnings).not.toContain('blurry');
    });

    it('correctly calculates downscaled grayscale and variance of Laplacian directly', () => {
      const fullGray = new Float32Array(100 * 100);
      const downscaled = downscaleGrayscale(fullGray, 100, 100, 50);
      expect(downscaled.width).toBe(50);
      expect(downscaled.height).toBe(50);

      const lapVar = computeVarianceOfLaplacian(downscaled.data, 50, 50);
      expect(lapVar).toBe(0);
    });
  });

  describe('Exposure checks (Luminance histogram)', () => {
    it('identifies well-exposed images with balanced luminance', () => {
      // Checkerboard with midrange lighting
      const img = createTestBuffer(800, 800, (x, y) => {
        const val = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0 ? 100 : 160;
        return [val, val, val, 255];
      });
      const result = checkPhotoQuality(img);
      expect(result.quality_warnings).not.toContain('dark');
      expect(result.quality_warnings).not.toContain('overexposed');
      expect(result.meanLuminance).toBeCloseTo(130, 0);
    });

    it('flags dark when mean luminance is low or dark pixels dominate', () => {
      const img = createTestBuffer(800, 800, () => [15, 15, 20, 255]);
      const result = checkPhotoQuality(img);
      expect(result.quality_warnings).toContain('dark');
      expect(result.meanLuminance).toBeLessThan(35);
    });

    it('flags overexposed when mean luminance is blown out or highlight pixels dominate', () => {
      const img = createTestBuffer(800, 800, () => [250, 250, 252, 255]);
      const result = checkPhotoQuality(img);
      expect(result.quality_warnings).toContain('overexposed');
      expect(result.meanLuminance).toBeGreaterThan(220);
    });

    it('skips transparent pixels when computing exposure histogram', () => {
      const data = new Uint8ClampedArray(4 * 4);
      // Pixel 0: Transparent dark (should be skipped)
      data[0] = 0; data[1] = 0; data[2] = 0; data[3] = 0;
      // Pixel 1: Opaque bright 200
      data[4] = 200; data[5] = 200; data[6] = 200; data[7] = 255;
      // Pixel 2: Opaque bright 200
      data[8] = 200; data[9] = 200; data[10] = 200; data[11] = 255;
      // Pixel 3: Transparent
      data[12] = 0; data[13] = 0; data[14] = 0; data[15] = 0;

      const exposure = computeLuminanceHistogramAndExposure(data, 2, 2);
      expect(exposure.meanLuminance).toBe(200);
      expect(exposure.darkFraction).toBe(0);
    });
  });

  describe('Noise estimation from flat regions', () => {
    it('estimates near-zero noise in perfectly smooth flat areas', () => {
      const gray = new Float32Array(64 * 64).fill(128);
      const noise = estimateNoiseFromFlatRegions(gray, 64, 64, 16);
      expect(noise).toBe(0);
    });

    it('estimates noise level accurately from noisy flat areas', () => {
      const width = 64;
      const height = 64;
      const gray = new Float32Array(width * height);
      // Add uniform noise of amplitude +/- 5 around mean 128
      let seed = 42;
      for (let i = 0; i < gray.length; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        const rand = (seed / 233280) * 10 - 5; // -5 to +5
        gray[i] = 128 + rand;
      }

      const noise = estimateNoiseFromFlatRegions(gray, width, height, 16);
      expect(noise).toBeGreaterThan(1.5);
      expect(noise).toBeLessThan(5.0);
    });
  });

  describe('Cutout validation after segmentation (checkCutout)', () => {
    it('accepts centered product with 40% coverage and no edge touches -> studio mode', () => {
      // 100x100 image, 4000 pixels in center
      const img = createTestBuffer(100, 100, (x, y) => {
        const inCenter = x >= 20 && x < 80 && y >= 30 && y < 70; // 60 * 40 = 2400 pixels = 24%
        return [200, 100, 50, inCenter ? 255 : 0];
      });

      const result = checkCutout(img);
      expect(result.accepted).toBe(true);
      expect(result.enhancement_mode).toBe('studio');
      expect(result.coverage).toBe(0.24);
      expect(result.touchingEdges).toEqual([]);
      expect(result.boundingBox).toEqual({
        minX: 20,
        maxX: 79,
        minY: 30,
        maxY: 69,
        width: 60,
        height: 40,
      });
    });

    it('rejects cutout if coverage is under 3% -> light_only mode', () => {
      // 100x100 = 10,000 pixels, only 100 pixels opaque = 1%
      const img = createTestBuffer(100, 100, (x, y) => {
        const isSmall = x >= 45 && x < 55 && y >= 45 && y < 55;
        return [100, 100, 100, isSmall ? 255 : 0];
      });

      const result = checkCutout(img);
      expect(result.accepted).toBe(false);
      expect(result.enhancement_mode).toBe('light_only');
      expect(result.reasons[0]).toContain('coverage_too_low');
    });

    it('rejects cutout if coverage is over 95% -> light_only mode', () => {
      // 98% coverage
      const img = createTestBuffer(100, 100, (x, y) => {
        const isTransparent = x < 2 && y < 2; // only 4 transparent pixels
        return [100, 100, 100, isTransparent ? 0 : 255];
      });

      const result = checkCutout(img);
      expect(result.accepted).toBe(false);
      expect(result.enhancement_mode).toBe('light_only');
      expect(result.reasons[0]).toContain('coverage_too_high');
    });

    it('accepts cutout touching 1 or 2 edges (e.g. bottom-resting item) -> studio mode', () => {
      // Touches bottom edge only (e.g. tabletop craft)
      const img = createTestBuffer(100, 100, (x, y) => {
        const isCraft = x >= 20 && x <= 80 && y >= 40 && y <= 99; // touches y=99 (bottom)
        return [150, 100, 80, isCraft ? 255 : 0];
      });

      const result = checkCutout(img);
      expect(result.touchingEdges).toEqual(['bottom']);
      expect(result.accepted).toBe(true);
      expect(result.enhancement_mode).toBe('studio');
    });

    it('rejects cutout touching 3 or more image edges (cut off product) -> light_only mode', () => {
      // Touches top (y=0), bottom (y=99), and left (x=0)
      const img = createTestBuffer(100, 100, (x, y) => {
        const isBigCutoff = x >= 0 && x <= 70 && y >= 0 && y <= 99;
        return [150, 100, 80, isBigCutoff ? 255 : 0];
      });

      const result = checkCutout(img);
      expect(result.touchingEdges).toContain('top');
      expect(result.touchingEdges).toContain('bottom');
      expect(result.touchingEdges).toContain('left');
      expect(result.touchingEdges.length).toBeGreaterThanOrEqual(3);
      expect(result.accepted).toBe(false);
      expect(result.enhancement_mode).toBe('light_only');
      expect(result.reasons.some((r) => r.includes('touches_too_many_edges'))).toBe(true);
    });

    it('rejects cutout when no foreground pixels are detected at all', () => {
      const img = createTestBuffer(50, 50, () => [0, 0, 0, 0]);
      const result = checkCutout(img);
      expect(result.accepted).toBe(false);
      expect(result.enhancement_mode).toBe('light_only');
      expect(result.coverage).toBe(0);
      expect(result.boundingBox).toBeNull();
      expect(result.reasons).toContain('no_foreground_detected');
    });
  });

  describe('Async Blob Wrappers with Mock Decoder', () => {
    it('checkBlobPhotoQuality runs decoder and evaluates quality metrics', async () => {
      const dummyBlob = new Blob(['sample-bytes'], { type: 'image/jpeg' });
      const mockPixels: PixelBuffer = createTestBuffer(1000, 800, () => [128, 128, 128, 255]);

      const mockDecoder = vi.fn().mockResolvedValue(mockPixels);
      const metrics = await checkBlobPhotoQuality(dummyBlob, undefined, { decodeBlobToPixels: mockDecoder });

      expect(mockDecoder).toHaveBeenCalledWith(dummyBlob);
      expect(metrics.width).toBe(1000);
      expect(metrics.height).toBe(800);
      expect(metrics.quality_warnings).not.toContain('low_resolution');
    });

    it('checkBlobCutout runs decoder and evaluates cutout validation', async () => {
      const dummyBlob = new Blob(['segmented-bytes'], { type: 'image/png' });
      const mockPixels: PixelBuffer = createTestBuffer(100, 100, (x, y) => {
        const inCenter = x >= 20 && x < 80 && y >= 30 && y < 70;
        return [200, 100, 50, inCenter ? 255 : 0];
      });

      const mockDecoder = vi.fn().mockResolvedValue(mockPixels);
      const result = await checkBlobCutout(dummyBlob, undefined, { decodeBlobToPixels: mockDecoder });

      expect(mockDecoder).toHaveBeenCalledWith(dummyBlob);
      expect(result.accepted).toBe(true);
      expect(result.enhancement_mode).toBe('studio');
    });
  });
});
