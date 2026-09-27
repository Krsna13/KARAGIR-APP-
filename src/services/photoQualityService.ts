/**
 * HARD RULE: Never use generative image editing on the product. Product pixels
 * come only from the original photo. Only background, framing, lighting,
 * contrast, noise, and sharpness may change.
 *
 * Stage 6.3b: Classical image processing quality checks & post-segmentation cutout validation.
 *
 * 1. Quality check (pure functions, classical image processing):
 *    - Blur: variance of the Laplacian on a downscaled greyscale copy.
 *    - Exposure: histogram checks for too dark / overexposed.
 *    - Noise: estimate from flat regions (used to decide denoising).
 *    - Resolution: flag if the longest side is under 800px.
 *    - Output quality_warnings: subset of 'blurry', 'dark', 'overexposed', 'low_resolution'.
 * 
 * 2. Cutout check after segmentation:
 *    - Compute mask coverage (share of non-transparent pixels) and bounding box.
 *    - Reject if coverage < 3% or > 95%, or if mask touches >= 3 image edges.
 *    - Rejected -> enhancement_mode 'light_only'. Accepted -> enhancement_mode 'studio'.
 */

export type QualityWarning = 'blurry' | 'dark' | 'overexposed' | 'low_resolution';
export type EnhancementMode = 'studio' | 'light_only';
export type ImageEdge = 'top' | 'bottom' | 'left' | 'right';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface PixelBuffer {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface QualityThresholds {
  /** Variance of Laplacian below which an image is flagged as blurry */
  blurThreshold: number;
  /** Max dimension for the downscaled grayscale copy used in blur estimation */
  blurDownscaleMaxSide: number;
  /** Minimum mean luminance (0-255) before flagging as dark */
  minMeanLuminance: number;
  /** Fraction of pixels with luminance < 25 to flag as dark */
  maxDarkPixelFraction: number;
  /** Maximum mean luminance (0-255) before flagging as overexposed */
  maxMeanLuminance: number;
  /** Fraction of pixels with luminance > 240 to flag as overexposed */
  maxOverexposedPixelFraction: number;
  /** Longest side threshold below which image is low_resolution */
  minLongestSide: number;
  /** Noise standard deviation threshold in flat regions */
  noiseThreshold: number;
  /** Mean absolute pixel difference threshold for steadiness (shake detection) */
  steadinessThreshold: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  blurThreshold: 45,
  blurDownscaleMaxSide: 256,
  minMeanLuminance: 35,
  maxDarkPixelFraction: 0.50,
  maxMeanLuminance: 220,
  maxOverexposedPixelFraction: 0.35,
  minLongestSide: 800,
  noiseThreshold: 12.0,
  steadinessThreshold: 15.0,
};

export interface CutoutThresholds {
  /** Minimum mask coverage share (0.03 = 3%) */
  minCoverage: number;
  /** Maximum mask coverage share (0.95 = 95%) */
  maxCoverage: number;
  /** Maximum touching edges allowed before rejection (>= 3 touches rejected) */
  maxTouchingEdges: number;
  /** Alpha cutoff (0-255) to treat pixel as non-transparent foreground */
  alphaThreshold: number;
  /** Margin in pixels from edge to consider touching */
  edgeMargin: number;
}

export const DEFAULT_CUTOUT_THRESHOLDS: CutoutThresholds = {
  minCoverage: 0.03,
  maxCoverage: 0.95,
  maxTouchingEdges: 2,
  alphaThreshold: 10,
  edgeMargin: 1,
};

export interface PhotoQualityMetrics {
  blurScore: number;
  meanLuminance: number;
  darkPixelFraction: number;
  overexposedPixelFraction: number;
  noiseEstimate: number;
  width: number;
  height: number;
  quality_warnings: QualityWarning[];
}

export interface CutoutCheckResult {
  accepted: boolean;
  enhancement_mode: EnhancementMode;
  coverage: number;
  boundingBox: BoundingBox | null;
  touchingEdges: ImageEdge[];
  reasons: string[];
}

// ============================================================================
// 1. PURE FUNCTIONS: QUALITY CHECKS (CLASSICAL IMAGE PROCESSING)
// ============================================================================

/**
 * Converts RGBA pixel data to grayscale luminance buffer (ITU-R BT.601).
 * Formula: Y = 0.299*R + 0.587*G + 0.114*B
 */
export function computeGrayscale(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Float32Array {
  const pixelCount = width * height;
  const gray = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    gray[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }

  return gray;
}

/**
 * Computes the mean absolute pixel difference between two grayscale frames.
 * Used for detecting camera shake / motion.
 */
export function computeFrameDifference(
  gray1: Float32Array,
  gray2: Float32Array
): number {
  if (gray1.length !== gray2.length || gray1.length === 0) return 0;
  
  let totalDiff = 0;
  for (let i = 0; i < gray1.length; i++) {
    totalDiff += Math.abs(gray1[i] - gray2[i]);
  }
  return totalDiff / gray1.length;
}

/**
 * Downscales a grayscale buffer to fit within targetMaxSide while preserving aspect ratio,
 * using bilinear interpolation. Ensures variance of Laplacian calculation is fast
 * and invariant to capture megapixel variations.
 */
export function downscaleGrayscale(
  gray: Float32Array,
  srcW: number,
  srcH: number,
  targetMaxSide: number
): { data: Float32Array; width: number; height: number } {
  if (srcW <= 0 || srcH <= 0) {
    throw new Error(`Invalid dimensions for downscale: ${srcW}x${srcH}`);
  }

  const maxSide = Math.max(srcW, srcH);
  if (maxSide <= targetMaxSide) {
    return { data: gray, width: srcW, height: srcH };
  }

  const scale = targetMaxSide / maxSide;
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  const dst = new Float32Array(dstW * dstH);

  const xRatio = (srcW - 1) / Math.max(1, dstW - 1);
  const yRatio = (srcH - 1) / Math.max(1, dstH - 1);

  for (let y = 0; y < dstH; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const yWeight = srcY - y0;

    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const xWeight = srcX - x0;

      const p00 = gray[y0 * srcW + x0];
      const p10 = gray[y0 * srcW + x1];
      const p01 = gray[y1 * srcW + x0];
      const p11 = gray[y1 * srcW + x1];

      const top = p00 + xWeight * (p10 - p00);
      const bottom = p01 + xWeight * (p11 - p01);
      dst[y * dstW + x] = top + yWeight * (bottom - top);
    }
  }

  return { data: dst, width: dstW, height: dstH };
}

/**
 * Computes variance of the Laplacian (Pech-Pacheco autofocus / blur metric).
 * Uses standard 4-connected discrete Laplacian kernel:
 * [  0,  1,  0 ]
 * [  1, -4,  1 ]
 * [  0,  1,  0 ]
 * A low variance indicates uniform gradients (blur / lack of sharp edges).
 */
export function computeVarianceOfLaplacian(
  gray: Float32Array,
  width: number,
  height: number
): number {
  if (width < 3 || height < 3) {
    return 0;
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRow = (y - 1) * width;
    const nextRow = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const center = gray[rowOffset + x];
      const top = gray[prevRow + x];
      const bottom = gray[nextRow + x];
      const left = gray[rowOffset + x - 1];
      const right = gray[rowOffset + x + 1];

      const lap = top + bottom + left + right - 4 * center;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

/**
 * Computes luminance histogram and exposure metrics (mean luminance, dark & overexposed pixel shares).
 */
export function computeLuminanceHistogramAndExposure(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): {
  histogram: Int32Array;
  meanLuminance: number;
  darkFraction: number;
  overexposedFraction: number;
} {
  const pixelCount = width * height;
  const histogram = new Int32Array(256);

  if (pixelCount === 0) {
    return {
      histogram,
      meanLuminance: 0,
      darkFraction: 0,
      overexposedFraction: 0,
    };
  }

  let totalLuminance = 0;
  let darkCount = 0;
  let overexposedCount = 0;
  let validCount = 0;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    // If alpha is present and 0, skip
    if (data.length > offset + 3 && data[offset + 3] === 0) {
      continue;
    }

    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const lum = Math.min(255, Math.max(0, Math.round(0.299 * r + 0.587 * g + 0.114 * b)));

    histogram[lum]++;
    totalLuminance += lum;
    if (lum < 25) darkCount++;
    if (lum > 240) overexposedCount++;
    validCount++;
  }

  if (validCount === 0) {
    return {
      histogram,
      meanLuminance: 0,
      darkFraction: 0,
      overexposedFraction: 0,
    };
  }

  return {
    histogram,
    meanLuminance: totalLuminance / validCount,
    darkFraction: darkCount / validCount,
    overexposedFraction: overexposedCount / validCount,
  };
}

/**
 * Estimates noise level by analyzing standard deviations across flat (low-variance) blocks.
 * Partitions the image into small blocks (default 16x16). Selects blocks with lowest gradient/variance
 * where fluctuations are predominantly sensor noise rather than image edges.
 */
export function estimateNoiseFromFlatRegions(
  gray: Float32Array,
  width: number,
  height: number,
  blockSize: number = 16
): number {
  if (width < blockSize || height < blockSize) {
    // Image too small for patch analysis: calculate global standard deviation
    let sum = 0, sumSq = 0;
    for (let i = 0; i < gray.length; i++) {
      sum += gray[i];
      sumSq += gray[i] * gray[i];
    }
    const mean = sum / (gray.length || 1);
    return Math.sqrt(Math.max(0, sumSq / (gray.length || 1) - mean * mean));
  }

  const xBlocks = Math.floor(width / blockSize);
  const yBlocks = Math.floor(height / blockSize);
  const blockStds: number[] = [];

  for (let by = 0; by < yBlocks; by++) {
    for (let bx = 0; bx < xBlocks; bx++) {
      let bSum = 0;
      let bSumSq = 0;
      const startX = bx * blockSize;
      const startY = by * blockSize;

      for (let y = 0; y < blockSize; y++) {
        const row = (startY + y) * width;
        for (let x = 0; x < blockSize; x++) {
          const val = gray[row + startX + x];
          bSum += val;
          bSumSq += val * val;
        }
      }

      const n = blockSize * blockSize;
      const bMean = bSum / n;
      const bVar = Math.max(0, bSumSq / n - bMean * bMean);
      blockStds.push(Math.sqrt(bVar));
    }
  }

  if (blockStds.length === 0) return 0;

  // Sort block standard deviations to locate the smoothest regions
  blockStds.sort((a, b) => a - b);

  // Take the bottom 20% flat regions (or at least 1 block)
  const takeCount = Math.max(1, Math.floor(blockStds.length * 0.2));
  let flatStdSum = 0;
  for (let i = 0; i < takeCount; i++) {
    flatStdSum += blockStds[i];
  }

  return flatStdSum / takeCount;
}

/**
 * Master pure function: evaluates photo quality using classical image processing.
 */
export function checkPhotoQuality(
  pixels: PixelBuffer,
  customThresholds?: Partial<QualityThresholds>
): PhotoQualityMetrics {
  const { width, height, data } = pixels;
  const cfg = { ...DEFAULT_QUALITY_THRESHOLDS, ...customThresholds };

  if (width <= 0 || height <= 0) {
    return {
      blurScore: 0,
      meanLuminance: 0,
      darkPixelFraction: 0,
      overexposedPixelFraction: 0,
      noiseEstimate: 0,
      width,
      height,
      quality_warnings: ['blurry', 'low_resolution'],
    };
  }

  // 1. Grayscale & downscale for blur detection
  const fullGray = computeGrayscale(data, width, height);
  const downscaled = downscaleGrayscale(fullGray, width, height, cfg.blurDownscaleMaxSide);
  const blurScore = computeVarianceOfLaplacian(downscaled.data, downscaled.width, downscaled.height);

  // 2. Exposure & histogram checks
  const exposure = computeLuminanceHistogramAndExposure(data, width, height);

  // 3. Noise estimation from flat regions
  const noiseEstimate = estimateNoiseFromFlatRegions(fullGray, width, height);

  // 4. Evaluate quality warnings
  const warnings: QualityWarning[] = [];

  // Resolution
  if (Math.max(width, height) < cfg.minLongestSide) {
    warnings.push('low_resolution');
  }

  // Blur
  if (blurScore < cfg.blurThreshold) {
    warnings.push('blurry');
  }

  // Too dark
  if (exposure.meanLuminance < cfg.minMeanLuminance || exposure.darkFraction > cfg.maxDarkPixelFraction) {
    warnings.push('dark');
  }

  // Overexposed
  if (exposure.meanLuminance > cfg.maxMeanLuminance || exposure.overexposedFraction > cfg.maxOverexposedPixelFraction) {
    warnings.push('overexposed');
  }

  return {
    blurScore,
    meanLuminance: exposure.meanLuminance,
    darkPixelFraction: exposure.darkFraction,
    overexposedPixelFraction: exposure.overexposedFraction,
    noiseEstimate,
    width,
    height,
    quality_warnings: warnings,
  };
}

// ============================================================================
// 2. PURE FUNCTIONS: CUTOUT VALIDATION AFTER SEGMENTATION
// ============================================================================

/**
 * Pure function: validates segmentation cutout quality.
 * Computes mask coverage and product bounding box.
 * Rejects cutout if:
 *  - Coverage < 3% or > 95%
 *  - Mask touches 3 or more image edges
 * 
 * Accepted -> enhancement_mode 'studio'
 * Rejected -> enhancement_mode 'light_only'
 */
export function checkCutout(
  image: PixelBuffer,
  customThresholds?: Partial<CutoutThresholds>
): CutoutCheckResult {
  const { width, height, data } = image;
  const cfg = { ...DEFAULT_CUTOUT_THRESHOLDS, ...customThresholds };

  if (width <= 0 || height <= 0) {
    return {
      accepted: false,
      enhancement_mode: 'light_only',
      coverage: 0,
      boundingBox: null,
      touchingEdges: [],
      reasons: ['invalid_dimensions'],
    };
  }

  const totalPixels = width * height;
  let foregroundCount = 0;

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const alpha = data[(rowOffset + x) * 4 + 3];
      if (alpha >= cfg.alphaThreshold) {
        foregroundCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (foregroundCount === 0 || maxX < minX || maxY < minY) {
    return {
      accepted: false,
      enhancement_mode: 'light_only',
      coverage: 0,
      boundingBox: null,
      touchingEdges: [],
      reasons: ['no_foreground_detected'],
    };
  }

  const coverage = foregroundCount / totalPixels;
  const boundingBox: BoundingBox = {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };

  // Check edge touches
  const touchingEdges: ImageEdge[] = [];
  if (minY <= cfg.edgeMargin) touchingEdges.push('top');
  if (maxY >= height - 1 - cfg.edgeMargin) touchingEdges.push('bottom');
  if (minX <= cfg.edgeMargin) touchingEdges.push('left');
  if (maxX >= width - 1 - cfg.edgeMargin) touchingEdges.push('right');

  const reasons: string[] = [];
  if (coverage < cfg.minCoverage) {
    reasons.push(`coverage_too_low (${(coverage * 100).toFixed(1)}% < ${(cfg.minCoverage * 100).toFixed(1)}%)`);
  }
  if (coverage > cfg.maxCoverage) {
    reasons.push(`coverage_too_high (${(coverage * 100).toFixed(1)}% > ${(cfg.maxCoverage * 100).toFixed(1)}%)`);
  }
  if (touchingEdges.length >= 3) {
    reasons.push(`touches_too_many_edges (${touchingEdges.join(', ')})`);
  }

  const accepted = reasons.length === 0;
  const enhancement_mode: EnhancementMode = accepted ? 'studio' : 'light_only';

  return {
    accepted,
    enhancement_mode,
    coverage,
    boundingBox,
    touchingEdges,
    reasons,
  };
}

// ============================================================================
// 3. ASYNC BLOB WRAPPERS (BROWSER / CANVAS INTEGRATION)
// ============================================================================

export interface ImageDecodeDeps {
  decodeBlobToPixels?: (blob: Blob) => Promise<PixelBuffer>;
}

/**
 * Extracts raw RGBA pixels from an image Blob using Canvas 2D.
 */
export async function defaultDecodeBlobToPixels(blob: Blob): Promise<PixelBuffer> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d canvas context');
      ctx.drawImage(bitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      return { data: imgData.data, width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  // Fast-fail in headless / JSDOM test environments where Image does not load blob URLs
  if (
    typeof navigator !== 'undefined' &&
    (navigator.userAgent?.includes('jsdom') || navigator.userAgent?.includes('Node.js'))
  ) {
    throw new Error('Image decoding not supported in jsdom environment without injected decoder');
  }

  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      return reject(new Error('Image constructor is not available'));
    }

    const img = new Image();
    const url = URL.createObjectURL(blob);
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        URL.revokeObjectURL(url);
        reject(new Error('Image decoding timed out'));
      }
    }, 3000);

    img.onload = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2d canvas context');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        resolve({ data: imgData.data, width: img.width, height: img.height });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image blob for pixel extraction'));
    };
    img.src = url;
  });
}

/**
 * Evaluates photo quality directly from an image Blob.
 */
export async function checkBlobPhotoQuality(
  blob: Blob,
  thresholds?: Partial<QualityThresholds>,
  deps?: ImageDecodeDeps
): Promise<PhotoQualityMetrics> {
  const decoder = deps?.decodeBlobToPixels || defaultDecodeBlobToPixels;
  const pixels = await decoder(blob);
  return checkPhotoQuality(pixels, thresholds);
}

/**
 * Evaluates segmentation cutout directly from a segmented image Blob.
 */
export async function checkBlobCutout(
  blob: Blob,
  thresholds?: Partial<CutoutThresholds>,
  deps?: ImageDecodeDeps
): Promise<CutoutCheckResult> {
  const decoder = deps?.decodeBlobToPixels || defaultDecodeBlobToPixels;
  const pixels = await decoder(blob);
  return checkCutout(pixels, thresholds);
}
