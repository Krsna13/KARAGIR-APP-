// src/services/productIdentificationService.ts
import { supabase } from '../lib/supabase/client';
import type { ProductIdentification, IdentifiedProductCategory } from '../types';
import type { ProductAiIdentification, ProductImage } from '../types/product';
import { validateGeminiResult } from '../../supabase/functions/identify-product/validation';

export class ProductIdentificationError extends Error {
  readonly status?: number;
  readonly cause?: unknown;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = 'ProductIdentificationError';
    this.status = options?.status;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, ProductIdentificationError.prototype);
  }
}

const ALLOWED_CATEGORIES: ReadonlyArray<IdentifiedProductCategory> = [
  'Woodwork',
  'Pottery',
  'Brasscraft',
  'Textile',
  'Furniture',
  'Metal',
];

/**
 * Converts a browser/DOM Blob into a base64-encoded string.
 * Uses chunked conversion to prevent call-stack overflows on larger image files.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Calls the Supabase Edge Function 'identify-product' to analyze a product photo
 * using Gemini Vision with structured schema output.
 *
 * @param imageBlob The photo of the handcrafted product to identify
 * @returns Promise<ProductIdentification> Typed product identification details
 * @throws ProductIdentificationError on invalid input, Edge Function failure, or invalid data structure
 */
export async function identifyProduct(imageBlob: Blob): Promise<ProductIdentification> {
  if (!imageBlob || !(imageBlob instanceof Blob) || imageBlob.size === 0) {
    throw new ProductIdentificationError(
      'Invalid image: A non-empty image Blob is required for product identification.'
    );
  }

  // 1. Encode image Blob to base64
  let imageBase64: string;
  try {
    imageBase64 = await blobToBase64(imageBlob);
  } catch (encodingErr) {
    throw new ProductIdentificationError(
      'Failed to encode image data for identification.',
      { cause: encodingErr }
    );
  }

  const mimeType = imageBlob.type || 'image/jpeg';

  // 2. Invoke Supabase Edge Function proxy
  const { data, error } = await supabase.functions.invoke('identify-product', {
    body: {
      imageBase64,
      mimeType,
    },
  });

  // 3. Handle Edge Function error responses
  if (error) {
    let errorMessage = error.message || 'Product identification request failed.';
    let status: number | undefined;

    // Check for HTTP error context attached by Supabase client
    if (typeof error === 'object' && error !== null && 'context' in error) {
      const ctx = (error as { context?: { status?: number; json?: () => Promise<any> } }).context;
      if (ctx?.status) {
        status = ctx.status;
      }
      if (typeof ctx?.json === 'function') {
        try {
          const body = await ctx.json();
          if (body?.error && typeof body.error === 'string') {
            errorMessage = body.error;
          }
        } catch {
          // ignore fallback if response JSON cannot be read
        }
      }
    }

    throw new ProductIdentificationError(errorMessage, { status, cause: error });
  }

  if (!data) {
    throw new ProductIdentificationError(
      'No identification data returned from the AI identification service.'
    );
  }

  // 4. Validate output shape strictly
  const rawItemName = typeof data.item_name === 'string' ? data.item_name.trim() : '';
  if (!rawItemName) {
    throw new ProductIdentificationError(
      'Invalid identification response: missing or empty item_name.'
    );
  }

  const rawMaterial = typeof data.material === 'string' ? data.material.trim() : '';
  if (!rawMaterial) {
    throw new ProductIdentificationError(
      'Invalid identification response: missing or empty material.'
    );
  }

  const category = data.category as IdentifiedProductCategory;
  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw new ProductIdentificationError(
      `Invalid identification response: unexpected category '${data.category}'. Allowed categories: ${ALLOWED_CATEGORIES.join(', ')}.`
    );
  }

  const rawConfidence = Number(data.confidence);
  if (typeof data.confidence !== 'number' || isNaN(rawConfidence) || rawConfidence < 0 || rawConfidence > 1) {
    throw new ProductIdentificationError(
      `Invalid identification response: confidence must be a number between 0 and 1, got '${data.confidence}'.`
    );
  }

  const rawDescription = typeof data.short_description === 'string' ? data.short_description.trim() : '';
  if (!rawDescription) {
    throw new ProductIdentificationError(
      'Invalid identification response: missing or empty short_description.'
    );
  }

  return {
    item_name: rawItemName,
    material: rawMaterial,
    category,
    confidence: Number(rawConfidence.toFixed(4)),
    short_description: rawDescription,
  };
}

// ---------------------------------------------------------------------------
// Stage 6.4: Add Item wizard Identify step (multi-photo, storage URLs)
// identifyProduct() above (Snap & Discover) is intentionally unchanged.
// ---------------------------------------------------------------------------

