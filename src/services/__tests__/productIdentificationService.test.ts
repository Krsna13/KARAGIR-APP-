// src/services/__tests__/productIdentificationService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  identifyProduct,
  blobToBase64,
  ProductIdentificationError,
} from '../productIdentificationService';
import { supabase } from '../../lib/supabase/client';
import type { ProductIdentification } from '../../types';

/**
 * MOCK BOUNDARY STATEMENT:
 * Gemini itself was not called; supabase.functions.invoke was mocked at the client boundary
 * because no live API key exists in this environment.
 */

// Mock Supabase client
vi.mock('../../lib/supabase/client', () => {
  return {
    supabase: {
      functions: {
        invoke: vi.fn(),
      },
    },
  };
});

describe('ProductIdentificationService (Stage 5.1 - Snap & Discover Vision Engine)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validSampleResponse: ProductIdentification = {
    item_name: 'Handcrafted Sheesham Coffee Table',
    material: 'Sheesham Wood (Indian Rosewood)',
    category: 'Woodwork',
    confidence: 0.942,
    short_description:
      'A masterfully carved solid Sheesham wood coffee table featuring traditional brass inlay motifs.',
  };

  it('successfully converts Blob to base64 and parses a well-formed mock response', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    mockInvoke.mockResolvedValueOnce({
      data: validSampleResponse,
      error: null,
    });

    const dummyBlob = new Blob(['mock-artisan-photo-content'], { type: 'image/jpeg' });
    const expectedBase64 = await blobToBase64(dummyBlob);

    const result = await identifyProduct(dummyBlob);

    // Verify mock call boundary and payload
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('identify-product', {
      body: {
        imageBase64: expectedBase64,
        mimeType: 'image/jpeg',
      },
    });

    // Verify parsed data
    expect(result).toEqual({
      item_name: 'Handcrafted Sheesham Coffee Table',
      material: 'Sheesham Wood (Indian Rosewood)',
      category: 'Woodwork',
      confidence: 0.942,
      short_description:
        'A masterfully carved solid Sheesham wood coffee table featuring traditional brass inlay motifs.',
    });
  });

  it('supports all defined product categories (Woodwork, Pottery, Brasscraft, Textile, Furniture, Metal)', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    const categories = ['Woodwork', 'Pottery', 'Brasscraft', 'Textile', 'Furniture', 'Metal'] as const;

    for (const cat of categories) {
      mockInvoke.mockResolvedValueOnce({
        data: {
          ...validSampleResponse,
          category: cat,
        },
        error: null,
      });

      const blob = new Blob(['test-craft'], { type: 'image/png' });
      const result = await identifyProduct(blob);
      expect(result.category).toBe(cat);
    }
  });

  it('rejects invalid or empty image blobs immediately before calling Edge Function', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);

    // Empty blob
    const emptyBlob = new Blob([], { type: 'image/jpeg' });
    await expect(identifyProduct(emptyBlob)).rejects.toThrow(ProductIdentificationError);
    await expect(identifyProduct(emptyBlob)).rejects.toThrow(/non-empty image Blob/i);

    // Null/undefined blob
    // @ts-expect-error testing runtime validation
    await expect(identifyProduct(null)).rejects.toThrow(ProductIdentificationError);

    // Edge function must never have been called
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('propagates Edge Function error responses when Edge Function returns 400 (corrupt image)', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Corrupt or unreadable image: Failed to decode image bytes.',
        context: {
          status: 400,
          json: () =>
            Promise.resolve({
              error: 'Corrupt or unreadable image: Failed to decode image bytes.',
            }),
        },
      } as any,
    });

    const dummyBlob = new Blob(['corrupt-bytes'], { type: 'image/jpeg' });
    await expect(identifyProduct(dummyBlob)).rejects.toThrow(ProductIdentificationError);

    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Corrupt or unreadable image: Failed to decode image bytes.',
        context: {
          status: 400,
          json: () =>
            Promise.resolve({
              error: 'Corrupt or unreadable image: Failed to decode image bytes.',
            }),
        },
      } as any,
    });

    try {
      await identifyProduct(dummyBlob);
    } catch (err) {
      expect(err).toBeInstanceOf(ProductIdentificationError);
      const prodErr = err as ProductIdentificationError;
      expect(prodErr.message).toContain('Corrupt or unreadable image');
      expect(prodErr.status).toBe(400);
    }
  });

  it('propagates Edge Function error responses when Gemini safety filter flags the photo (422)', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Safety filter violation',
        context: {
          status: 422,
          json: () =>
            Promise.resolve({
              error:
                'The uploaded image could not be processed due to content safety policies (SAFETY). Please upload a clear photo of an artisan craft item.',
            }),
        },
      } as any,
    });

    const dummyBlob = new Blob(['inappropriate-photo'], { type: 'image/jpeg' });
    try {
      await identifyProduct(dummyBlob);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProductIdentificationError);
      const prodErr = err as ProductIdentificationError;
      expect(prodErr.message).toContain('content safety policies');
      expect(prodErr.status).toBe(422);
    }
  });

  it('propagates Edge Function rate limit errors (429)', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Gemini API rate limit exceeded.',
        context: {
          status: 429,
          json: () =>
            Promise.resolve({
              error: 'Gemini API rate limit exceeded. Please wait a moment and try again.',
            }),
        },
      } as any,
    });

    const dummyBlob = new Blob(['photo'], { type: 'image/jpeg' });
    try {
      await identifyProduct(dummyBlob);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProductIdentificationError);
      const prodErr = err as ProductIdentificationError;
      expect(prodErr.message).toContain('rate limit exceeded');
      expect(prodErr.status).toBe(429);
    }
  });

  it('propagates network failure and 502 upstream errors', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Network failure connecting to Gemini vision service',
        context: {
          status: 502,
          json: () =>
            Promise.resolve({
              error: 'Network failure connecting to Gemini vision service: fetch failed',
            }),
        },
      } as any,
    });

    const dummyBlob = new Blob(['valid-photo'], { type: 'image/jpeg' });
    try {
      await identifyProduct(dummyBlob);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProductIdentificationError);
      const prodErr = err as ProductIdentificationError;
      expect(prodErr.message).toContain('Network failure');
      expect(prodErr.status).toBe(502);
    }
  });

  it('throws typed ProductIdentificationError on missing response data', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const dummyBlob = new Blob(['photo'], { type: 'image/jpeg' });
    await expect(identifyProduct(dummyBlob)).rejects.toThrow(
      /No identification data returned/i
    );
  });

  it('throws typed ProductIdentificationError if returned category is not one of the allowed categories', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...validSampleResponse,
        category: 'Electronics',
      },
      error: null,
    });

    const dummyBlob = new Blob(['photo'], { type: 'image/jpeg' });
    await expect(identifyProduct(dummyBlob)).rejects.toThrow(
      /unexpected category 'Electronics'/i
    );
  });

  it('throws typed ProductIdentificationError if confidence is missing or out of [0, 1] range', async () => {
    const mockInvoke = vi.mocked(supabase.functions.invoke);
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...validSampleResponse,
        confidence: 1.5,
      },
      error: null,
    });

    const dummyBlob = new Blob(['photo'], { type: 'image/jpeg' });
    await expect(identifyProduct(dummyBlob)).rejects.toThrow(
      /confidence must be a number between 0 and 1/i
    );
  });

  it('blobToBase64 accurately converts arbitrary binary content', async () => {
    const text = 'Kaaragir Artisan Marketplace Snap & Discover';
    const blob = new Blob([text], { type: 'text/plain' });
    const base64 = await blobToBase64(blob);

    // Verify round-trip decoding
    const decoded = atob(base64);
    expect(decoded).toBe(text);
  });
});
