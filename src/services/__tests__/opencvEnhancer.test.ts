import { describe, it, expect, vi } from 'vitest';
import { orderQuadPoints, processImageWithOpenCV } from '../opencvEnhancer';
import type { PixelBuffer } from '../photoQualityService';

describe('OpenCVEnhancer (Stage 6.3b, Part 2)', () => {
  describe('orderQuadPoints', () => {
    it('orders 4 points canonically: top-left, top-right, bottom-right, bottom-left', () => {
      const unordered = [
        { x: 100, y: 100 }, // BR
        { x: 10, y: 10 },   // TL
        { x: 10, y: 95 },   // BL
        { x: 95, y: 12 },   // TR
      ];

      const ordered = orderQuadPoints(unordered);
      expect(ordered[0]).toEqual({ x: 10, y: 10 });  // TL
      expect(ordered[1]).toEqual({ x: 95, y: 12 });  // TR
      expect(ordered[2]).toEqual({ x: 100, y: 100 });// BR
      expect(ordered[3]).toEqual({ x: 10, y: 95 });  // BL
    });
  });

  describe('processImageWithOpenCV orchestration with mock cv', () => {
    const allocatedDisposables: Array<{ delete: any; type: string }> = [];

    function trackAlloc<T extends { delete: any }>(obj: T, type: string): T {
      allocatedDisposables.push(Object.assign(obj, { type }));
      return obj;
    }

    function createMockMat(rows = 100, cols = 100, type = 24) {
      const mat = {
        rows,
        cols,
        type,
        data: new Uint8Array(rows * cols * 4).fill(120),
        data32S: new Int32Array(rows * cols),
        clone: function () { return createMockMat(this.rows, this.cols, this.type); },
        delete: vi.fn(),
      };
      return trackAlloc(mat, 'Mat');
    }

    function createMockMatVector() {
      const items: any[] = [];
      const vec = {
        size: () => items.length,
        get: (i: number) => items[i] || createMockMat(),
        set: (i: number, mat: any) => { items[i] = mat; },
        push_back: (mat: any) => { items.push(mat); },
        delete: vi.fn(() => {
          items.forEach((m) => {
            if (m && typeof m.delete === 'function') m.delete();
          });
        }),
      };
      return trackAlloc(vec, 'MatVector');
    }

    const mockCv = {
      Mat: class {
        rows = 100;
        cols = 100;
        data = new Uint8Array(100 * 100 * 4);
        data32S = new Int32Array(100 * 100);
        constructor(rows = 100, cols = 100) {
          this.rows = rows;
          this.cols = cols;
          trackAlloc(this, 'Mat');
        }
        static zeros(r = 100, c = 100) {
          return createMockMat(r, c);
        }
        clone() { return createMockMat(this.rows, this.cols); }
        delete = vi.fn();
      },
      MatVector: function () { return createMockMatVector(); },
      matFromImageData: vi.fn(() => createMockMat()),
      matFromArray: vi.fn(() => createMockMat()),
      split: vi.fn((_mat, vec) => {
        vec.set(0, createMockMat());
        vec.set(1, createMockMat());
        vec.set(2, createMockMat());
        vec.set(3, createMockMat());
      }),
      merge: vi.fn(),
      cvtColor: vi.fn(),
      threshold: vi.fn(),
      getStructuringElement: vi.fn(() => createMockMat(3, 3)),
      morphologyEx: vi.fn(),
      connectedComponentsWithStats: vi.fn((_closed, _labels, stats) => {
        stats.intAt = (idx: number) => (idx === 1 ? 500 : 80);
        return 2;
      }),
      GaussianBlur: vi.fn(),
      bilateralFilter: vi.fn(),
      warpPerspective: vi.fn(),
      getPerspectiveTransform: vi.fn(() => createMockMat(3, 3)),
      contourArea: vi.fn(() => 1500),
      arcLength: vi.fn(() => 100),
      approxPolyDP: vi.fn((_cnt, approx) => {
        approx.rows = 4;
        approx.data32S = new Int32Array([10, 10, 90, 10, 90, 90, 10, 90]);
      }),
      isContourConvex: vi.fn(() => true),
      findContours: vi.fn((_img, contours) => {
        contours.push_back(createMockMat());
      }),
      COLOR_RGBA2RGB: 1,
      COLOR_RGB2RGBA: 2,
      COLOR_RGB2Lab: 3,
      COLOR_Lab2RGB: 4,
      MORPH_ELLIPSE: 2,
      MORPH_OPEN: 2,
      MORPH_CLOSE: 3,
      CC_STAT_AREA: 4,
      THRESH_BINARY: 0,
      CV_8U: 0,
      CV_8UC1: 0,
      CV_32FC2: 5,
      INTER_LINEAR: 1,
      INTER_NEAREST: 0,
      BORDER_CONSTANT: 0,
      Size: class {
        width: number;
        height: number;
        constructor(w: number, h: number) {
          this.width = w;
          this.height = h;
        }
      },
      Scalar: class {
        v: number[];
        constructor(...args: number[]) {
          this.v = args;
        }
      },
      CLAHE: class {
        clipLimit: number;
        tileGridSize: any;
        constructor(clipLimit: number, tileGridSize: any) {
          this.clipLimit = clipLimit;
          this.tileGridSize = tileGridSize;
          trackAlloc(this, 'CLAHE');
        }
        apply = vi.fn();
        delete = vi.fn();
      },
      LUT: vi.fn(),
      addWeighted: vi.fn(),
    };

    const dummyPixels: PixelBuffer = {
      data: new Uint8ClampedArray(100 * 100 * 4).fill(120),
      width: 100,
      height: 100,
    };

    it('runs denoise only when noiseEstimate is high', () => {
      // 1. High noise -> triggers bilateralFilter
      const resultHighNoise = processImageWithOpenCV(mockCv, {
        pixels: dummyPixels,
        enhancement_mode: 'studio',
        noiseEstimate: 20.0, // > 12.0
        initialBlurScore: 80,
      });

      expect(resultHighNoise.log.operations).toContain('bilateral_denoise');
      expect(mockCv.bilateralFilter).toHaveBeenCalled();

      // 2. Low noise -> skips bilateralFilter
      vi.clearAllMocks();
      const resultLowNoise = processImageWithOpenCV(mockCv, {
        pixels: dummyPixels,
        enhancement_mode: 'studio',
        noiseEstimate: 5.0, // < 12.0
        initialBlurScore: 80,
      });

      expect(resultLowNoise.log.operations).not.toContain('bilateral_denoise');
      expect(mockCv.bilateralFilter).not.toHaveBeenCalled();
    });

    it('runs unsharp mask sharpening only when blurScore is mildly soft', () => {
      // Mildly soft (e.g. 70 between 35 and 140)
      const resultSoft = processImageWithOpenCV(mockCv, {
        pixels: dummyPixels,
        enhancement_mode: 'studio',
        noiseEstimate: 5.0,
        initialBlurScore: 70,
      });

      expect(resultSoft.log.operations).toContain('gentle_unsharp_mask');

      // Extremely sharp (e.g. 500) -> skips sharpening
      const resultSharp = processImageWithOpenCV(mockCv, {
        pixels: dummyPixels,
        enhancement_mode: 'studio',
        noiseEstimate: 5.0,
        initialBlurScore: 500,
      });

      expect(resultSharp.log.operations).not.toContain('gentle_unsharp_mask');
    });

    it('generates structured processing_log with operations and measurements', () => {
      const result = processImageWithOpenCV(mockCv, {
        pixels: dummyPixels,
        enhancement_mode: 'studio',
        noiseEstimate: 14.5,
        initialBlurScore: 65,
        quality_warnings: ['blurry'],
      });

      expect(result.log.opencvUsed).toBe(true);
      expect(result.log.fallbackUsed).toBe(false);
      expect(result.log.enhancement_mode).toBe('studio');
      expect(result.log.measurements.noiseEstimate).toBe(14.5);
      expect(result.log.measurements.sharpnessBefore).toBe(65);
      expect(result.log.operations).toContain('clahe_l_channel');
      expect(result.log.quality_warnings).toContain('blurry');
    });

    it('guarantees every cv.Mat and MatVector created is explicitly deleted (zero WASM memory leaks)', () => {
      allocatedDisposables.length = 0; // reset tracker array

      processImageWithOpenCV(mockCv, {
        pixels: dummyPixels,
        enhancement_mode: 'studio',
        noiseEstimate: 20.0, // bilateral filter path
        initialBlurScore: 65, // unsharp mask path
        shape_profile: 'flat', // perspective correction path
      });

      expect(allocatedDisposables.length).toBeGreaterThan(0);
      const undeleted = allocatedDisposables.filter((obj) => obj.delete.mock.calls.length === 0);
      expect(undeleted).toEqual([]);
    });

    it('guarantees all allocated cv.Mats are deleted even if an internal step throws an error', () => {
      allocatedDisposables.length = 0; // reset tracker array

      // Simulate a runtime exception inside cvtColor
      vi.spyOn(mockCv, 'cvtColor').mockImplementationOnce(() => {
        throw new Error('Simulated WASM memory error inside cvtColor');
      });

      processImageWithOpenCV(mockCv, {
        pixels: dummyPixels,
        enhancement_mode: 'studio',
        noiseEstimate: 20.0,
        initialBlurScore: 65,
      });

      expect(allocatedDisposables.length).toBeGreaterThan(0);
      const undeleted = allocatedDisposables.filter((obj) => obj.delete.mock.calls.length === 0);
      expect(undeleted).toEqual([]);
    });
  });
});
