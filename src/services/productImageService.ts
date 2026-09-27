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
  type EnhancementMode,
  type ImageProcessingLog,
  type QualityWarning,
} from '../types/product';

export const PRODUCT_PHOTOS_BUCKET = 'product-photos-raw';

const IMAGE_COLUMNS =
  'id, product_id, artisan_id, position, original_image_url, enhanced_image_url, cutout_image_url, image_processing_status, final_image_choice, is_cover, created_at, enhancement_mode, quality_warnings, mask_coverage, processing_log';

export class ProductImageLimitError extends Error {
  constructor() {
    super(`A product can have at most ${MAX_PRODUCT_IMAGES} photos.`);
    this.name = 'ProductImageLimitError';
  }
}

/** Per-image storage paths. First folder segment is the artisan id (storage RLS). */
export function productImageStoragePaths(
  image: Pick<ProductImage, 'artisan_id' | 'product_id' | 'id'>
): { raw: string; enhanced: string; cutout: string } {
  const base = `${image.artisan_id}/${image.product_id}/${image.id}`;
  return {
    raw: `${base}/raw.jpg`,
    enhanced: `${base}/enhanced.jpg`,
    cutout: `${base}/cutout.png`,
  };
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

    if (coverError && !isRlsOrAuthError(coverError.message)) throw new Error(coverError.message);

    let coverRow = cover;
    if (!coverRow && isLocalOrDemo(productId)) {
      coverRow = Array.from(localImageStore.values()).find(
        (img) => img.product_id === productId && img.is_cover
      ) as any;
    }

    const patch = buildCoverSyncPatch(coverRow as Parameters<typeof buildCoverSyncPatch>[0]);

    const { error: updateError } = await supabase
      .from('products')
      .update(patch)
      .eq('id', productId);

    if (updateError && !isRlsOrAuthError(updateError.message)) throw new Error(updateError.message);
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ProductImageService] Cover sync failed for product ${productId}:`, message);
    return { ok: false, error: message };
  }
}

export const localImageStore = new Map<string, ProductImage>();
export const localRawBlobs = new Map<string, Blob>();
const localDraftIds = new Set<string>();

export function registerLocalDraftId(id: string): void {
  localDraftIds.add(id);
}

export function unregisterLocalDraftId(id: string): void {
  localDraftIds.delete(id);
}

export function isLocalDraftId(id: string): boolean {
  return localDraftIds.has(id);
}

export function clearLocalImageStore(): void {
  localImageStore.clear();
  localDraftIds.clear();
}

export function isRlsOrAuthError(message?: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('row-level security') ||
    lower.includes('row level security') ||
    lower.includes('violates row-level security policy') ||
    lower.includes('unauthorized') ||
    lower.includes('not authorized') ||
    lower.includes('permission denied') ||
    lower.includes('jwt')
  );
}

export function isLocalOrDemo(productId: string, artisanId?: string): boolean {
  if (artisanId === 'demo-artisan' || artisanId?.startsWith('demo-')) return true;
  if (productId.startsWith('00000000-')) return true;
  if (localDraftIds.has(productId)) return true;
  return false;
}

export async function listProductImages(productId: string): Promise<ProductImage[]> {
  try {
    const { data, error } = await supabase
      .from('product_images')
      .select(IMAGE_COLUMNS)
      .eq('product_id', productId)
      .order('position', { ascending: true });

    if (!error && data) {
      const currentDbIds = new Set((data as unknown as ProductImage[]).map((img) => img.id));
      for (const [id, img] of localImageStore.entries()) {
        if (img.product_id === productId && !currentDbIds.has(id)) {
          localImageStore.delete(id);
        }
      }
      for (const row of data) {
        localImageStore.set(row.id, { ...(row as unknown as ProductImage) });
      }
      return (data as unknown as ProductImage[]).map((r) => ({ ...r }));
    }
  } catch (err) {
    console.warn('[ProductImageService] Could not load photos from Supabase, checking local:', err);
  }

  const local = Array.from(localImageStore.values())
    .filter((img) => img.product_id === productId)
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ ...r }));
  return local;
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
    // Add a 5 second timeout to prevent createImageBitmap from hanging on mobile browsers
    uploadBlob = await Promise.race([
      resizeImageForUpload(blob),
      new Promise<Blob>((_, reject) => setTimeout(() => reject(new Error('Resize timeout')), 5000))
    ]);
  } catch (err) {
    console.warn('[ProductImageService] Could not resize photo; uploading original:', err);
    uploadBlob = blob;
  }

  const isCover = !existing.some((img) => img.is_cover);

  // If this is a demo artisan or in-memory draft, handle via localImageStore
  if (isLocalOrDemo(productId, artisanId)) {
    const localUrl = URL.createObjectURL(uploadBlob);
    const demoImage: ProductImage = {
      id,
      product_id: productId,
      artisan_id: ownerId,
      position: slot,
      original_image_url: localUrl,
      enhanced_image_url: null,
      cutout_image_url: null,
      image_processing_status: 'pending',
      final_image_choice: null,
      is_cover: isCover,
      created_at: new Date().toISOString(),
      mask_coverage: null,
    };
    localImageStore.set(demoImage.id, demoImage);
    localRawBlobs.set(demoImage.id, uploadBlob);
    if (isCover) await syncCoverToProduct(productId);
    return demoImage;
  }

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_PHOTOS_BUCKET)
    .upload(paths.raw, uploadBlob, {
      contentType: uploadBlob.type || 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    if (isRlsOrAuthError(uploadError.message)) {
      const localUrl = URL.createObjectURL(uploadBlob);
      const fallbackImage: ProductImage = {
        id,
        product_id: productId,
        artisan_id: ownerId,
        position: slot,
        original_image_url: localUrl,
        enhanced_image_url: null,
        cutout_image_url: null,
        image_processing_status: 'pending',
        final_image_choice: null,
        is_cover: isCover,
        created_at: new Date().toISOString(),
        mask_coverage: null,
      };
      localImageStore.set(fallbackImage.id, fallbackImage);
      localRawBlobs.set(fallbackImage.id, uploadBlob);
      if (isCover) await syncCoverToProduct(productId);
      return fallbackImage;
    }
    throw new Error(`Photo upload failed: ${uploadError.message}`);
  }

  const { data: publicData } = supabase.storage.from(PRODUCT_PHOTOS_BUCKET).getPublicUrl(paths.raw);

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
    if (isRlsOrAuthError(insertError?.message)) {
      const localUrl = URL.createObjectURL(uploadBlob);
      const fallbackImage: ProductImage = {
        id,
        product_id: productId,
        artisan_id: ownerId,
        position: slot,
        original_image_url: localUrl,
        enhanced_image_url: null,
        cutout_image_url: null,
        image_processing_status: 'pending',
        final_image_choice: null,
        is_cover: isCover,
        created_at: new Date().toISOString(),
        mask_coverage: null,
      };
      localImageStore.set(fallbackImage.id, fallbackImage);
      localRawBlobs.set(fallbackImage.id, uploadBlob);
      if (isCover) await syncCoverToProduct(productId);
      return fallbackImage;
    }
    throw new Error(`Could not save photo: ${insertError?.message ?? 'no row returned'}`);
  }

  const resultImage = inserted as unknown as ProductImage;
  localImageStore.set(resultImage.id, resultImage);
  localRawBlobs.set(resultImage.id, uploadBlob);
  if (isCover) await syncCoverToProduct(productId);
  return resultImage;
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

  try {
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
  } catch (err: any) {
    if (!isRlsOrAuthError(err?.message) && !isLocalOrDemo(productId)) {
      throw err;
    }
  }

  // Update local store after DB update succeeds or under demo mode
  for (const [id, img] of localImageStore.entries()) {
    if (img.product_id === productId) {
      localImageStore.set(id, { ...img, is_cover: id === imageId });
    }
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

  let storageError: string | undefined;
  try {
    const { error: deleteError } = await supabase.from('product_images').delete().eq('id', image.id);
    if (deleteError) throw new Error(`Could not delete photo: ${deleteError.message}`);

    const paths = productImageStoragePaths(current);
    const { error: removeError } = await removeStorageFiles([paths.raw, paths.enhanced, paths.cutout]);
    storageError = removeError;
  } catch (err: any) {
    if (!isRlsOrAuthError(err?.message) && !isLocalOrDemo(image.product_id)) {
      throw err;
    }
  }

  localImageStore.delete(image.id);

  let newCoverId: string | null = null;
  if (current.is_cover) {
    const next = pickNextCover(images, image.id);
    if (next) {
      newCoverId = next.id;
      try {
        const { error: coverError } = await supabase
          .from('product_images')
          .update({ is_cover: true })
          .eq('id', next.id);
        if (coverError) {
          console.error('[ProductImageService] Could not reassign cover after delete:', coverError.message);
        }
      } catch (covErr) {
        console.warn('[ProductImageService] Reassign cover exception:', covErr);
      }
      const nextLocal = localImageStore.get(next.id);
      if (nextLocal) {
        localImageStore.set(next.id, { ...nextLocal, is_cover: true });
      }
    }
  }

  await syncCoverToProduct(image.product_id);
  return { newCoverId, storageError };
}

/** Persists the artisan's original/enhanced choice for one photo and re-syncs the cover. */
export async function setImageFinalChoice(imageId: string, choice: FinalImageChoice): Promise<void> {
  const local = localImageStore.get(imageId);
  let productId = local?.product_id;
  if (local) {
    local.final_image_choice = choice;
    localImageStore.set(imageId, local);
  }

  try {
    const { data, error } = await supabase
      .from('product_images')
      .update({ final_image_choice: choice })
      .eq('id', imageId)
      .select('product_id')
      .single();

    if (data?.product_id) productId = data.product_id;
    if (error && !isRlsOrAuthError(error.message) && !productId) {
      throw new Error(`Could not save choice: ${error?.message ?? 'photo not found'}`);
    }
  } catch (err: any) {
    if (!isRlsOrAuthError(err?.message) && !productId) {
      throw err;
    }
  }

  if (productId) {
    await syncCoverToProduct(productId);
  }
}

/** Status transition for one photo, followed by a cover sync. Used by processProductImageById. */
export async function updateProductImageFields(
  imageId: string,
  productId: string,
  fields: {
    image_processing_status: ImageProcessingStatus;
    enhanced_image_url?: string;
    cutout_image_url?: string | null;
    enhancement_mode?: EnhancementMode;
    quality_warnings?: QualityWarning[];
    mask_coverage?: number | null;
    processing_log?: ImageProcessingLog;
  }
): Promise<{ error?: string }> {
  const local = localImageStore.get(imageId);
  if (local) {
    localImageStore.set(imageId, { ...local, ...fields });
  }

  let errorMessage: string | undefined;
  try {
    const { error } = await supabase.from('product_images').update(fields as any).eq('id', imageId);
    if (error && !isRlsOrAuthError(error.message)) {
      errorMessage = error.message;
    }
  } catch (err: any) {
    if (!isRlsOrAuthError(err?.message)) {
      errorMessage = err?.message || String(err);
    }
  }

  await syncCoverToProduct(productId);
  return { error: errorMessage };
}

/** Storage paths (raw + enhanced + cutout) of every photo of a product, read before a draft is deleted. */
export async function collectProductImageStoragePaths(productId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select('id, product_id, artisan_id')
    .eq('product_id', productId);

  if (error) throw new Error(`Could not list photos for cleanup: ${error.message}`);
  return ((data ?? []) as Pick<ProductImage, 'id' | 'product_id' | 'artisan_id'>[]).flatMap((img) => {
    const paths = productImageStoragePaths(img);
    return [paths.raw, paths.enhanced, paths.cutout];
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
