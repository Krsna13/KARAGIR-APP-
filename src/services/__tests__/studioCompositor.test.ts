import { describe, it, expect, vi } from 'vitest';
import {
  computeStudioGeometry,
  compositeStudioImage,
} from '../studioCompositor';
import { DEFAULT_STUDIO_ENHANCEMENT_CONFIG } from '../../types/imageEnhancement';
import type { PixelBuffer } from '../photoQualityService';

function createMockPixels(width: number, height: number, opaqueBox?: { minX: number; minY: number; maxX: number; maxY: number }): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  const box = opaqueBox || { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isOpaque = x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
      data[idx] = 180;
      data[idx + 1] = 140;
      data[idx + 2] = 100;
      data[idx + 3] = isOpaque ? 255 : 0;
    }
  }

  return { data, width, height };
}

describe('StudioCompositor (Stage 6.3b, Part 2)', () => {
  describe('computeStudioGeometry (pure math)', () => {
    it('sets square 1200x1200 canvas with 8% padding (max 1008px dimension)', () => {
      // Large product 2000x1500
      const pixels = createMockPixels(2000, 1500);
      const geom = computeStudioGeometry(pixels);

      expect(geom.canvasSize).toBe(1200);
      // Max product size: 1200 * (1 - 0.16) = 1008px
      expect(Math.max(geom.drawWidth, geom.drawHeight)).toBe(1008);
      // Aspect ratio kept: 2000/1500 = 1.333 -> 1008/756 = 1.333
      expect(geom.drawWidth).toBe(1008);
      expect(geom.drawHeight).toBe(756);

      // Centered on canvas
      expect(geom.drawX).toBe(Math.round((1200 - 1008) / 2)); // 96
      expect(geom.drawY).toBe(Math.round((1200 - 756) / 2));  // 222
    });

    it('never upscales smaller products: scale is clamped to at most 1.0', () => {
      // Small product 400x300 inside 600x600 frame
      const pixels = createMockPixels(600, 600, { minX: 100, minY: 150, maxX: 499, maxY: 449 });
      const geom = computeStudioGeometry(pixels);

      expect(geom.scale).toBe(1.0);
      expect(geom.drawWidth).toBe(400);
      expect(geom.drawHeight).toBe(300);
      expect(geom.drawX).toBe(400); // (1200 - 400) / 2
      expect(geom.drawY).toBe(450); // (1200 - 300) / 2
    });

    it('calculates soft contact shadow geometry under the product', () => {
      const pixels = createMockPixels(1000, 1000);
      const geom = computeStudioGeometry(pixels, {
        ...DEFAULT_STUDIO_ENHANCEMENT_CONFIG,
        enableContactShadow: true,
      });

      expect(geom.shadow).not.toBeNull();
      expect(geom.shadow?.cx).toBe(geom.drawX + geom.drawWidth / 2);
      expect(geom.shadow?.rx).toBeGreaterThan(0);
      expect(geom.shadow?.ry).toBeGreaterThan(0);
    });

    it('omits contact shadow when toggle is disabled in config', () => {
      const pixels = createMockPixels(1000, 1000);
      const geom = computeStudioGeometry(pixels, {
        ...DEFAULT_STUDIO_ENHANCEMENT_CONFIG,
        enableContactShadow: false,
      });

      expect(geom.shadow).toBeNull();
    });
  });

  describe('compositeStudioImage', () => {
    it('uses injected renderer to output JPEG at quality 0.9', async () => {
      const pixels = createMockPixels(50, 50);
      const dummyJpegBlob = new Blob(['fake-jpeg-data'], { type: 'image/jpeg' });
      const renderMock = vi.fn().mockResolvedValue(dummyJpegBlob);

      const blob = await compositeStudioImage(
        { pixels, enhancement_mode: 'studio' },
        { renderCanvasToBlob: renderMock }
      );

      expect(blob).toEqual(dummyJpegBlob);
      expect(renderMock).toHaveBeenCalledWith(expect.any(Object), 0.9);
    }, 10000);

    it('handles light_only mode by exporting original dimensions to JPEG 0.9', async () => {
      const pixels = createMockPixels(60, 40);
      const dummyBlob = new Blob(['light-only-jpeg'], { type: 'image/jpeg' });
      const renderMock = vi.fn().mockImplementation((canvas: HTMLCanvasElement, quality: number) => {
        expect(canvas.width).toBe(60);
        expect(canvas.height).toBe(40);
        expect(quality).toBe(0.9);
        return Promise.resolve(dummyBlob);
      });

      const blob = await compositeStudioImage(
        { pixels, enhancement_mode: 'light_only' },
        { renderCanvasToBlob: renderMock }
      );

      expect(blob).toEqual(dummyBlob);
    });
  });
});
