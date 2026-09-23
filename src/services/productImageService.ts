/**
 * Stage 6.2: Multi-photo product images (up to 5 per product, one cover).
 *
 * Every write to `product_images` goes through this module.
 *
 * COVER SYNC — WHERE AND WHY
 * --------------------------
 * The cover image's original_image_url / enhanced_image_url /
 * image_processing_status / final_image_choice are mirrored onto the parent
 * `products` row so getDisplayImageUrl(), hasDraftContent() and every existing
 * products reader keep working unchanged.
 *
 * The mirror is implemented once, in syncCoverToProduct() below, rather than
 * as a Postgres trigger, because:
 *  1. It recomputes the products fields from the *current* cover row every
 *     time (idempotent), so any caller can re-run it to heal a stale row, and
 *     ordering between concurrent writers does not matter.
 *  2. It is exercised with real logic in the test suite; a trigger could not
 *     be run at all in this environment (no live Postgres/Supabase).
 *  3. All product_images writes already funnel through this file (add,
 *     set cover, delete, choice) and through processProductImageById(), which
 *     calls it after every status transition.
 * Trade-off: it is two statements, not one transaction. If the products
 * update fails, the error is logged (never swallowed) and the next mutation
 * or processing step re-syncs. A DB trigger would be atomic; move it there if
 * writes ever start happening outside this module.
 */
import { supabase } from '../lib/supabase/client';
import { resizeImageForUpload } from '../utils/imageResize';
import {
  MAX_PRODUCT_IMAGES,
  type FinalImageChoice,
  type ImageProcessingStatus,
  type ProductImage,
} from '../types/product';

export const PRODUCT_PHOTOS_BUCKET = 'product-photos-raw';

const IMAGE_COLUMNS =
  'id, product_id, artisan_id, position, original_image_url, enhanced_image_url, image_processing_status, final_image_choice, is_cover, created_at';

export class ProductImageLimitError extends Error {
  constructor() {
    super(`A product can have at most ${MAX_PRODUCT_IMAGES} photos.`);
    this.name = 'ProductImageLimitError';
  }
}

/** Per-image storage paths. First folder segment is the artisan id (storage RLS). */
export function productImageStoragePaths(
  image: Pick<ProductImage, 'artisan_id' | 'product_id' | 'id'>
): { raw: string; enhanced: string } {
  const base = `${image.artisan_id}/${image.product_id}/${image.id}`;
  return { raw: `${base}/raw.jpg`, enhanced: `${base}/enhanced.png` };
}

/** UUID v4 for a new image row, generated client-side so the storage path can use it before insert. */
export function newImageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Prefer the authenticated session uid so rows and storage folders satisfy
 * RLS (artisan_id = auth.uid()); fall back to the passed id offline/demo.
 */
async function resolveArtisanId(fallbackArtisanId: string): Promise<string> {
  try {
    if (supabase.auth) {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) return data.user.id;
    }
  } catch {
    // Offline / unauthenticated fallback
  }
  return fallbackArtisanId;
}

/** Lowest free slot (0..4), or null when all five are taken. */
export function nextFreePosition(images: Pick<ProductImage, 'position'>[]): number | null {
  const taken = new Set(images.map((img) => img.position));
  for (let pos = 0; pos < MAX_PRODUCT_IMAGES; pos++) {
    if (!taken.has(pos)) return pos;
  }
  return null;
}

/**
 * The photo that becomes cover when `deletedId` (the current cover) is removed:
 * the next photo after it in slot order, wrapping to the first remaining one.
 */
export function pickNextCover(images: ProductImage[], deletedId: string): ProductImage | null {
  const sorted = [...images].sort((a, b) => a.position - b.position);
  const deleted = sorted.find((img) => img.id === deletedId);
  const remaining = sorted.filter((img) => img.id !== deletedId);
  if (remaining.length === 0) return null;
  if (!deleted) return remaining[0];
  return remaining.find((img) => img.position > deleted.position) ?? remaining[0];
}

export interface CoverSyncPatch {
  original_image_url: string | null;
  enhanced_image_url: string | null;
  image_processing_status: ImageProcessingStatus;
  final_image_choice: FinalImageChoice | null;
}

