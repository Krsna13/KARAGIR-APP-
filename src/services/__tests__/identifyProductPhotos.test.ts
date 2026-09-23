/**
 * Stage 6.4: identifyProductPhotos / selectIdentificationImages.
 *
 * REAL LOGIC: photo selection (cover first, then next two by position,
 * original URLs, max 3), the single 413 -> cover-only retry, and client-side
 * validation of the response (validateGeminiResult).
 * MOCKED AT THE BOUNDARY: supabase.functions.invoke (no live Gemini key or
 * deployed function exists here), via the in-memory fake client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase, fakeFunctionsHttpError } from '../../test/fakeSupabase';
import {
  identifyProductPhotos,
  selectIdentificationImages,
  ProductIdentificationError,
} from '../productIdentificationService';
import type { ProductImage } from '../../types/product';

vi.mock('../../lib/supabase/client', async () => {
  const { fakeSupabase: fake } = await import('../../test/fakeSupabase');
  return { supabase: fake.client };
});

const img = (id: string, position: number, isCover = false, overrides: Partial<ProductImage> = {}): ProductImage => ({
  id,
  product_id: 'p',
  artisan_id: 'a',
  position,
  original_image_url: `https://x.supabase.co/storage/v1/object/public/product-photos-raw/a/p/${id}/raw.jpg`,
  enhanced_image_url: `https://x.supabase.co/storage/v1/object/public/product-photos-raw/a/p/${id}/enhanced.png`,
  image_processing_status: 'enhanced',
  final_image_choice: null,
  is_cover: isCover,
  created_at: '2026-09-25T00:00:00Z',
  ...overrides,
});

const response = {
  item_name: 'Brass Diya',
  material: 'Brass',
  category: 'Brasscraft',
  confidence: 0.8,
  short_description: 'A lamp.',
  secondary_materials: [],
  finish: 'polished',
};

describe('selectIdentificationImages', () => {
  it('sends the cover first, then the next two by position, using ORIGINAL urls, max 3', () => {
    const photos = [img('p0', 0), img('p1', 1), img('p2', 2, true), img('p3', 3), img('p4', 4)];
    const sel = selectIdentificationImages(photos);
    expect(sel.imageIds).toEqual(['p2', 'p0', 'p1']);
    expect(sel.coverImageId).toBe('p2');
    expect(sel.urls).toEqual(['p2', 'p0', 'p1'].map((id) => expect.stringContaining(`/${id}/raw.jpg`)));
    expect(sel.urls.some((u) => u.includes('enhanced.png'))).toBe(false);
  });

  it('skips photos without an original URL and handles fewer than 3 photos', () => {
    const sel = selectIdentificationImages([img('c', 1, true), img('x', 0, false, { original_image_url: null })]);
    expect(sel.imageIds).toEqual(['c']);
  });
});

describe('identifyProductPhotos', () => {
  beforeEach(() => fakeSupabase.reset());

  it('sends image_urls + speakingLanguage and returns the untouched body alongside the validated guess', async () => {
    const raw = { ...response, item_name: '  Brass Diya  ' };
    const invoke = vi.fn(async () => ({ data: raw, error: null }));
    fakeSupabase.functionsInvoke = invoke;

    const result = await identifyProductPhotos([img('a', 0, true), img('b', 1)], 'hi');

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('identify-product', {
      body: { image_urls: [expect.stringContaining('/a/raw.jpg'), expect.stringContaining('/b/raw.jpg')], speakingLanguage: 'hi' },
    });
    expect(result.raw).toBe(raw); // untouched object
    expect(result.identification.item_name).toBe('Brass Diya'); // validated copy
    expect(result.usedImageIds).toEqual(['a', 'b']);
    expect(result.retriedWithCoverOnly).toBe(false);
  });

  it('on 413 retries exactly once with the cover alone', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: fakeFunctionsHttpError(413, { error: 'too large' }) })
      .mockResolvedValueOnce({ data: response, error: null });
    fakeSupabase.functionsInvoke = invoke;

    const result = await identifyProductPhotos([img('p0', 0), img('cov', 1, true), img('p2', 2)], 'mr');

    expect(invoke).toHaveBeenCalledTimes(2);
    expect((invoke.mock.calls[0][1] as { body: { image_urls: string[] } }).body.image_urls).toHaveLength(3);
    expect(invoke.mock.calls[1][1]).toEqual({
      body: { image_urls: [expect.stringContaining('/cov/raw.jpg')], speakingLanguage: 'mr' },
    });
    expect(result.usedImageIds).toEqual(['cov']);
    expect(result.retriedWithCoverOnly).toBe(true);
  });

  it('does not retry a 413 more than once, nor retry other errors', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: fakeFunctionsHttpError(413, { error: 'too large' }) }));
    fakeSupabase.functionsInvoke = invoke;
    await expect(identifyProductPhotos([img('a', 0, true), img('b', 1)], 'hi')).rejects.toMatchObject({ status: 413 });
    expect(invoke).toHaveBeenCalledTimes(2);

    const invoke400 = vi.fn(async () => ({ data: null, error: fakeFunctionsHttpError(400, { error: 'bad url' }) }));
    fakeSupabase.functionsInvoke = invoke400;
    await expect(identifyProductPhotos([img('a', 0, true), img('b', 1)], 'hi')).rejects.toMatchObject({ status: 400 });
    expect(invoke400).toHaveBeenCalledTimes(1);
  });

  it('a single-photo 413 is not retried (nothing smaller to send)', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: fakeFunctionsHttpError(413, {}) }));
    fakeSupabase.functionsInvoke = invoke;
    await expect(identifyProductPhotos([img('a', 0, true)], 'hi')).rejects.toBeInstanceOf(ProductIdentificationError);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects responses that fail validation, and omits unsupported speaking languages', async () => {
    const invoke = vi.fn(async (_name: string, _options?: { body?: unknown }) => ({
      data: { ...response, finish: 'shiny' } as unknown,
      error: null as unknown,
    }));
    fakeSupabase.functionsInvoke = invoke;
    await expect(identifyProductPhotos([img('a', 0, true)], 'fr')).rejects.toThrow('Invalid identification response');
    expect(invoke.mock.calls[0][1]).toEqual({ body: { image_urls: [expect.any(String)] } });
  });

  it('refuses to call the function when there are no photos', async () => {
    const invoke = vi.fn();
    fakeSupabase.functionsInvoke = invoke;
    await expect(identifyProductPhotos([], 'hi')).rejects.toThrow('No saved photos');
    expect(invoke).not.toHaveBeenCalled();
  });
});
