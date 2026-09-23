/**
 * Stage 6.2: PhotosStep (Add Item wizard step 0).
 *
 * REAL LOGIC under test (not mocked):
 *   PhotosStep, PhotoSourceSheet, EnhancedPhotoReview (per-image mode),
 *   productImageService (upload, cover, delete, cover -> products sync),
 *   enhancementQueue + processProductImageById (sequential processing).
 *
 * MOCKED AT THE BOUNDARY (explicitly):
 *   - Supabase client -> in-memory fake (src/test/fakeSupabase.ts). No
 *     Postgres, RLS, trigger or index runs; RLS was NOT live-verified.
 *   - useImageCapture -> "Take Photo" immediately yields a JPEG Blob, because
 *     there is no device camera / Capacitor runtime under jsdom.
 *   - runSegmentation (@imgly/background-removal WASM) and correctLighting
 *     (canvas) -> controllable vi.fn()s; neither runtime exists under jsdom.
 *   - global fetch (raw photo download inside the pipeline) -> fixed Blob.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PhotosStep } from '../steps/PhotosStep';
import { fakeSupabase, productImageInvariants } from '../../../../test/fakeSupabase';
import { enhancementQueue } from '../../../../services/imageProcessingQueue';
import { runSegmentation } from '../../../../services/aiRuntimeService';
import { correctLighting } from '../../../../services/lightingCorrectionService';

vi.mock('../../../../lib/supabase/client', async () => {
  const { fakeSupabase: fake } = await import('../../../../test/fakeSupabase');
  return { supabase: fake.client };
});

vi.mock('../../../../hooks/useImageCapture', () => ({
  useImageCapture: (options?: { onPhotoSelected?: (blob: Blob, url: string) => void }) => {
    let n = 0;
    const deliver = async () => {
      n += 1;
      options?.onPhotoSelected?.(new Blob([`photo-${n}`], { type: 'image/jpeg' }), `blob:preview-${n}`);
    };
    return {
      captureFromCamera: deliver,
      captureFromGallery: deliver,
      cameraInputRef: { current: null },
      galleryInputRef: { current: null },
      handleWebCameraChange: () => {},
      handleWebGalleryChange: () => {},
      errorInfo: null,
      clearError: () => {},
      isNative: false,
    };
  },
}));

// Stage 6.4 resize needs a browser image decoder (absent in jsdom); pass-through here,
// real maths tested in utils/__tests__/imageResize.test.ts.
vi.mock('../../../../utils/imageResize', () => ({
  resizeImageForUpload: async (blob: Blob) => blob,
}));

vi.mock('../../../../services/aiRuntimeService', () => ({ runSegmentation: vi.fn() }));
vi.mock('../../../../services/lightingCorrectionService', () => ({ correctLighting: vi.fn() }));

const PRODUCT = 'prod-1';
const ARTISAN = 'artisan-1';
const BUCKET = 'product-photos-raw';

/** Segmentation calls wait here until the test releases them. */
let segmentationCalls: Array<{ resolve: (b: Blob) => void; reject: (e: unknown) => void }> = [];

