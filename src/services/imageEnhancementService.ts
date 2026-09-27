/**
 * HARD RULE: Never use generative image editing on the product. Product pixels
 * come only from the original photo. Only background, framing, lighting,
 * contrast, noise, and sharpness may change.
 */

import { supabase } from '../lib/supabase/client';
import { runSegmentation } from './aiRuntimeService';
import { correctLighting } from './lightingCorrectionService';
import {
  checkBlobPhotoQuality,
  checkBlobCutout,
  defaultDecodeBlobToPixels,
  type QualityWarning,
  type EnhancementMode,
  type PhotoQualityMetrics,
  type CutoutCheckResult,
  type PixelBuffer,
} from './photoQualityService';
import ImageWorker from '../workers/imageEnhancementWorker?worker';
import type { WorkerRequest, WorkerResponse } from '../workers/imageEnhancementWorker';
import {
  PHOTO_BACKGROUND_COLORS,
  type PhotoBackground,
  type ImageProcessingLog,
} from '../types/imageEnhancement';
import { compositeStudioImage, encodePixelsToPngBlob } from './studioCompositor';
import type { Product } from '../types';
import type { ProductImage } from '../types/product';
import { productImageStoragePaths, updateProductImageFields, localImageStore, localRawBlobs, isRlsOrAuthError, isLocalOrDemo } from './productImageService';

export type { QualityWarning, EnhancementMode, ImageProcessingLog, PhotoBackground };

export interface ProcessProductImageResult {
  success: boolean;
  productId: string;
  enhancedImageUrl?: string;
  enhancement_mode?: EnhancementMode;
  quality_warnings?: QualityWarning[];
  processing_log?: ImageProcessingLog;
  error?: string;
}

export interface ProcessProductImageByIdResult {
  success: boolean;
  imageId: string;
  productId?: string;
  enhancedImageUrl?: string;
  cutoutImageUrl?: string | null;
  enhancement_mode?: EnhancementMode;
  quality_warnings?: QualityWarning[];
  mask_coverage?: number;
  processing_log?: ImageProcessingLog;
  error?: string;
}

const STORAGE_BUCKET = 'product-photos-raw';

export interface EnhancementExecutionResult {
  enhancedBlob: Blob;
  cutoutBlob: Blob | null;
  enhancement_mode: EnhancementMode;
  quality_warnings: QualityWarning[];
  mask_coverage: number;
  processing_log: ImageProcessingLog;
}

let sharedEnhancementWorker: Worker | null = null;
function getEnhancementWorker(): Worker {
  if (!sharedEnhancementWorker) {
    sharedEnhancementWorker = new ImageWorker();
  }
  return sharedEnhancementWorker;
}

/**
 * Shared enhancement core:
 * 1. Download raw image.
 * 2. Classical quality check (blur, exposure, noise, resolution).
 * 3. Deep-learning segmentation (runSegmentation).
 * 4. Cutout check: if coverage < 3% or > 95% or touches >= 3 edges -> light_only (enhancement on full raw photo, no cutout).
 *    Otherwise -> studio mode (segmented cutout).
 * 5. OpenCV.js Enhancement (lazy-loaded):
 *    - Denoise (Bilateral filter on high noise)
 *    - Mask refinement (Morphology & connected components & alpha feathering)
 *    - LAB Color Space (Gray-world white balance, CLAHE on L channel, adaptive gamma)
 *    - Sharpening (Gentle unsharp mask on mildly soft photos)
 *    - Perspective correction for flat items
 *    - Studio composition (1200x1200, 8% padding, contact shadow, JPEG 0.9)
 * 6. Graceful fallback: If OpenCV fails to load or error occurs, fall back to correctLighting().
 */
