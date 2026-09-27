/**
 * HARD RULE: Never use generative image editing on the product. Product pixels
 * come only from the original photo. Only background, framing, lighting,
 * contrast, noise, and sharpness may change.
 *
 * Stage 6.3b: Studio Composition & Framing
 *
 * Requirements:
 * - Crop to the product bounding box, add 8% padding, center on a square 1200x1200 canvas
 * - Scaling down only (never upscale)
 * - Soft contact shadow under the product (subtle, toggle in config)
 * - Composite onto the chosen background; export JPEG quality 0.9
 */

import {
  DEFAULT_STUDIO_ENHANCEMENT_CONFIG,
  type StudioEnhancementConfig,
} from '../types/imageEnhancement';
import type { EnhancementMode } from '../types/product';
import type { PixelBuffer } from './photoQualityService';

export interface StudioCompositionParams {
  pixels: PixelBuffer;
  enhancement_mode: EnhancementMode;
  config?: Partial<StudioEnhancementConfig>;
  backgroundColor?: string;
}

export interface CompositorDeps {
  renderCanvasToBlob?: (canvas: HTMLCanvasElement, quality: number) => Promise<Blob>;
}

export interface CompositionGeometry {
  canvasSize: number;
  productBoundingBox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  scale: number;
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
  shadow: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
  } | null;
}

/**
 * Pure math: computes studio layout geometry without touching the DOM.
 */
export function computeStudioGeometry(
  pixels: PixelBuffer,
  config: StudioEnhancementConfig = DEFAULT_STUDIO_ENHANCEMENT_CONFIG
): CompositionGeometry {
  const { width, height, data } = pixels;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const a = data[(rowOffset + x) * 4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If no foreground, fallback to full image
  if (maxX < minX || maxY < minY) {
    minX = 0;
    minY = 0;
    maxX = width - 1;
    maxY = height - 1;
  }

  const boxW = Math.max(1, maxX - minX + 1);
  const boxH = Math.max(1, maxY - minY + 1);

  const canvasSize = config.canvasSize;
  const maxProductDim = canvasSize * (1 - 2 * config.paddingPercent);

  // Scaling down only (never upscale)
  const maxBoxSide = Math.max(boxW, boxH);
  const scale = maxBoxSide > maxProductDim ? maxProductDim / maxBoxSide : 1.0;

  const drawWidth = Math.round(boxW * scale);
  const drawHeight = Math.round(boxH * scale);
  const drawX = Math.round((canvasSize - drawWidth) / 2);
  const drawY = Math.round((canvasSize - drawHeight) / 2);

  const shadow = config.enableContactShadow
    ? {
        cx: drawX + drawWidth / 2,
        cy: drawY + drawHeight - Math.max(2, Math.round(drawHeight * 0.015)),
        rx: Math.max(12, Math.round(drawWidth * 0.42)),
        ry: Math.max(4, Math.min(18, Math.round(drawHeight * 0.035))),
      }
    : null;

  return {
    canvasSize,
    productBoundingBox: { minX, minY, maxX, maxY, width: boxW, height: boxH },
    scale,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
    shadow,
  };
}

function createDomImageData(
  ctx: CanvasRenderingContext2D,
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): ImageData {
  if (typeof ImageData !== 'undefined') {
    try {
      return new ImageData(new Uint8ClampedArray(data), width, height);
    } catch {
      // fallback
    }
  }
  const imgData = ctx.createImageData(width, height);
  imgData.data.set(data);
  return imgData;
}

/**
 * Composites the enhanced product cutout onto a studio canvas with soft contact shadow,
 * exporting a 1200x1200 JPEG at quality 0.9.
 */
export async function compositeStudioImage(
  params: StudioCompositionParams,
  deps?: CompositorDeps
): Promise<Blob> {
  const { pixels, enhancement_mode, config: customConfig, backgroundColor } = params;
  const cfg = { ...DEFAULT_STUDIO_ENHANCEMENT_CONFIG, ...customConfig };
  const bgColor = backgroundColor || cfg.defaultBackgroundColor;

  // In light_only mode, we keep original frame and re-encode to JPEG 0.9
  if (enhancement_mode === 'light_only') {
    const canvas = document.createElement('canvas');
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');

    const imgData = createDomImageData(ctx, pixels.data, pixels.width, pixels.height);
    ctx.putImageData(imgData, 0, 0);

    return exportCanvasToJpeg(canvas, cfg.exportJpegQuality, deps);
  }

  // Studio mode: 1200x1200 square with 8% padding and contact shadow
  const geometry = computeStudioGeometry(pixels, cfg);
  const { canvasSize, productBoundingBox, drawX, drawY, drawWidth, drawHeight, shadow } = geometry;

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // 1. Studio background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // 2. Soft contact shadow under the product base
  if (shadow) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      shadow.cx,
      shadow.cy,
      0,
      shadow.cx,
      shadow.cy,
      shadow.rx
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.08)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(
      shadow.cx,
      shadow.cy,
      shadow.rx,
      shadow.ry,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // 3. Draw cropped product from full image canvas onto 1200x1200 studio canvas
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = pixels.width;
  fullCanvas.height = pixels.height;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) throw new Error('Could not get full canvas context');

  const fullImgData = createDomImageData(
    fullCtx,
    pixels.data,
    pixels.width,
    pixels.height
  );
  fullCtx.putImageData(fullImgData, 0, 0);

  // Draw product to 1200x1200 studio canvas
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    fullCanvas,
    productBoundingBox.minX,
    productBoundingBox.minY,
    productBoundingBox.width,
    productBoundingBox.height,
    drawX,
    drawY,
    drawWidth,
    drawHeight
  );

  return exportCanvasToJpeg(canvas, cfg.exportJpegQuality, deps);
}

/**
 * Helper to export canvas to JPEG with quality parameter.
 */
function exportCanvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
  deps?: CompositorDeps
): Promise<Blob> {
  if (deps?.renderCanvasToBlob) {
    return deps.renderCanvasToBlob(canvas, quality);
  }

  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      return reject(new Error('canvas.toBlob is not available'));
    }
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to encode canvas to JPEG blob'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Encodes an RGBA pixel buffer with transparency into a transparent PNG Blob.
 */
export async function encodePixelsToPngBlob(
  pixels: PixelBuffer,
  deps?: CompositorDeps
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  const imgData = createDomImageData(ctx, pixels.data, pixels.width, pixels.height);
  ctx.putImageData(imgData, 0, 0);

  if (deps?.renderCanvasToBlob) {
    return deps.renderCanvasToBlob(canvas, 1.0);
  }

  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      return resolve(new Blob([new Uint8Array(pixels.data)], { type: 'image/png' }));
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode canvas to PNG blob'));
    }, 'image/png');
  });
}