const flush = async (rounds = 6) => {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

const seedRow = (id: string, position: number, overrides: Record<string, unknown> = {}) => ({
  id,
  product_id: PRODUCT,
  artisan_id: ARTISAN,
  position,
  original_image_url: `https://fake.storage/${BUCKET}/${ARTISAN}/${PRODUCT}/${id}/raw.jpg`,
  enhanced_image_url: null,
  image_processing_status: 'enhanced',
  final_image_choice: null,
  is_cover: position === 0,
  created_at: '2026-09-24T00:00:00Z',
  ...overrides,
});

describe('PhotosStep (Stage 6.2)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onUploadedCountChange: ReturnType<typeof vi.fn<(count: number) => void>>;

  const q = (testId: string) => container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  const statusOf = (position: number) => q(`slot-status-${position}`)?.getAttribute('data-status');
  const dbImages = () => [...fakeSupabase.rows('product_images')].sort((a, b) => a.position - b.position);
  const product = () => fakeSupabase.rows('products')[0];

  const click = async (el: HTMLElement | null) => {
    expect(el).not.toBeNull();
    await act(async () => {
      el!.click();
    });
    await flush();
  };

  const addPhotoAt = async (position: number) => {
    await click(q(`empty-slot-${position}`));
    expect(q('photo-source-sheet')).not.toBeNull();
    expect(container.textContent).toContain('फोटो जोड़ें');
    await click(q('take-photo-button'));
  };

  const render = async () => {
    await act(async () => {
      root.render(
        <PhotosStep productId={PRODUCT} artisanId={ARTISAN} onUploadedCountChange={onUploadedCountChange} />
      );
    });
    await flush();
  };

  beforeEach(() => {
    fakeSupabase.reset({
      products: [{ id: PRODUCT, artisan_id: ARTISAN, listing_status: 'draft' }],
      product_images: [],
    });
    fakeSupabase.invariants = productImageInvariants;
    segmentationCalls = [];
    vi.mocked(runSegmentation).mockReset();
    vi.mocked(correctLighting).mockReset();
    vi.mocked(runSegmentation).mockImplementation(
      () => new Promise<Blob>((resolve, reject) => segmentationCalls.push({ resolve, reject }))
    );
    vi.mocked(correctLighting).mockImplementation(async (b: Blob) => b);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['raw'], { type: 'image/jpeg' }),
    })) as unknown as typeof fetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    onUploadedCountChange = vi.fn<(count: number) => void>();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    // Drain the app-wide queue so no job leaks into the next test.
    segmentationCalls.forEach((c) => c.resolve(new Blob(['seg'], { type: 'image/png' })));
    vi.mocked(runSegmentation).mockResolvedValue(new Blob(['seg'], { type: 'image/png' }));
    await act(async () => {
      await enhancementQueue.onIdle();
    });
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders five empty slots, the bilingual front/side/close-up tip strip, and reports 0 photos', async () => {
    await render();
    for (let p = 0; p < 5; p++) expect(q(`empty-slot-${p}`)).not.toBeNull();
    const tips = q('photo-tips')!.textContent!;
    for (const label of ['Front', 'सामने से', 'Side', 'बगल से', 'Close-up', 'नज़दीक से']) {
      expect(tips).toContain(label);
    }
    expect(onUploadedCountChange).toHaveBeenLastCalledWith(0);
  });

  it('add: camera/gallery sheet -> upload -> first photo is cover, shows "enhancing", and counts toward canProceed', async () => {
    await render();
    await addPhotoAt(0);

    expect(q('photo-source-sheet')).toBeNull(); // sheet closed after selection
    expect(dbImages()).toHaveLength(1);
    const [row] = dbImages();
    expect(fakeSupabase.storage.has(`${BUCKET}/${ARTISAN}/${PRODUCT}/${row.id}/raw.jpg`)).toBe(true);
    expect(onUploadedCountChange).toHaveBeenLastCalledWith(1);

    // Cover badge by default on the first photo, synced to products
    expect(q('cover-badge-0')).not.toBeNull();
    expect(row.is_cover).toBe(true);
    expect(product().original_image_url).toBe(row.original_image_url);

    // Segmentation is in flight -> spinner state
    expect(statusOf(0)).toBe('processing');
    expect(q('slot-status-0')!.textContent).toContain('Enhancing');
    expect(q('slot-status-0')!.querySelector('.animate-spin')).not.toBeNull();
  });

  it('enhanced: status flips to enhanced; tapping opens EnhancedPhotoReview and the per-photo choice is saved', async () => {
    await render();
    await addPhotoAt(0);
    await act(async () => segmentationCalls[0].resolve(new Blob(['seg'], { type: 'image/png' })));
    await flush();

    expect(statusOf(0)).toBe('enhanced');
    const [row] = dbImages();
    expect(row.enhanced_image_url).toBe(`https://fake.storage/${BUCKET}/${ARTISAN}/${PRODUCT}/${row.id}/enhanced.png`);
    expect(product().image_processing_status).toBe('enhanced');

    await click(q('open-review-0'));
    expect(q('enhanced-photo-review')).not.toBeNull();
    expect(q('enhanced-state')).not.toBeNull();

    await click(q('use-original-button'));
    expect(q('enhanced-photo-review')).toBeNull(); // back to the grid
    expect(dbImages()[0].final_image_choice).toBe('original');
    expect(product().final_image_choice).toBe('original'); // cover -> products
  });

  it('failed + retry: shows the retry icon, and retry re-runs enhancement to success', async () => {
    await render();
    await addPhotoAt(0);
    await act(async () => segmentationCalls[0].reject(new Error('inference failed')));
    await flush();

    expect(statusOf(0)).toBe('failed');
    expect(dbImages()[0].image_processing_status).toBe('failed');
    expect(q('retry-photo-0')).not.toBeNull();
    expect(q('open-review-0')!.hasAttribute('disabled')).toBe(true);

    await click(q('retry-photo-0'));
    expect(statusOf(0)).toBe('processing');
    expect(segmentationCalls).toHaveLength(2);

    await act(async () => segmentationCalls[1].resolve(new Blob(['seg'], { type: 'image/png' })));
    await flush();
    expect(statusOf(0)).toBe('enhanced');
    expect(q('retry-photo-0')).toBeNull();
  });

  it('processes photos one at a time: the second waits until the first finishes', async () => {
    await render();
    await addPhotoAt(0);
    await addPhotoAt(1);

    expect(statusOf(0)).toBe('processing');
    expect(statusOf(1)).toBe('pending');
    expect(q('slot-status-1')!.textContent).toContain('Waiting');
    expect(runSegmentation).toHaveBeenCalledTimes(1);

    await act(async () => segmentationCalls[0].resolve(new Blob(['seg'], { type: 'image/png' })));
    await flush();

    expect(statusOf(0)).toBe('enhanced');
    expect(statusOf(1)).toBe('processing');
    expect(runSegmentation).toHaveBeenCalledTimes(2);
  });

  it('cover change: tapping the star on another photo makes it the only cover and syncs products', async () => {
    fakeSupabase.reset({
      products: [{ id: PRODUCT, artisan_id: ARTISAN, listing_status: 'draft' }],
      product_images: [seedRow('a', 0), seedRow('b', 1, { enhanced_image_url: 'https://fake/b.png' })],
    });
    fakeSupabase.invariants = productImageInvariants;
    await render();

    expect(q('cover-badge-0')).not.toBeNull();
    await click(q('set-cover-1'));

    expect(q('cover-badge-1')).not.toBeNull();
    expect(q('set-cover-0')).not.toBeNull();
    expect(dbImages().map((r) => [r.id, r.is_cover])).toEqual([
      ['a', false],
      ['b', true],
    ]);
    expect(product().enhanced_image_url).toBe('https://fake/b.png');
  });

  it('delete: bilingual confirmation; cancel keeps the photo', async () => {
    fakeSupabase.reset({
      products: [{ id: PRODUCT, artisan_id: ARTISAN, listing_status: 'draft' }],
      product_images: [seedRow('a', 0)],
    });
    await render();

    await click(q('delete-photo-0'));
    const dialog = q('delete-confirm-dialog')!;
    expect(dialog.textContent).toContain('Delete this photo?');
    expect(dialog.textContent).toContain('यह फोटो हटाएं?');

    await click(q('cancel-delete-button'));
    expect(q('delete-confirm-dialog')).toBeNull();
    expect(dbImages()).toHaveLength(1);
  });

  it('delete the cover: next photo becomes cover, row and storage files are removed, products re-synced', async () => {
    fakeSupabase.reset({
      products: [{ id: PRODUCT, artisan_id: ARTISAN, listing_status: 'draft' }],
      product_images: [seedRow('a', 0), seedRow('b', 1), seedRow('c', 2)],
    });
    fakeSupabase.invariants = productImageInvariants;
    fakeSupabase.storage.set(`${BUCKET}/${ARTISAN}/${PRODUCT}/a/raw.jpg`, new Blob(['r']));
    fakeSupabase.storage.set(`${BUCKET}/${ARTISAN}/${PRODUCT}/a/enhanced.png`, new Blob(['e']));
    await render();

    await click(q('delete-photo-0'));
    expect(q('delete-confirm-dialog')!.textContent).toContain('अगली फोटो मुख्य फोटो बनेगी');
    await click(q('confirm-delete-button'));

    expect(q('delete-confirm-dialog')).toBeNull();
    expect(q('empty-slot-0')).not.toBeNull();
    expect(q('cover-badge-1')).not.toBeNull();
    expect(dbImages().map((r) => [r.id, r.is_cover])).toEqual([
      ['b', true],
      ['c', false],
    ]);
    expect(fakeSupabase.storage.size).toBe(0);
    const removed = fakeSupabase.calls.find((c) => c.kind === 'remove')!.payload;
    expect(removed).toEqual([`${ARTISAN}/${PRODUCT}/a/raw.jpg`, `${ARTISAN}/${PRODUCT}/a/enhanced.png`]);
    expect(product().original_image_url).toBe(seedRow('b', 1).original_image_url);
    expect(onUploadedCountChange).toHaveBeenLastCalledWith(2);
  });

  it('5-photo limit: with 5 photos there are no add slots and the limit message shows', async () => {
    await render();
    for (let p = 0; p < 5; p++) {
      await addPhotoAt(p);
    }

    expect(dbImages()).toHaveLength(5);
    for (let p = 0; p < 5; p++) expect(q(`empty-slot-${p}`)).toBeNull();
    expect(q('photo-limit-reached')!.textContent).toContain('अधिकतम 5 फोटो');
    expect(onUploadedCountChange).toHaveBeenLastCalledWith(5);
    expect(dbImages().filter((r) => r.is_cover)).toHaveLength(1);
  });

  it('upload failure shows a bilingual error and does not count as uploaded', async () => {
    await render();
    fakeSupabase.failNext(BUCKET, 'upload', 'network down');
    await addPhotoAt(0);

    expect(q('photos-step-error')!.textContent).toContain('फोटो सहेजी नहीं गई');
    expect(q('empty-slot-0')).not.toBeNull();
    expect(dbImages()).toHaveLength(0);
    expect(onUploadedCountChange).toHaveBeenLastCalledWith(0);
  });

  it('resuming a draft: loads saved photos and re-queues unfinished ones', async () => {
    fakeSupabase.reset({
      products: [{ id: PRODUCT, artisan_id: ARTISAN, listing_status: 'draft' }],
      product_images: [seedRow('a', 0), seedRow('b', 3, { image_processing_status: 'pending' })],
    });
    await render();

    expect(statusOf(0)).toBe('enhanced');
    expect(statusOf(3)).toBe('processing');
    expect(runSegmentation).toHaveBeenCalledTimes(1);
    expect(onUploadedCountChange).toHaveBeenLastCalledWith(2);
  });
});
