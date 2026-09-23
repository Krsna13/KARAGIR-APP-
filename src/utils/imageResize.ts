// src/utils/imageResize.ts
// Stage 6.4: shrink product photos on the phone before upload.
// Keeps uploads (and identify-product's server-side fetch) well under Gemini's
// inline request limit: longest side <= 1600px, JPEG quality 0.85.

export const UPLOAD_MAX_SIDE = 1600;
export const UPLOAD_JPEG_QUALITY = 0.85;

export interface ResizedDimensions {
  width: number;
  height: number;
  /** False when the image already fits and is only re-encoded, never upscaled. */
  scaled: boolean;
}

/**
 * Target size for an image whose UPRIGHT (orientation-applied) size is
 * width x height. The longest side lands exactly on `maxSide`; the other side
 * keeps the aspect ratio (rounded, at least 1px). Images that already fit are
 * left at their size.
 */
export function computeResizedDimensions(
  width: number,
  height: number,
  maxSide: number = UPLOAD_MAX_SIDE
): ResizedDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions: ${width}x${height}`);
  }
  if (!Number.isFinite(maxSide) || maxSide <= 0) {
    throw new Error(`Invalid maxSide: ${maxSide}`);
  }

  const longest = Math.max(width, height);
  if (longest <= maxSide) {
    return { width: Math.round(width), height: Math.round(height), scaled: false };
  }

  const scale = maxSide / longest;
  return width >= height
    ? { width: maxSide, height: Math.max(1, Math.round(height * scale)), scaled: true }
    : { width: Math.max(1, Math.round(width * scale)), height: maxSide, scaled: true };
}

export interface DecodedImage {
  /** Upright width/height (EXIF orientation already applied). */
  width: number;
  height: number;
  source: CanvasImageSource;
  close?: () => void;
}

export interface ResizeDeps {
  decode: (blob: Blob) => Promise<DecodedImage>;
  encode: (source: CanvasImageSource, width: number, height: number, quality: number) => Promise<Blob>;
}

/**
 * Decodes with `imageOrientation: 'from-image'`, which applies the JPEG EXIF
 * orientation tag. The bitmap's width/height are therefore the upright size
 * (a portrait photo stored sideways reports as portrait) and the pixels drawn
 * to the canvas are upright. The re-encoded JPEG carries no EXIF, so nothing
 * downstream (browser, Gemini) can rotate it a second time.
 */
export async function decodeWithOrientation(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap is not available in this browser');
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
}

export function encodeJpegOnCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('2D canvas is not available'));

  // JPEG has no alpha: paint white first so transparent areas don't turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('JPEG encoding failed'))),
      'image/jpeg',
      quality
    );
  });
}

const browserDeps: ResizeDeps = { decode: decodeWithOrientation, encode: encodeJpegOnCanvas };

/** Resize (never upscale) + re-encode as JPEG q=0.85, orientation baked in. Throws on failure. */
export async function resizeImageForUpload(blob: Blob, deps: ResizeDeps = browserDeps): Promise<Blob> {
  const decoded = await deps.decode(blob);
  try {
    const { width, height } = computeResizedDimensions(decoded.width, decoded.height);
    return await deps.encode(decoded.source, width, height, UPLOAD_JPEG_QUALITY);
  } finally {
    decoded.close?.();
  }
}