async function downloadAndEnhance(
  rawImageUrl: string | Blob,
  options?: { shape_profile?: string | null; photo_background?: PhotoBackground | null }
): Promise<EnhancementExecutionResult> {
  let rawBlob: Blob;
  if (rawImageUrl instanceof Blob) {
    console.log(`[ImageEnhancementService] Using provided raw blob (${rawImageUrl.size} bytes)`);
    rawBlob = rawImageUrl;
  } else {
    console.log(`[ImageEnhancementService] Downloading raw image from: ${rawImageUrl}`);
    const imageResponse = await fetch(rawImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download raw image from ${rawImageUrl} (HTTP ${imageResponse.status})`);
    }
    rawBlob = await imageResponse.blob();
  }

  // 1. Classical image processing quality checks
  let quality: PhotoQualityMetrics | null = null;
  let quality_warnings: QualityWarning[] = [];
  try {
    quality = await checkBlobPhotoQuality(rawBlob);
    quality_warnings = quality.quality_warnings;
  } catch (qErr) {
    console.warn(`[ImageEnhancementService] Photo quality check warning (non-blocking):`, qErr);
  }

  // 2. Deep-learning segmentation (isolate product from background)
  console.log(`[ImageEnhancementService] Invoking runSegmentation() on raw blob (${rawBlob.size} bytes)...`);
  let segmentedBlob: Blob | null = null;
  try {
    segmentedBlob = await Promise.race([
      runSegmentation(rawBlob),
      new Promise<Blob>((_, reject) => setTimeout(() => reject(new Error('runSegmentation timeout after 25s')), 25000))
    ]);
  } catch (segErr) {
    console.warn(`[ImageEnhancementService] Segmentation failed or timed out. Falling back to original image:`, segErr);
  }

  // 3. Post-segmentation cutout check
  let enhancement_mode: EnhancementMode = 'studio';
  let cutout: CutoutCheckResult | null = null;
  if (segmentedBlob) {
    try {
      cutout = await checkBlobCutout(segmentedBlob);
      enhancement_mode = cutout.enhancement_mode;
      if (!cutout.accepted) {
        console.warn(`[ImageEnhancementService] Cutout rejected (${cutout.reasons.join(', ')}). Falling back to light_only mode.`);
      }
    } catch (cErr) {
      console.warn(`[ImageEnhancementService] Cutout check warning (non-blocking fallback):`, cErr);
    }
  } else {
    enhancement_mode = 'light_only';
  }

  // 'original' photo_background means light_only enhancement of the full photo without cutout
  if (options?.photo_background === 'original') {
    enhancement_mode = 'light_only';
  }

  const activeBlob = segmentedBlob && enhancement_mode === 'studio' ? segmentedBlob : rawBlob;
  const bgColor =
    options?.photo_background && options.photo_background !== 'original'
      ? PHOTO_BACKGROUND_COLORS[options.photo_background]
      : undefined;

  // 4. Attempt OpenCV.js pipeline
  try {
    console.log(`[ImageEnhancementService] Running OpenCV.js enhancement pipeline via Web Worker (mode: ${enhancement_mode})...`);
    const pixels = await defaultDecodeBlobToPixels(activeBlob);
    const worker = getEnhancementWorker();

    const openCvResult = await new Promise<{ outputPixels: PixelBuffer, log: ImageProcessingLog }>((resolve, reject) => {
      const msgId = Math.random().toString(36).substring(2, 9);

      const handler = (event: MessageEvent<WorkerResponse>) => {
        const resp = event.data;
        if (resp.id === msgId && resp.type === 'ENHANCE_IMAGE_RESULT') {
          worker.removeEventListener('message', handler);
          if (resp.success) {
            resolve({
              outputPixels: {
                data: resp.payload.outputPixelData,
                width: resp.payload.width,
                height: resp.payload.height
              },
              log: resp.payload.log
            });
          } else {
            reject(new Error(resp.error));
          }
        }
      };

      worker.addEventListener('message', handler);

      // Timeout for worker initialization or crash
      setTimeout(() => {
        worker.removeEventListener('message', handler);
        reject(new Error('Worker timeout after 30s'));
      }, 30000);

      const request: WorkerRequest = {
        id: msgId,
        type: 'ENHANCE_IMAGE',
        payload: {
          pixelData: pixels.data,
          width: pixels.width,
          height: pixels.height,
          enhancement_mode,
          noiseEstimate: quality?.noiseEstimate ?? 0,
          initialBlurScore: quality?.blurScore ?? 0,
          shape_profile: options?.shape_profile,
          quality_warnings,
        }
      };

      // Transfer the underlying ArrayBuffer to the worker to avoid costly memory copying
      worker.postMessage(request, [pixels.data.buffer]);
    });

    let cutoutBlob: Blob | null = null;
    if (enhancement_mode === 'studio' && segmentedBlob) {
      cutoutBlob = await encodePixelsToPngBlob(openCvResult.outputPixels);
    }

      console.log(`[ImageEnhancementService] Running studio composition (mode: ${enhancement_mode}, bg: ${bgColor ?? 'default'})...`);
      const compositedBlob = await compositeStudioImage({
        pixels: openCvResult.outputPixels,
        enhancement_mode,
        backgroundColor: bgColor,
      });

      return {
        enhancedBlob: compositedBlob,
        cutoutBlob,
        enhancement_mode,
        quality_warnings,
        mask_coverage: openCvResult.log.measurements.maskCoverageAfter ?? (cutout?.coverage ?? 0),
        processing_log: openCvResult.log,
      };
    // Note: If worker crashes, catch block handles fallback
  } catch (cvErr) {
    console.warn(`[ImageEnhancementService] OpenCV processing error in Web Worker, falling back to correctLighting():`, cvErr);
  }

  // 5. Graceful fallback: classical canvas correctLighting
  console.log(`[ImageEnhancementService] Invoking fallback correctLighting() on ${enhancement_mode === 'studio' ? 'segmented' : 'original'} blob (${activeBlob.size} bytes)...`);
  const enhancedBlob = await correctLighting(activeBlob);

  const fallbackLog: ImageProcessingLog = {
    timestamp: new Date().toISOString(),
    enhancement_mode,
    operations: ['fallback_correct_lighting'],
    measurements: {
      noiseEstimate: quality?.noiseEstimate ?? 0,
      sharpnessBefore: quality?.blurScore ?? 0,
      sharpnessAfter: quality?.blurScore ?? 0,
      meanLightnessBefore: quality?.meanLuminance ?? 0,
      meanLightnessAfter: quality?.meanLuminance ?? 0,
      maskCoverageBefore: cutout?.coverage ?? 0,
      maskCoverageAfter: cutout?.coverage ?? 0,
      perspectiveCorrectionApplied: false,
    },
    opencvUsed: false,
    fallbackUsed: true,
    quality_warnings,
  };

  return {
    enhancedBlob,
    cutoutBlob: enhancement_mode === 'studio' && segmentedBlob ? segmentedBlob : null,
    enhancement_mode,
    quality_warnings,
    mask_coverage: cutout?.coverage ?? 0,
    processing_log: fallbackLog,
  };
}

/**
 * Recomposites every studio image of the product from its saved cutout.png
 * WITHOUT running AI segmentation again.
 */
export interface UpdateBackgroundDeps {
  decodeBlob?: (blob: Blob) => Promise<PixelBuffer>;
  compositeCanvas?: (pixels: PixelBuffer, bgColor?: string) => Promise<Blob>;
}

export async function updateProductBackground(
  productId: string,
  background: PhotoBackground,
  deps?: UpdateBackgroundDeps
): Promise<void> {
  console.log(`[ImageEnhancementService] Changing photo_background to '${background}' for product ${productId}...`);

  // 1. Update product table
  const { error: prodError } = await supabase
    .from('products')
    .update({ photo_background: background })
    .eq('id', productId);
  if (prodError) {
    console.warn('[ImageEnhancementService] Warning updating product photo_background:', prodError.message);
  }

  // 2. Fetch all images
  const { data: images, error: fetchError } = await supabase
    .from('product_images')
    .select('id, product_id, artisan_id, original_image_url, enhanced_image_url, cutout_image_url, enhancement_mode, image_processing_status')
    .eq('product_id', productId);

  if (fetchError || !images) {
    console.error('[ImageEnhancementService] Error fetching images for background update:', fetchError);
    return;
  }

  const bgColor = background !== 'original' ? PHOTO_BACKGROUND_COLORS[background] : undefined;

  // 3. Recomposite studio images from their saved cutout.png WITHOUT segmentation
  for (const img of images) {
    if (img.image_processing_status !== 'enhanced') continue;

    const row = img as Pick<ProductImage, 'id' | 'product_id' | 'artisan_id' | 'cutout_image_url' | 'original_image_url' | 'enhancement_mode'>;
    const paths = productImageStoragePaths(row);

    try {
      if (background === 'original') {
        // Re-enhance full raw photo in light_only mode
        let rawBlob: Blob | null = null;
        const { data: storageBlob } = await supabase.storage.from(STORAGE_BUCKET).download(paths.raw);
        rawBlob = storageBlob;
        if (!rawBlob) {
          rawBlob = localRawBlobs.get(row.id) || null;
        }
        if (!rawBlob && row.original_image_url) {
          const resp = await fetch(row.original_image_url);
          if (resp.ok) rawBlob = await resp.blob();
        }
        if (!rawBlob) continue;

        const pixels = deps?.decodeBlob
          ? await deps.decodeBlob(rawBlob)
          : await defaultDecodeBlobToPixels(rawBlob);

        const compositedBlob = deps?.compositeCanvas
          ? await deps.compositeCanvas(pixels, undefined)
          : await compositeStudioImage({
              pixels,
              enhancement_mode: 'light_only',
            });

        await supabase.storage.from(STORAGE_BUCKET).upload(paths.enhanced, compositedBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

        const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(paths.enhanced);
        const enhancedImageUrl = publicData?.publicUrl || paths.enhanced;

        await updateProductImageFields(row.id, productId, {
          image_processing_status: 'enhanced',
          enhancement_mode: 'light_only',
          enhanced_image_url: enhancedImageUrl,
        });
      } else {
        // Recomposite cutout onto new studio background
        let cutoutBlob: Blob | null = null;
        const { data: storageBlob } = await supabase.storage.from(STORAGE_BUCKET).download(paths.cutout);
        cutoutBlob = storageBlob;
        if (!cutoutBlob && row.cutout_image_url) {
          const resp = await fetch(row.cutout_image_url);
          if (resp.ok) cutoutBlob = await resp.blob();
        }
        if (!cutoutBlob) continue;

        const pixels = deps?.decodeBlob
          ? await deps.decodeBlob(cutoutBlob)
          : await defaultDecodeBlobToPixels(cutoutBlob);

        const compositedBlob = deps?.compositeCanvas
          ? await deps.compositeCanvas(pixels, bgColor)
          : await compositeStudioImage({
              pixels,
              enhancement_mode: 'studio',
              backgroundColor: bgColor,
            });

        await supabase.storage.from(STORAGE_BUCKET).upload(paths.enhanced, compositedBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

        const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(paths.enhanced);
        const enhancedImageUrl = publicData?.publicUrl || paths.enhanced;

        await updateProductImageFields(row.id, productId, {
          image_processing_status: 'enhanced',
          enhancement_mode: 'studio',
          enhanced_image_url: enhancedImageUrl,
        });
      }
    } catch (reErr) {
      console.error(`[ImageEnhancementService] Failed to recomposite image ${row.id}:`, reErr);
    }
  }
}

/**
 * Per-image version of processProductImage (Stage 6.2 & 6.3b).
 *
 * Runs quality check -> segmentation -> cutout check -> refinement -> enhancement -> composition
 * -> uploads cutout.png + enhanced.jpg -> saves fields.
 *
 * Keeps sequential queue, status transitions, and no-silent-failure contract.
 */
export async function processProductImageById(imageId: string): Promise<ProcessProductImageByIdResult> {
  console.log(`[ImageEnhancementService] Starting image enhancement pipeline for image: ${imageId}`);

  if (!imageId) {
    console.error('[ImageEnhancementService] Invalid imageId provided.');
    return { success: false, imageId, error: 'Invalid imageId' };
  }

  let productId: string | undefined;

  try {
    let row: Pick<ProductImage, 'id' | 'product_id' | 'artisan_id' | 'original_image_url'> | null = null;
    try {
      const { data: image, error: fetchError } = await supabase
        .from('product_images')
        .select('id, product_id, artisan_id, original_image_url, image_processing_status')
        .eq('id', imageId)
        .single();

      if (!fetchError && image) {
        row = image as any;
      }
    } catch {
      // Offline / unauthenticated
    }

    if (!row) {
      const local = localImageStore.get(imageId);
      if (local) row = local;
    }

    if (!row) {
      throw new Error(`Failed to fetch image ${imageId}: Image not found`);
    }
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

    let shapeProfile: string | null = null;
    let photoBackground: PhotoBackground = 'white';
    try {
      const { data: prod } = await supabase
        .from('products')
        .select('shape_profile, photo_background')
        .eq('id', row.product_id)
        .maybeSingle();
      shapeProfile = (prod as any)?.shape_profile || null;
      photoBackground = (prod as any)?.photo_background || 'white';
    } catch {
      // Non-blocking
    }

    const rawBlobOrUrl = localRawBlobs.get(imageId) || row.original_image_url;
    const {
      enhancedBlob,
      cutoutBlob,
      enhancement_mode,
      quality_warnings,
      mask_coverage,
      processing_log,
    } = await downloadAndEnhance(rawBlobOrUrl, {
      shape_profile: shapeProfile,
      photo_background: photoBackground,
    });

    const paths = productImageStoragePaths(row);
    console.log(`[ImageEnhancementService] Uploading enhanced image to: ${STORAGE_BUCKET}/${paths.enhanced}`);

    let enhancedImageUrl: string | null = null;
    try {
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(paths.enhanced, enhancedBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        if (!isRlsOrAuthError(uploadError.message) && !isLocalOrDemo(row.product_id)) {
          throw new Error(`Enhanced image upload failed: ${uploadError.message}`);
        }
      } else {
        const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(paths.enhanced);
        enhancedImageUrl = publicUrlData?.publicUrl || paths.enhanced;
      }
    } catch (stErr: any) {
      if (!isRlsOrAuthError(stErr?.message) && !isLocalOrDemo(row.product_id)) {
        throw stErr;
      }
    }

    if (!enhancedImageUrl) {
      enhancedImageUrl = URL.createObjectURL(enhancedBlob);
    }

    let cutoutImageUrl: string | null = null;
    if (cutoutBlob) {
      console.log(`[ImageEnhancementService] Uploading cutout image to: ${STORAGE_BUCKET}/${paths.cutout}`);
      try {
        const { error: cutoutUploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(paths.cutout, cutoutBlob, {
            contentType: 'image/png',
            upsert: true,
          });
        if (cutoutUploadError) {
          console.warn(`[ImageEnhancementService] Warning uploading cutout PNG:`, cutoutUploadError.message);
        } else {
          const { data: cutoutUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(paths.cutout);
          cutoutImageUrl = cutoutUrlData?.publicUrl || paths.cutout;
        }
      } catch (cErr) {
        console.warn(`[ImageEnhancementService] Cutout upload exception:`, cErr);
      }

      if (!cutoutImageUrl) {
        cutoutImageUrl = URL.createObjectURL(cutoutBlob);
      }
    }

    const finalUpdate = await updateProductImageFields(imageId, row.product_id, {
      enhanced_image_url: enhancedImageUrl,
      cutout_image_url: cutoutImageUrl,
      image_processing_status: 'enhanced',
      enhancement_mode,
      quality_warnings,
      mask_coverage,
      processing_log,
    });
    if (finalUpdate.error) {
      throw new Error(`Failed to save enhanced status: ${finalUpdate.error}`);
    }

    console.log(`[ImageEnhancementService] Successfully enhanced image ${imageId} -> ${enhancedImageUrl} (mode: ${enhancement_mode})`);
    return {
      success: true,
      imageId,
      productId,
      enhancedImageUrl,
      cutoutImageUrl,
      enhancement_mode,
      quality_warnings,
      mask_coverage,
      processing_log,
    };
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
      .select('id, artisan_id, original_image_url, image_processing_status, shape_profile')
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

    // 3-5. Download raw image, segment, lighting correction / OpenCV pipeline
    const { enhancedBlob, enhancement_mode, quality_warnings, processing_log } =
      await downloadAndEnhance(product.original_image_url, {
        shape_profile: product.shape_profile,
        photo_background: (product as any).photo_background,
      });

    // 6. Upload enhanced image to product-photos-raw bucket
    const artisanFolder = product.artisan_id || 'artisan';
    const enhancedStoragePath = `${artisanFolder}/${productId}/enhanced.png`;
    console.log(`[ImageEnhancementService] Uploading enhanced image to: ${STORAGE_BUCKET}/${enhancedStoragePath}`);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(enhancedStoragePath, enhancedBlob, {
        contentType: enhancedBlob.type || 'image/jpeg',
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

    console.log(`[ImageEnhancementService] Successfully enhanced product ${productId} -> ${enhancedImageUrl} (mode: ${enhancement_mode})`);
    return {
      success: true,
      productId,
      enhancedImageUrl,
      enhancement_mode,
      quality_warnings,
      processing_log,
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