/** Products-row fields that mirror the cover image (cleared when there is no cover). */
export function buildCoverSyncPatch(
  cover: Pick<
    ProductImage,
    'original_image_url' | 'enhanced_image_url' | 'image_processing_status' | 'final_image_choice'
  > | null
): CoverSyncPatch {
  if (!cover) {
    return {
      original_image_url: null,
      enhanced_image_url: null,
      image_processing_status: 'pending',
      final_image_choice: null,
    };
  }
  return {
    original_image_url: cover.original_image_url,
    enhanced_image_url: cover.enhanced_image_url,
    image_processing_status: cover.image_processing_status,
    final_image_choice: cover.final_image_choice,
  };
}

/**
 * THE single cover -> products sync. Reads the current cover row and writes
 * its fields onto the parent product. Idempotent; safe to call after any change.
 * Never throws: failures are logged and returned.
 */
export async function syncCoverToProduct(
  productId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: cover, error: coverError } = await supabase
      .from('product_images')
      .select('original_image_url, enhanced_image_url, image_processing_status, final_image_choice')
      .eq('product_id', productId)
      .eq('is_cover', true)
      .maybeSingle();

    if (coverError) throw new Error(coverError.message);

    const { error: updateError } = await supabase
      .from('products')
      .update(buildCoverSyncPatch(cover as Parameters<typeof buildCoverSyncPatch>[0]))
      .eq('id', productId);

    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ProductImageService] Cover sync failed for product ${productId}:`, message);
    return { ok: false, error: message };
  }
}

export async function listProductImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select(IMAGE_COLUMNS)
    .eq('product_id', productId)
    .order('position', { ascending: true });

  if (error) throw new Error(`Could not load photos: ${error.message}`);
  return (data ?? []) as ProductImage[];
}

export interface AddProductImageParams {
  productId: string;
  artisanId: string;
  blob: Blob;
  /** Preferred slot; falls back to the lowest free slot if taken. */
  position?: number;
}

/**
 * Uploads a raw photo to {artisan}/{product}/{image}/raw.jpg and inserts its
 * row. The first photo of a product becomes the cover. Throws on failure and
 * removes the uploaded file if the row could not be inserted.
 */
export async function addProductImage({
  productId,
  artisanId,
  blob,
  position,
}: AddProductImageParams): Promise<ProductImage> {
  const existing = await listProductImages(productId);
  if (existing.length >= MAX_PRODUCT_IMAGES) throw new ProductImageLimitError();

  const taken = new Set(existing.map((img) => img.position));
  const slot = position !== undefined && !taken.has(position) ? position : nextFreePosition(existing);
  if (slot === null) throw new ProductImageLimitError();

  const id = newImageId();
  const ownerId = await resolveArtisanId(artisanId);
  const paths = productImageStoragePaths({ id, product_id: productId, artisan_id: ownerId });

  // Stage 6.4: shrink on the phone (longest side <= 1600px, JPEG q=0.85,
  // EXIF orientation baked in). If this browser cannot decode the file, the
  // original is uploaded rather than losing the photo; identify-product then
  // falls back to the cover alone if the photos are too large (413).
  let uploadBlob: Blob;
  try {
    uploadBlob = await resizeImageForUpload(blob);
  } catch (err) {
    console.warn('[ProductImageService] Could not resize photo; uploading original:', err);
    uploadBlob = blob;
  }

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .upload(paths.raw, uploadBlob, {
      contentType: uploadBlob.type || 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });
  if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

  const { data: publicData } = supabase.storage.from(PRODUCT_PHOTOS_BUCKET).getPublicUrl(paths.raw);
  const isCover = !existing.some((img) => img.is_cover);

  const { data: inserted, error: insertError } = await supabase
    .from('product_images')
    .insert({
      id,
      product_id: productId,
      artisan_id: ownerId,
      position: slot,
      original_image_url: publicData?.publicUrl || paths.raw,
      image_processing_status: 'pending',
      is_cover: isCover,
    })
    .select(IMAGE_COLUMNS)
    .single();

  if (insertError || !inserted) {
    await supabase.storage.from(PRODUCT_PHOTOS_BUCKET).remove([paths.raw]);
    if (insertError?.message?.includes('limit exceeded')) throw new ProductImageLimitError();
    throw new Error(`Could not save photo: ${insertError?.message ?? 'no row returned'}`);
  }

  if (isCover) await syncCoverToProduct(productId);
  return inserted as ProductImage;
}

/**
 * Makes `imageId` the only cover of `productId`. Clears the old cover first
 * (the partial unique index allows at most one), restoring it if the new
 * cover cannot be set.
 */
export async function setCoverImage(productId: string, imageId: string): Promise<void> {
  const images = await listProductImages(productId);
  const target = images.find((img) => img.id === imageId);
  if (!target) throw new Error('Photo not found.');
  if (target.is_cover) return;
  const previousCover = images.find((img) => img.is_cover) ?? null;

  if (previousCover) {
    const { error: unsetError } = await supabase
      .from('product_images')
      .update({ is_cover: false })
      .eq('id', previousCover.id);
    if (unsetError) throw new Error(`Could not change cover: ${unsetError.message}`);
  }

  const { error: setError } = await supabase
    .from('product_images')
    .update({ is_cover: true })
    .eq('id', imageId);

  if (setError) {
    if (previousCover) {
      const { error: restoreError } = await supabase
        .from('product_images')
        .update({ is_cover: true })
        .eq('id', previousCover.id);
      if (restoreError) {
        console.error('[ProductImageService] Could not restore previous cover:', restoreError.message);
      }
    }
    throw new Error(`Could not change cover: ${setError.message}`);
  }

  await syncCoverToProduct(productId);
}

export interface DeleteProductImageResult {
  /** Id of the photo that became cover, if the deleted one was the cover. */
  newCoverId: string | null;
  /** Set when the row was deleted but its storage files could not be removed. */
  storageError?: string;
}

/**
 * Deletes a photo row and its raw/enhanced files. If it was the cover, the
 * next photo (slot order) becomes cover. Throws if the row cannot be deleted.
 */
export async function deleteProductImage(image: ProductImage): Promise<DeleteProductImageResult> {
  const images = await listProductImages(image.product_id);
  const current = images.find((img) => img.id === image.id) ?? image;

  const { error: deleteError } = await supabase.from('product_images').delete().eq('id', image.id);
  if (deleteError) throw new Error(`Could not delete photo: ${deleteError.message}`);

  const paths = productImageStoragePaths(current);
  const { error: removeError } = await removeStorageFiles([paths.raw, paths.enhanced]);

  let newCoverId: string | null = null;
  if (current.is_cover) {
    const next = pickNextCover(images, image.id);
    if (next) {
      const { error: coverError } = await supabase
        .from('product_images')
        .update({ is_cover: true })
        .eq('id', next.id);
      if (coverError) {
        console.error('[ProductImageService] Could not reassign cover after delete:', coverError.message);
      } else {
        newCoverId = next.id;
      }
    }
  }

  await syncCoverToProduct(image.product_id);
  return { newCoverId, storageError: removeError };
}

/** Persists the artisan's original/enhanced choice for one photo and re-syncs the cover. */
export async function setImageFinalChoice(imageId: string, choice: FinalImageChoice): Promise<void> {
  const { data, error } = await supabase
    .from('product_images')
    .update({ final_image_choice: choice })
    .eq('id', imageId)
    .select('product_id')
    .single();

  if (error || !data) throw new Error(`Could not save choice: ${error?.message ?? 'photo not found'}`);
  await syncCoverToProduct((data as { product_id: string }).product_id);
}

/** Status transition for one photo, followed by a cover sync. Used by processProductImageById. */
export async function updateProductImageFields(
  imageId: string,
  productId: string,
  fields: { image_processing_status: ImageProcessingStatus; enhanced_image_url?: string }
): Promise<{ error?: string }> {
  const { error } = await supabase.from('product_images').update(fields).eq('id', imageId);
  await syncCoverToProduct(productId);
  return { error: error?.message };
}

/** Storage paths (raw + enhanced) of every photo of a product, read before a draft is deleted. */
export async function collectProductImageStoragePaths(productId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select('id, product_id, artisan_id')
    .eq('product_id', productId);

  if (error) throw new Error(`Could not list photos for cleanup: ${error.message}`);
  return ((data ?? []) as Pick<ProductImage, 'id' | 'product_id' | 'artisan_id'>[]).flatMap((img) => {
    const paths = productImageStoragePaths(img);
    return [paths.raw, paths.enhanced];
  });
}

/** Removes storage objects; logs and returns the error instead of throwing. */
export async function removeStorageFiles(paths: string[]): Promise<{ error?: string }> {
  if (paths.length === 0) return {};
  try {
    const { error } = await supabase.storage.from(PRODUCT_PHOTOS_BUCKET).remove(paths);
    if (error) throw new Error(error.message);
    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ProductImageService] Storage cleanup failed:', paths, message);
    return { error: message };
  }
}
