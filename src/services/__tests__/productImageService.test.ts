/**
 * Stage 6.2: productImageService — REAL LOGIC under test:
 *   add / cover selection / cover change / delete + cover reassignment /
 *   per-photo choice / cover -> products sync / storage path layout.
 *
 * MOCKED AT THE BOUNDARY:
 *   - Supabase client -> in-memory fake (src/test/fakeSupabase.ts). No Postgres:
 *     RLS, the 5-image trigger and the partial unique cover index are NOT
 *     executed. Where a test needs those rules it opts into
 *     productImageInvariants(), a JS re-statement of them.
 *   RLS and the SQL trigger/index were NOT verified against a live database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeSupabase, productImageInvariants } from '../../test/fakeSupabase';
import {
  addProductImage,
  buildCoverSyncPatch,
  collectProductImageStoragePaths,
  deleteProductImage,
  nextFreePosition,
  pickNextCover,
  productImageStoragePaths,
  ProductImageLimitError,
  setCoverImage,
  setImageFinalChoice,
  syncCoverToProduct,
} from '../productImageService';
import type { ProductImage } from '../../types/product';
import { resizeImageForUpload } from '../../utils/imageResize';

vi.mock('../../lib/supabase/client', async () => {
  const { fakeSupabase: fake } = await import('../../test/fakeSupabase');
  return { supabase: fake.client };
});

// Stage 6.4: the resize itself needs a browser image decoder (absent in jsdom);
// its maths is tested with real logic in utils/__tests__/imageResize.test.ts.
// Here it is a pass-through spy so we can assert what addProductImage uploads.
vi.mock('../../utils/imageResize', () => ({
  resizeImageForUpload: vi.fn(async (blob: Blob) => blob),
}));

const PRODUCT = 'prod-1';
const ARTISAN = 'artisan-1';
const BUCKET = 'product-photos-raw';

const image = (overrides: Partial<ProductImage>): ProductImage => ({
  id: 'img',
  product_id: PRODUCT,
  artisan_id: ARTISAN,
  position: 0,
  original_image_url: null,
  enhanced_image_url: null,
  image_processing_status: 'pending',
  final_image_choice: null,
  is_cover: false,
  created_at: '2026-09-24T00:00:00Z',
  ...overrides,
});

const seed = (images: ProductImage[]) =>
  fakeSupabase.reset({
    products: [{ id: PRODUCT, artisan_id: ARTISAN, listing_status: 'draft' }],
    product_images: images,
  });

const product = () => fakeSupabase.rows('products').find((p) => p.id === PRODUCT)!;
const imagesInDb = () =>
  [...fakeSupabase.rows('product_images')].sort((a, b) => a.position - b.position) as ProductImage[];

describe('productImageService', () => {
  beforeEach(() => {
    seed([]);
    fakeSupabase.invariants = productImageInvariants;
  });
  afterEach(() => vi.restoreAllMocks());

  describe('pure helpers', () => {
    it('storage paths are per image, so photos never overwrite each other', () => {
      const a = productImageStoragePaths({ artisan_id: 'art', product_id: 'p', id: 'i1' });
      const b = productImageStoragePaths({ artisan_id: 'art', product_id: 'p', id: 'i2' });
      expect(a).toEqual({ raw: 'art/p/i1/raw.jpg', enhanced: 'art/p/i1/enhanced.png' });
      expect(b.raw).not.toBe(a.raw);
      expect(b.enhanced).not.toBe(a.enhanced);
      // First folder segment is the artisan id (storage RLS: foldername[1] = auth.uid()).
      expect(a.raw.split('/')[0]).toBe('art');
    });

    it('nextFreePosition returns the lowest free slot, or null when all 5 are used', () => {
      expect(nextFreePosition([])).toBe(0);
      expect(nextFreePosition([{ position: 0 }, { position: 2 }])).toBe(1);
      expect(nextFreePosition([0, 1, 2, 3, 4].map((position) => ({ position })))).toBeNull();
    });

    it('pickNextCover picks the next photo in slot order, wrapping to the first', () => {
      const imgs = [
        image({ id: 'a', position: 0 }),
        image({ id: 'b', position: 2 }),
        image({ id: 'c', position: 4 }),
      ];
      expect(pickNextCover(imgs, 'a')?.id).toBe('b');
      expect(pickNextCover(imgs, 'b')?.id).toBe('c');
      expect(pickNextCover(imgs, 'c')?.id).toBe('a'); // wraps
      expect(pickNextCover([image({ id: 'only' })], 'only')).toBeNull();
    });

    it('buildCoverSyncPatch mirrors the cover fields, and clears them when there is no cover', () => {
      expect(
        buildCoverSyncPatch(
          image({
            original_image_url: 'o.jpg',
            enhanced_image_url: 'e.png',
            image_processing_status: 'enhanced',
            final_image_choice: 'original',
          })
        )
      ).toEqual({
        original_image_url: 'o.jpg',
        enhanced_image_url: 'e.png',
        image_processing_status: 'enhanced',
        final_image_choice: 'original',
      });
      expect(buildCoverSyncPatch(null)).toEqual({
        original_image_url: null,
        enhanced_image_url: null,
        image_processing_status: 'pending',
        final_image_choice: null,
      });
    });
  });

  describe('addProductImage', () => {
    it('uploads to {artisan}/{product}/{image}/raw.jpg, makes the first photo cover and syncs it to products', async () => {
      const first = await addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: new Blob(['a']) });

      expect(first.is_cover).toBe(true);
      expect(first.position).toBe(0);
      expect(first.image_processing_status).toBe('pending');
      const rawPath = `${ARTISAN}/${PRODUCT}/${first.id}/raw.jpg`;
      expect(fakeSupabase.storage.has(`${BUCKET}/${rawPath}`)).toBe(true);
      expect(first.original_image_url).toBe(`https://fake.storage/${BUCKET}/${rawPath}`);

      // Cover synced onto the products row
      expect(product().original_image_url).toBe(first.original_image_url);
      expect(product().image_processing_status).toBe('pending');

      const second = await addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: new Blob(['b']) });
      expect(second.is_cover).toBe(false);
      expect(second.position).toBe(1);
      expect(second.id).not.toBe(first.id);
      // Products row still reflects the first (cover) photo
      expect(product().original_image_url).toBe(first.original_image_url);
    });

    it('uploads the RESIZED photo (Stage 6.4), not the original', async () => {
      const original = new Blob(['huge-camera-photo'], { type: 'image/heic' });
      const resized = new Blob(['1600px-jpeg'], { type: 'image/jpeg' });
      vi.mocked(resizeImageForUpload).mockResolvedValueOnce(resized);

      const added = await addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: original });

      expect(resizeImageForUpload).toHaveBeenCalledWith(original);
      expect(fakeSupabase.storage.get(`${BUCKET}/${ARTISAN}/${PRODUCT}/${added.id}/raw.jpg`)).toBe(resized);
    });

    it('if the browser cannot resize, uploads the original instead of losing the photo, and says so', async () => {
      const original = new Blob(['undecodable'], { type: 'image/jpeg' });
      vi.mocked(resizeImageForUpload).mockRejectedValueOnce(new Error('createImageBitmap is not available'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const added = await addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: original });

      expect(fakeSupabase.storage.get(`${BUCKET}/${ARTISAN}/${PRODUCT}/${added.id}/raw.jpg`)).toBe(original);
      expect(warnSpy).toHaveBeenCalledWith(
        '[ProductImageService] Could not resize photo; uploading original:',
        expect.any(Error)
      );
    });

    it('uses the authenticated uid as the storage folder and artisan_id when signed in', async () => {
      fakeSupabase.authUserId = 'auth-uid-9';
      const img = await addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: new Blob(['a']) });
      expect(img.artisan_id).toBe('auth-uid-9');
      expect(img.original_image_url).toContain(`/auth-uid-9/${PRODUCT}/${img.id}/raw.jpg`);
    });

    it('rejects a 6th photo before uploading anything', async () => {
      seed([0, 1, 2, 3, 4].map((position) => image({ id: `i${position}`, position, is_cover: position === 0 })));
      await expect(
        addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: new Blob(['x']) })
      ).rejects.toBeInstanceOf(ProductImageLimitError);
      expect(fakeSupabase.calls.some((c) => c.kind === 'upload')).toBe(false);
      expect(imagesInDb()).toHaveLength(5);
    });

    it('maps a DB limit-trigger rejection to ProductImageLimitError and removes the uploaded file', async () => {
      fakeSupabase.failNext('product_images', 'insert', 'product_images limit exceeded: product prod-1 already has 5 images');
      await expect(
        addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: new Blob(['x']) })
      ).rejects.toBeInstanceOf(ProductImageLimitError);
      expect(fakeSupabase.storage.size).toBe(0);
    });

    it('throws (no silent failure) when the upload fails, and inserts no row', async () => {
      fakeSupabase.failNext(BUCKET, 'upload', 'network down');
      await expect(
        addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: new Blob(['x']) })
      ).rejects.toThrow('Photo upload failed: network down');
      expect(imagesInDb()).toHaveLength(0);
    });

    it('fills the requested slot, or the lowest free one if it is taken', async () => {
      seed([image({ id: 'a', position: 0, is_cover: true })]);
      const atThree = await addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: new Blob(['x']), position: 3 });
      expect(atThree.position).toBe(3);
      const taken = await addProductImage({ productId: PRODUCT, artisanId: ARTISAN, blob: new Blob(['y']), position: 0 });
      expect(taken.position).toBe(1);
    });
  });

  describe('setCoverImage', () => {
    it('moves the cover (old cleared before new is set, so the one-cover rule holds) and syncs products', async () => {
      seed([
        image({ id: 'a', position: 0, is_cover: true, original_image_url: 'a.jpg' }),
        image({
          id: 'b',
          position: 1,
          original_image_url: 'b.jpg',
          enhanced_image_url: 'b.png',
          image_processing_status: 'enhanced',
        }),
      ]);
      fakeSupabase.invariants = productImageInvariants;

      await setCoverImage(PRODUCT, 'b');

      expect(imagesInDb().filter((i) => i.is_cover).map((i) => i.id)).toEqual(['b']);
      expect(product()).toMatchObject({
        original_image_url: 'b.jpg',
        enhanced_image_url: 'b.png',
        image_processing_status: 'enhanced',
      });
    });

    it('restores the previous cover if the new one cannot be set', async () => {
      seed([image({ id: 'a', position: 0, is_cover: true }), image({ id: 'b', position: 1 })]);
      // The unset of 'a' succeeds; the set of 'b' fails.
      let updates = 0;
      fakeSupabase.hooks.beforeQuery = (table, op) => {
        if (table === 'product_images' && op === 'update' && ++updates === 2) {
          fakeSupabase.failNext('product_images', 'update', 'boom');
        }
      };

      await expect(setCoverImage(PRODUCT, 'b')).rejects.toThrow('Could not change cover');
      expect(imagesInDb().filter((i) => i.is_cover).map((i) => i.id)).toEqual(['a']);
    });
  });

  describe('deleteProductImage', () => {
    it('deletes the row and both storage files; deleting the cover makes the next photo cover and re-syncs', async () => {
      seed([
        image({ id: 'a', position: 0, is_cover: true, original_image_url: 'a.jpg' }),
        image({ id: 'b', position: 1, original_image_url: 'b.jpg' }),
        image({ id: 'c', position: 2, original_image_url: 'c.jpg' }),
      ]);
      const aPaths = productImageStoragePaths({ id: 'a', product_id: PRODUCT, artisan_id: ARTISAN });
      fakeSupabase.storage.set(`${BUCKET}/${aPaths.raw}`, new Blob(['r']));
      fakeSupabase.storage.set(`${BUCKET}/${aPaths.enhanced}`, new Blob(['e']));

      const result = await deleteProductImage(imagesInDb()[0]);

      expect(result.newCoverId).toBe('b');
      expect(imagesInDb().map((i) => i.id)).toEqual(['b', 'c']);
      expect(imagesInDb().find((i) => i.id === 'b')?.is_cover).toBe(true);
      expect(fakeSupabase.storage.size).toBe(0);
      expect(product().original_image_url).toBe('b.jpg');
    });

    it('deleting a non-cover photo leaves the cover alone', async () => {
      seed([image({ id: 'a', position: 0, is_cover: true }), image({ id: 'b', position: 1 })]);
      const result = await deleteProductImage(imagesInDb()[1]);
      expect(result.newCoverId).toBeNull();
      expect(imagesInDb().map((i) => [i.id, i.is_cover])).toEqual([['a', true]]);
    });

    it('deleting the last photo clears the mirrored fields on products', async () => {
      seed([image({ id: 'a', position: 0, is_cover: true, original_image_url: 'a.jpg' })]);
      await syncCoverToProduct(PRODUCT);
      expect(product().original_image_url).toBe('a.jpg');

      await deleteProductImage(imagesInDb()[0]);

      expect(imagesInDb()).toHaveLength(0);
      expect(product()).toMatchObject({
        original_image_url: null,
        enhanced_image_url: null,
        image_processing_status: 'pending',
        final_image_choice: null,
      });
    });

    it('reports (does not swallow) a storage cleanup failure', async () => {
      seed([image({ id: 'a', position: 0, is_cover: true })]);
      fakeSupabase.failNext(BUCKET, 'remove', 'storage offline');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await deleteProductImage(imagesInDb()[0]);

      expect(result.storageError).toBe('storage offline');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('setImageFinalChoice + syncCoverToProduct', () => {
    it("a cover photo's choice is mirrored onto products; a non-cover choice is not", async () => {
      seed([
        image({ id: 'a', position: 0, is_cover: true, image_processing_status: 'enhanced' }),
        image({ id: 'b', position: 1, image_processing_status: 'enhanced' }),
      ]);

      await setImageFinalChoice('b', 'original');
      expect(imagesInDb()[1].final_image_choice).toBe('original');
      expect(product().final_image_choice).toBeNull();

      await setImageFinalChoice('a', 'enhanced');
      expect(product().final_image_choice).toBe('enhanced');
    });

    it('syncCoverToProduct never throws and reports failures', async () => {
      seed([image({ id: 'a', is_cover: true })]);
      fakeSupabase.failNext('products', 'update', 'rls denied');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(syncCoverToProduct(PRODUCT)).resolves.toEqual({ ok: false, error: 'rls denied' });
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  it('collectProductImageStoragePaths lists raw + enhanced paths for every photo of a product', async () => {
    seed([image({ id: 'a', position: 0 }), image({ id: 'b', position: 1 })]);
    await expect(collectProductImageStoragePaths(PRODUCT)).resolves.toEqual([
      `${ARTISAN}/${PRODUCT}/a/raw.jpg`,
      `${ARTISAN}/${PRODUCT}/a/enhanced.png`,
      `${ARTISAN}/${PRODUCT}/b/raw.jpg`,
      `${ARTISAN}/${PRODUCT}/b/enhanced.png`,
    ]);
  });
});