/** identify-product accepts these speaking languages (see request.ts). */
const IDENTIFY_SPEAKING_LANGUAGES = ['hi', 'mr', 'en'];

/** At most this many photos are sent for identification. */
export const MAX_IDENTIFICATION_PHOTOS = 3;

const PHOTO_IDENTIFY_TIMEOUT_MS = 45000;

export interface IdentificationImageSelection {
  imageIds: string[];
  urls: string[];
  coverImageId: string | null;
}

/**
 * Photos to send: the cover first, then the next two by position, using the
 * ORIGINAL image URLs (JPEGs, smaller than the enhanced PNGs, with context).
 * Photos without an original URL are skipped.
 */
export function selectIdentificationImages(images: ProductImage[]): IdentificationImageSelection {
  const withUrl = images.filter((img) => Boolean(img.original_image_url));
  const cover = withUrl.find((img) => img.is_cover) ?? null;
  const others = withUrl
    .filter((img) => img.id !== cover?.id)
    .sort((a, b) => a.position - b.position);
  const chosen = (cover ? [cover, ...others] : others).slice(0, MAX_IDENTIFICATION_PHOTOS);
  return {
    imageIds: chosen.map((img) => img.id),
    urls: chosen.map((img) => img.original_image_url as string),
    coverImageId: cover?.id ?? null,
  };
}

export interface PhotoIdentificationResult {
  /** Validated (trimmed) guess used to build the questions. */
  identification: ProductAiIdentification;
  /** The Edge Function's response body exactly as received, for ai_identification. */
  raw: Record<string, unknown>;
  /** Image ids actually sent in the successful request (cover first). */
  usedImageIds: string[];
  coverImageId: string | null;
  /** True when the full request returned 413 and only the cover was sent. */
  retriedWithCoverOnly: boolean;
}

async function extractInvokeError(error: unknown): Promise<{ status?: number; message: string }> {
  let message = error instanceof Error && error.message ? error.message : 'Identification request failed.';
  let status: number | undefined;
  if (typeof error === 'object' && error !== null && 'context' in error) {
    const ctx = (error as { context?: { status?: number; json?: () => Promise<any> } }).context;
    if (ctx?.status) status = ctx.status;
    if (typeof ctx?.json === 'function') {
      try {
        const body = await ctx.json();
        if (typeof body?.error === 'string') message = body.error;
      } catch {
        // body not JSON
      }
    }
  }
  return { status, message };
}

async function invokeIdentifyUrls(
  urls: string[],
  speakingLanguage: string | undefined
): Promise<{ data: unknown } | { status?: number; message: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ProductIdentificationError('Identification timed out.', { status: 408 })),
      PHOTO_IDENTIFY_TIMEOUT_MS
    );
  });
  try {
    const body: Record<string, unknown> = { image_urls: urls };
    if (speakingLanguage) body.speakingLanguage = speakingLanguage;
    const { data, error } = await Promise.race([
      supabase.functions.invoke('identify-product', { body }),
      timeout,
    ]);
    if (error) return extractInvokeError(error);
    return { data };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Identifies a product from its saved photos via identify-product (image_urls).
 * If the function answers 413 (photos too large together), retries ONCE with
 * the cover alone. Throws ProductIdentificationError on any failure; callers
 * must fall back to manual answers and never show err.message to artisans.
 */
export async function identifyProductPhotos(
  images: ProductImage[],
  speakingLanguage?: string | null
): Promise<PhotoIdentificationResult> {
  const selection = selectIdentificationImages(images);
  if (selection.urls.length === 0) {
    throw new ProductIdentificationError('No saved photos to identify.');
  }
  const language =
    speakingLanguage && IDENTIFY_SPEAKING_LANGUAGES.includes(speakingLanguage) ? speakingLanguage : undefined;

  let usedImageIds = selection.imageIds;
  let retriedWithCoverOnly = false;
  let attempt = await invokeIdentifyUrls(selection.urls, language);

  if ('message' in attempt && attempt.status === 413 && selection.urls.length > 1) {
    retriedWithCoverOnly = true;
    usedImageIds = selection.imageIds.slice(0, 1); // cover first by construction
    attempt = await invokeIdentifyUrls(selection.urls.slice(0, 1), language);
  }

  if ('message' in attempt) {
    throw new ProductIdentificationError(attempt.message, { status: attempt.status });
  }

  const raw = attempt.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ProductIdentificationError('No identification data returned.');
  }
  const validated = validateGeminiResult(raw);
  if (!validated.ok) {
    throw new ProductIdentificationError(`Invalid identification response: ${'error' in validated ? validated.error : ''}`);
  }

  return {
    identification: validated.value as ProductAiIdentification,
    raw: raw as Record<string, unknown>,
    usedImageIds,
    coverImageId: selection.coverImageId,
    retriedWithCoverOnly,
  };
}
