import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processProductImage, getDisplayImageUrl } from '../imageEnhancementService';
import { supabase } from '../../lib/supabase/client';
import * as aiRuntime from '../aiRuntimeService';
import * as lightingCorrection from '../lightingCorrectionService';
import type { Product } from '../../types';

// Mock Supabase client
vi.mock('../../lib/supabase/client', () => {

  const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'test-enhanced-path' }, error: null });
  const getPublicUrlMock = vi.fn().mockReturnValue({
    data: { publicUrl: 'https://test-supabase-storage.com/artisan-1/prod-1/enhanced.png' },
  });

  return {
    supabase: {
      from: vi.fn(),
      storage: {
        from: vi.fn(() => ({
          upload: uploadMock,
          getPublicUrl: getPublicUrlMock,
        })),
      },
    },
  };
});

describe('ImageEnhancementService (Stage 1.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully processes product image through status transitions: pending -> processing -> enhanced', async () => {
    const testProductId = 'product-test-101';
    const testArtisanId = 'artisan-test-202';
    const rawImageUrl = 'https://test-supabase-storage.com/artisan-test-202/product-test-101/raw.jpg';

    // Mock product fetch
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: testProductId,
            artisan_id: testArtisanId,
            original_image_url: rawImageUrl,
            image_processing_status: 'pending',
          },
          error: null,
        }),
      }),
    });

    const updateCalls: Array<Record<string, unknown>> = [];
    const updateMock = vi.fn().mockImplementation((payload) => {
      updateCalls.push(payload);
      return {
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') {
        return {
          select: selectMock,
          update: updateMock,
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    // Mock fetch for raw image download
    const dummyRawBlob = new Blob(['raw-pixel-data'], { type: 'image/jpeg' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(dummyRawBlob),
    });

    // Mock runSegmentation to return segmented blob
    const dummySegmentedBlob = new Blob(['segmented-transparent-png'], { type: 'image/png' });
    const runSegmentationSpy = vi.spyOn(aiRuntime, 'runSegmentation').mockResolvedValue(dummySegmentedBlob);

    // Mock correctLighting to return enhanced blob
    const dummyEnhancedBlob = new Blob(['enhanced-transparent-png'], { type: 'image/png' });
    const correctLightingSpy = vi.spyOn(lightingCorrection, 'correctLighting').mockResolvedValue(dummyEnhancedBlob);

    // Run processing
    const result = await processProductImage(testProductId);

    // 1. Assert result is successful
    expect(result.success).toBe(true);
    expect(result.productId).toBe(testProductId);
    expect(result.enhancedImageUrl).toContain('enhanced.png');

    // 2. Assert runSegmentation was called with downloaded blob and correctLighting was called with segmented blob
    expect(runSegmentationSpy).toHaveBeenCalledWith(dummyRawBlob);
    expect(correctLightingSpy).toHaveBeenCalledWith(dummySegmentedBlob);

    // 3. Assert upload was made to existing 'product-photos-raw' storage bucket
    expect(supabase.storage.from).toHaveBeenCalledWith('product-photos-raw');
    const storageInstance = supabase.storage.from('product-photos-raw');
    expect(storageInstance.upload).toHaveBeenCalledWith(
      `${testArtisanId}/${testProductId}/enhanced.png`,
      dummyEnhancedBlob,
      expect.objectContaining({ upsert: true })
    );

    // 4. Assert status transitions: first set to 'processing', then to 'enhanced' with enhanced_image_url
    expect(updateCalls.length).toBe(2);
    expect(updateCalls[0]).toEqual({ image_processing_status: 'processing' });
    expect(updateCalls[1]).toEqual({
      enhanced_image_url: expect.stringContaining('enhanced.png'),
      image_processing_status: 'enhanced',
    });

    runSegmentationSpy.mockRestore();
    correctLightingSpy.mockRestore();
  });

  it('handles failure path: transitions status to failed without throwing uncaught', async () => {
    const testProductId = 'product-test-fail-999';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock product fetch
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: testProductId,
            artisan_id: 'artisan-fail',
            original_image_url: 'https://test-supabase-storage.com/raw-corrupt.jpg',
            image_processing_status: 'pending',
          },
          error: null,
        }),
      }),
    });

    const updateCalls: Array<Record<string, unknown>> = [];
    const updateMock = vi.fn().mockImplementation((payload) => {
      updateCalls.push(payload);
      return {
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') {
        return {
          select: selectMock,
          update: updateMock,
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    // Mock fetch to reject (simulating download failure)
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network failure'));
    
    // We don't need to mock runSegmentation because fetch failure skips it

    // Run processing — MUST NOT throw uncaught
    let caughtError: unknown = null;
    let result: unknown = null;
    try {
      result = await processProductImage(testProductId);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeNull();
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        productId: testProductId,
        error: expect.stringContaining('network failure'),
      })
    );

    // Assert status transition to 'failed'
    expect(updateCalls).toContainEqual({ image_processing_status: 'processing' });
    expect(updateCalls).toContainEqual({ image_processing_status: 'failed' });

    // Assert error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[ImageEnhancementService] Error processing product ${testProductId}:`),
      expect.any(String)
    );

    consoleErrorSpy.mockRestore();
  });

  it('handles correctLighting failure: caught by the same try/catch and transitions status to failed', async () => {
    const testProductId = 'product-test-lighting-fail-888';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock product fetch
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: testProductId,
            artisan_id: 'artisan-lighting-fail',
            original_image_url: 'https://test-supabase-storage.com/raw-good.jpg',
            image_processing_status: 'pending',
          },
          error: null,
        }),
      }),
    });

    const updateCalls: Array<Record<string, unknown>> = [];
    const updateMock = vi.fn().mockImplementation((payload) => {
      updateCalls.push(payload);
      return {
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') {
        return {
          select: selectMock,
          update: updateMock,
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    // Mock fetch for image
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(['valid-data'], { type: 'image/jpeg' })),
    });

    // Mock runSegmentation to succeed
    const runSegmentationSpy = vi.spyOn(aiRuntime, 'runSegmentation').mockResolvedValue(
      new Blob(['segmented-data'], { type: 'image/png' })
    );

    // Mock correctLighting to throw an error
    const correctLightingSpy = vi.spyOn(lightingCorrection, 'correctLighting').mockRejectedValue(
      new Error('Canvas lighting correction failed: 2D context allocation error')
    );

    const result = await processProductImage(testProductId);

    // Verify it didn't throw uncaught, returned failure, and updated status to failed
    expect(result.success).toBe(false);
    expect(result.productId).toBe(testProductId);
    expect(result.error).toContain('Canvas lighting correction failed');

    expect(updateCalls).toContainEqual({ image_processing_status: 'processing' });
    expect(updateCalls).toContainEqual({ image_processing_status: 'failed' });

    runSegmentationSpy.mockRestore();
    correctLightingSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

describe('getDisplayImageUrl helper (Stage 1.4)', () => {
  const baseProduct: Product = {
    id: 'prod-display-1',
    artisanId: 'artisan-1',
    artisanName: 'Ramesh Sharma',
    shopName: 'Sharma Teak Crafts',
    title: 'Handcrafted Wooden Stool',
    category: 'woodwork' as any,
    price: 3200,
    material: 'Teak Wood',
    dimensions: '12x12x18 in',
    rating: 4.8,
    imageUrl: 'https://images.example.com/mock-catalog.jpg',
    model3DType: 'stool' as any,
    finishOptions: ['Natural', 'Dark Walnut'],
    description: 'Beautiful teak stool',
    inStock: true,
    leadTimeDays: 7,
  };

  it('Case 1 (Explicit Choice): respects final_image_choice when set to "original" or "enhanced"', () => {
    // When artisan chose 'original', return original_image_url even if enhanced is present
    const productOriginalChoice: Product = {
      ...baseProduct,
      original_image_url: 'https://images.example.com/raw-photo.jpg',
      enhanced_image_url: 'https://images.example.com/ai-enhanced.png',
      final_image_choice: 'original',
    };
    expect(getDisplayImageUrl(productOriginalChoice)).toBe('https://images.example.com/raw-photo.jpg');

    // When artisan chose 'enhanced', return enhanced_image_url
    const productEnhancedChoice: Product = {
      ...baseProduct,
      original_image_url: 'https://images.example.com/raw-photo.jpg',
      enhanced_image_url: 'https://images.example.com/ai-enhanced.png',
      final_image_choice: 'enhanced',
    };
    expect(getDisplayImageUrl(productEnhancedChoice)).toBe('https://images.example.com/ai-enhanced.png');
  });

  it('Case 2 (No Choice with Enhanced Available): falls back to enhanced_image_url', () => {
    const productNoChoiceWithEnhanced: Product = {
      ...baseProduct,
      original_image_url: 'https://images.example.com/raw-photo.jpg',
      enhanced_image_url: 'https://images.example.com/ai-enhanced.png',
      final_image_choice: null, // No choice made yet
    };
    expect(getDisplayImageUrl(productNoChoiceWithEnhanced)).toBe('https://images.example.com/ai-enhanced.png');

    // Also when final_image_choice is undefined
    const productUndefinedChoice: Product = {
      ...baseProduct,
      original_image_url: 'https://images.example.com/raw-photo.jpg',
      enhanced_image_url: 'https://images.example.com/ai-enhanced.png',
      final_image_choice: undefined,
    };
    expect(getDisplayImageUrl(productUndefinedChoice)).toBe('https://images.example.com/ai-enhanced.png');
  });

  it('Case 3 (No Choice with Only Original Available): falls back to original_image_url, then imageUrl', () => {
    // Only original_image_url is available
    const productOnlyOriginal: Product = {
      ...baseProduct,
      original_image_url: 'https://images.example.com/raw-photo.jpg',
      enhanced_image_url: null,
      final_image_choice: null,
    };
    expect(getDisplayImageUrl(productOnlyOriginal)).toBe('https://images.example.com/raw-photo.jpg');

    // Neither original_image_url nor enhanced_image_url is available: fallback to default imageUrl
    const productLegacyOnly: Product = {
      ...baseProduct,
      original_image_url: null,
      enhanced_image_url: null,
      final_image_choice: null,
    };
    expect(getDisplayImageUrl(productLegacyOnly)).toBe('https://images.example.com/mock-catalog.jpg');
  });
});

describe('ImageEnhancementService Stage 6.3b (Studio vs Light-only modes & Quality warnings)', () => {
  const testProductId = 'prod-stage-63b';
  const testArtisanId = 'artisan-stage-63b';
  const rawImageUrl = 'https://test-supabase-storage.com/artisan/prod/raw.jpg';

  const setupMockProduct = () => {
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: testProductId,
            artisan_id: testArtisanId,
            original_image_url: rawImageUrl,
            image_processing_status: 'pending',
          },
          error: null,
        }),
      }),
    });

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') {
        return { select: selectMock, update: updateMock } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });
  };

  it('cutout accepted -> studio mode, applies correctLighting to segmented blob', async () => {
    setupMockProduct();

    const dummyRawBlob = new Blob(['raw-bytes'], { type: 'image/jpeg' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(dummyRawBlob),
    });

    const dummySegmentedBlob = new Blob(['segmented-cutout-bytes'], { type: 'image/png' });
    vi.spyOn(aiRuntime, 'runSegmentation').mockResolvedValue(dummySegmentedBlob);

    const dummyEnhancedBlob = new Blob(['enhanced-studio-bytes'], { type: 'image/png' });
    const lightingSpy = vi.spyOn(lightingCorrection, 'correctLighting').mockResolvedValue(dummyEnhancedBlob);

    const photoQuality = await import('../photoQualityService');
    vi.spyOn(photoQuality, 'checkBlobPhotoQuality').mockResolvedValue({
      blurScore: 120,
      meanLuminance: 140,
      darkPixelFraction: 0.05,
      overexposedPixelFraction: 0.02,
      noiseEstimate: 1.2,
      width: 1200,
      height: 900,
      quality_warnings: [],
    });

    vi.spyOn(photoQuality, 'checkBlobCutout').mockResolvedValue({
      accepted: true,
      enhancement_mode: 'studio',
      coverage: 0.45,
      boundingBox: { minX: 10, minY: 10, maxX: 90, maxY: 90, width: 80, height: 80 },
      touchingEdges: [],
      reasons: [],
    });

    const result = await processProductImage(testProductId);

    expect(result.success).toBe(true);
    expect(result.enhancement_mode).toBe('studio');
    expect(result.quality_warnings).toEqual([]);
    expect(result.processing_log).toBeDefined();
    expect(result.processing_log?.enhancement_mode).toBe('studio');
    expect(result.processing_log?.measurements).toBeDefined();
    // Studio mode passes the segmented blob to lighting correction (which was mocked)
    // Actually, in the real implementation it passes cutoutBlob? No, it uses OpenCV if available.
    // If OpenCV is not available, it uses correctLighting. We are in JSDOM, so OpenCV fails.
    expect(lightingSpy).toHaveBeenCalledWith(dummySegmentedBlob);
  });

  it('cutout rejected (e.g. edge touch >= 3 or coverage < 3%) -> light_only mode on original photo', async () => {
    setupMockProduct();

    const dummyRawBlob = new Blob(['raw-bytes-original'], { type: 'image/jpeg' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(dummyRawBlob),
    });

    const dummySegmentedBlob = new Blob(['bad-cutout-bytes'], { type: 'image/png' });
    vi.spyOn(aiRuntime, 'runSegmentation').mockResolvedValue(dummySegmentedBlob);

    const dummyEnhancedBlob = new Blob(['enhanced-light-only-bytes'], { type: 'image/jpeg' });
    const lightingSpy = vi.spyOn(lightingCorrection, 'correctLighting').mockResolvedValue(dummyEnhancedBlob);

    const photoQuality = await import('../photoQualityService');
    vi.spyOn(photoQuality, 'checkBlobPhotoQuality').mockResolvedValue({
      blurScore: 30,
      meanLuminance: 20,
      darkPixelFraction: 0.65,
      overexposedPixelFraction: 0,
      noiseEstimate: 5.4,
      width: 600,
      height: 400,
      quality_warnings: ['blurry', 'dark', 'low_resolution'],
    });

    // Mock cutout rejected because product is cut off on 3 edges
    vi.spyOn(photoQuality, 'checkBlobCutout').mockResolvedValue({
      accepted: false,
      enhancement_mode: 'light_only',
      coverage: 0.88,
      boundingBox: { minX: 0, minY: 0, maxX: 100, maxY: 99, width: 100, height: 100 },
      touchingEdges: ['top', 'left', 'bottom'],
      reasons: ['touches_too_many_edges (top, left, bottom)'],
    });

    const result = await processProductImage(testProductId);

    expect(result.success).toBe(true);
    expect(result.enhancement_mode).toBe('light_only');
    expect(result.quality_warnings).toContain('blurry');
    expect(result.quality_warnings).toContain('dark');
    expect(result.quality_warnings).toContain('low_resolution');
    expect(result.processing_log).toBeDefined();
    expect(result.processing_log?.enhancement_mode).toBe('light_only');
    expect(result.processing_log?.measurements.noiseEstimate).toBe(5.4);
    // Light-only mode passes original raw blob to lighting correction, preserving the full context
    expect(lightingSpy).toHaveBeenCalledWith(dummyRawBlob);
  });
});


