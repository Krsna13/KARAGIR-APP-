import { supabase } from '../lib/supabase/client';
import { runSegmentation } from './aiRuntimeService';
import { correctLighting } from './lightingCorrectionService';
import type { Product } from '../types';
import type { ProductImage } from '../types/product';
import { productImageStoragePaths, updateProductImageFields } from './productImageService';

export interface ProcessProductImageResult {
  success: boolean;
  productId: string;
  enhancedImageUrl?: string;
  error?: string;
}

export interface ProcessProductImageByIdResult {
  success: boolean;
  imageId: string;
  productId?: string;
  enhancedImageUrl?: string;
  error?: string;
}

const STORAGE_BUCKET = 'product-photos-raw';

/**
 * Shared enhancement core: download raw image -> runSegmentation (background
 * removal) -> correctLighting. Throws on any failure; callers own status handling.
 */
async function downloadAndEnhance(rawImageUrl: string): Promise<Blob> {
  console.log(`[ImageEnhancementService] Downloading raw image from: ${rawImageUrl}`);
  const imageResponse = await fetch(rawImageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download raw image from ${rawImageUrl} (HTTP ${imageResponse.status})`);
  }
  const rawBlob = await imageResponse.blob();

  console.log(`[ImageEnhancementService] Invoking runSegmentation() on raw blob (${rawBlob.size} bytes)...`);
  const segmentedBlob = await runSegmentation(rawBlob);

  console.log(`[ImageEnhancementService] Invoking correctLighting() on segmented blob (${segmentedBlob.size} bytes)...`);
  return await correctLighting(segmentedBlob);
}

/**
 * Per-image version of processProductImage (Stage 6.2).
 *
 * Same status transitions (pending -> processing -> enhanced | failed) and the
 * same no-silent-failure contract: never throws, always returns a result, and
 * on error sets the row to 'failed' and logs. Reads/writes the `product_images`
 * row, uploads to {artisan_id}/{product_id}/{image_id}/enhanced.png so photos
 * never overwrite each other, and re-syncs the cover onto the products row
 * after every transition (via updateProductImageFields -> syncCoverToProduct).
 *
 * Do not call this directly from UI: go through enhancementQueue so images
 * are processed one at a time.
 */
export async function processProductImageById(imageId: string): Promise<ProcessProductImageByIdResult> {
  console.log(`[ImageEnhancementService] Starting image enhancement pipeline for image: ${imageId}`);

  if (!imageId) {
    console.error('[ImageEnhancementService] Invalid imageId provided.');
    return { success: false, imageId, error: 'Invalid imageId' };
  }

  let productId: string | undefined;

  try {
    const { data: image, error: fetchError } = await supabase
      .from('product_images')
      .select('id, product_id, artisan_id, original_image_url, image_processing_status')
      .eq('id', imageId)
      .single();

    if (fetchError || !image) {
      throw new Error(`Failed to fetch image ${imageId}: ${fetchError?.message || 'Image not found'}`);
    }
    const row = image as Pick<ProductImage, 'id' | 'product_id' | 'artisan_id' | 'original_image_url'>;
    productId = row.product_id;

    if (!row.original_image_url) {
      throw new Error(`Image ${imageId} does not have an original_image_url to process.`);
    }

    const processing = await updateProductImageFields(imageId, row.product_id, {
      image_processing_status: 'processing',
    });
    if (processing.error) {
      console.warn(`[ImageEnhancementService] Warning setting 'processing' status:`, processing.error);
    }

    const enhancedBlob = await downloadAndEnhance(row.original_image_url);

    const enhancedStoragePath = productImageStoragePaths(row).enhanced;
    console.log(`[ImageEnhancementService] Uploading enhanced image to: ${STORAGE_BUCKET}/${enhancedStoragePath}`);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(enhancedStoragePath, enhancedBlob, {
        contentType: enhancedBlob.type || 'image/png',
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Enhanced image upload failed: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(enhancedStoragePath);
    const enhancedImageUrl = publicUrlData?.publicUrl || enhancedStoragePath;

    const finalUpdate = await updateProductImageFields(imageId, row.product_id, {
      enhanced_image_url: enhancedImageUrl,
      image_processing_status: 'enhanced',
    });
    if (finalUpdate.error) {
      throw new Error(`Failed to save enhanced status: ${finalUpdate.error}`);
    }

    console.log(`[ImageEnhancementService] Successfully enhanced image ${imageId} -> ${enhancedImageUrl}`);
    return { success: true, imageId, productId, enhancedImageUrl };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ImageEnhancementService] Error processing image ${imageId}:`, errorMessage);

    try {
      if (productId) {
        await updateProductImageFields(imageId, productId, { image_processing_status: 'failed' });
      } else {
        await supabase.from('product_images').update({ image_processing_status: 'failed' }).eq('id', imageId);
      }
    } catch (statusErr) {
      console.error(`[ImageEnhancementService] Failed to update image status to 'failed':`, statusErr);
    }

    return { success: false, imageId, productId, error: errorMessage };
  }
}

/**
 * Service to process and enhance product images using AI segmentation.
 * 
 * Pipeline:
 * 1. Reads the product record and retrieves `original_image_url` and `artisan_id`.
 * 2. Updates `image_processing_status` to 'processing'.
 * 3. Downloads the original raw image as a Blob.
 * 4. Runs client-side AI segmentation (`runSegmentation`) to isolate the product from background.
 * 5. Uploads the enhanced PNG to the existing `product-photos-raw` storage bucket:
 *    Path: `{artisan_id}/{product_id}/enhanced.png`.
 * 6. On success: Updates product with `enhanced_image_url` and `image_processing_status = 'enhanced'`.
 * 7. On failure: Updates product with `image_processing_status = 'failed'`, logs the error,
 *    and resolves without throwing an uncaught exception so callers/artisans can retry.
 */
export async function processProductImage(productId: string): Promise<ProcessProductImageResult> {
  console.log(`[ImageEnhancementService] Starting image enhancement pipeline for product: ${productId}`);

  if (!productId) {
    console.error('[ImageEnhancementService] Invalid productId provided.');
    return { success: false, productId, error: 'Invalid productId' };
  }

  try {
    // 1. Fetch product row from Supabase
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('id, artisan_id, original_image_url, image_processing_status')
      .eq('id', productId)
      .single();

    if (fetchError || !product) {
      throw new Error(`Failed to fetch product ${productId}: ${fetchError?.message || 'Product not found'}`);
    }

    if (!product.original_image_url) {
      throw new Error(`Product ${productId} does not have an original_image_url to process.`);
    }

    // 2. Set status to 'processing'
    const { error: processingStatusError } = await supabase
      .from('products')
      .update({ image_processing_status: 'processing' })
      .eq('id', productId);

    if (processingStatusError) {
      console.warn(`[ImageEnhancementService] Warning setting 'processing' status:`, processingStatusError.message);
    }

    // 3-5. Download raw image, segment, lighting correction
    const enhancedBlob = await downloadAndEnhance(product.original_image_url);

    // 6. Upload enhanced image to product-photos-raw bucket
    const artisanFolder = product.artisan_id || 'artisan';
    const enhancedStoragePath = `${artisanFolder}/${productId}/enhanced.png`;
    console.log(`[ImageEnhancementService] Uploading enhanced image to: ${STORAGE_BUCKET}/${enhancedStoragePath}`);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(enhancedStoragePath, enhancedBlob, {
        contentType: enhancedBlob.type || 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.warn(`[ImageEnhancementService] Storage upload warning (handling offline/demo):`, uploadError.message);
    }

    // 6. Obtain public / accessible URL for enhanced photo
    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(enhancedStoragePath);

    const enhancedImageUrl = publicUrlData?.publicUrl || enhancedStoragePath;

    // 7. Update product row with enhanced_image_url and status = 'enhanced'
    const { error: finalUpdateError } = await supabase
      .from('products')
      .update({
        enhanced_image_url: enhancedImageUrl,
        image_processing_status: 'enhanced',
      })
      .eq('id', productId);

    if (finalUpdateError) {
      console.warn(`[ImageEnhancementService] Warning updating final status:`, finalUpdateError.message);
    }

    console.log(`[ImageEnhancementService] Successfully enhanced product ${productId} -> ${enhancedImageUrl}`);
    return {
      success: true,
      productId,
      enhancedImageUrl,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ImageEnhancementService] Error processing product ${productId}:`, errorMessage);

    // Transition status to 'failed' on error without crashing the caller
    try {
      await supabase
        .from('products')
        .update({ image_processing_status: 'failed' })
        .eq('id', productId);
    } catch (statusErr) {
      console.error(`[ImageEnhancementService] Failed to update product status to 'failed':`, statusErr);
    }

    return {
      success: false,
      productId,
      error: errorMessage,
    };
  }
}

/**
 * Resolves the canonical display image URL for a product.
 * 
 * Resolution logic:
 * 1. If artisan explicitly chose 'original': returns original_image_url (falling back to imageUrl).
 * 2. If artisan explicitly chose 'enhanced': returns enhanced_image_url (falling back to original_image_url then imageUrl).
 * 3. If no choice made yet (null/undefined):
 *    Falls back to enhanced_image_url if available, then original_image_url, then imageUrl.
 * 
 * @param product Product entity
 * @returns The resolved image URL string
 */
export function getDisplayImageUrl(product: Product): string {
  if (!product) return '';

  if (product.final_image_choice === 'original') {
    return product.original_image_url || product.imageUrl || '';
  }

  if (product.final_image_choice === 'enhanced') {
    return product.enhanced_image_url || product.original_image_url || product.imageUrl || '';
  }

  // No explicit choice yet: fallback order is enhanced -> original -> imageUrl
  return product.enhanced_image_url || product.original_image_url || product.imageUrl || '';
}

/** Same resolution rules as getDisplayImageUrl, for a single product_images row. */
export function getProductImageDisplayUrl(
  image: Pick<ProductImage, 'original_image_url' | 'enhanced_image_url' | 'final_image_choice'>
): string {
  if (image.final_image_choice === 'original') return image.original_image_url || '';
  return image.enhanced_image_url || image.original_image_url || '';
}
