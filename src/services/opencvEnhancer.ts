/**
 * HARD RULE: Never use generative image editing on the product. Product pixels
 * come only from the original photo. Only background, framing, lighting,
 * contrast, noise, and sharpness may change.
 *
 * Stage 6.3b: Classical OpenCV.js image processing operations:
 * 1. Denoise (Bilateral Filter when noise estimate is high)
 * 2. Mask Refinement (Morphological open/close, connected components preserving legs, alpha feathering)
 * 3. LAB Color Space Enhancement (Gray-world white balance, CLAHE on L channel, adaptive gamma)
 * 4. Sharpening (Gentle unsharp mask for mildly soft photos)
 * 5. Perspective Correction (Flat items with confident 4-corner polygon fit)
 *
 * REAL DEVICE REPRODUCTION NOTE:
 * All cv.* operations in this file (findContours, warpPerspective, morphologyEx, bilateralFilter, CLAHE)
 * run synchronously on the main JavaScript thread. On actual Android Chrome devices, this CPU-bound 
 * work completely blocks the main thread for 100ms - 500ms+ depending on image size. This results in 
 * a full-page UI freeze (scrolling and tapping become unresponsive) despite the "enhancing" spinner.
 * This is a known, unresolved limitation. Moving this pipeline into a Web Worker is the correct
 * architectural fix but is deferred to a future stage due to the complexity of OpenCV.js worker 
 * initialization and test environment (JSDOM) compatibility.
 */

import {
  DEFAULT_STUDIO_ENHANCEMENT_CONFIG,
  type ImageProcessingLog,
  type StudioEnhancementConfig,
} from '../types/imageEnhancement';
import type { EnhancementMode, QualityWarning } from '../types/product';
import {
  computeVarianceOfLaplacian,
  computeGrayscale,
  downscaleGrayscale,
  type PixelBuffer,
} from './photoQualityService';

export interface OpenCVEnhancerInput {
  pixels: PixelBuffer;
  enhancement_mode: EnhancementMode;
  noiseEstimate: number;
  initialBlurScore: number;
  shape_profile?: string | null;
  quality_warnings?: QualityWarning[];
  config?: Partial<StudioEnhancementConfig>;
}

export interface OpenCVEnhancerResult {
  outputPixels: PixelBuffer;
  log: ImageProcessingLog;
}

/**
 * Orders 4 quadrilateral points in canonical order: [top-left, top-right, bottom-right, bottom-left].
 */
export function orderQuadPoints(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (pts.length !== 4) return pts;

  // Sum (x + y): smallest is top-left, largest is bottom-right
  // Difference (y - x): smallest is top-right, largest is bottom-left
  const sortedBySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = sortedBySum[0];
  const br = sortedBySum[3];

  const remaining = [sortedBySum[1], sortedBySum[2]];
  const sortedByDiff = remaining.sort((a, b) => a.y - a.x - (b.y - b.x));
  const tr = sortedByDiff[0];
  const bl = sortedByDiff[1];

  return [tl, tr, br, bl];
}

/**
 * Calculates euclidean distance between two points.
 */
function dist(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Track and safely free all allocated OpenCV objects (cv.Mat, cv.MatVector, cv.CLAHE).
 * Prevents WebAssembly heap leaks across multiple image processing sessions.
 */
export class OpenCVMemoryTracker {
  private disposables = new Set<{ delete: () => void }>();

  track<T extends { delete: () => void }>(item: T): T {
    if (item && typeof item.delete === 'function') {
      this.disposables.add(item);
    }
    return item;
  }

  delete(item: { delete: () => void } | null | undefined): void {
    if (item && typeof item.delete === 'function') {
      this.disposables.delete(item);
      try {
        item.delete();
      } catch {
        // Safe no-op if already freed
      }
    }
  }

  deleteAll(): void {
    for (const item of this.disposables) {
      try {
        item.delete();
      } catch {
        // Safe no-op
      }
    }
    this.disposables.clear();
  }

  get activeCount(): number {
    return this.disposables.size;
  }
}

/**
 * Core image enhancement using OpenCV.js.
 */
export function processImageWithOpenCV(
  cv: any,
  input: OpenCVEnhancerInput,
  externalTracker?: OpenCVMemoryTracker
): OpenCVEnhancerResult {
  const {
    pixels,
    enhancement_mode,
    noiseEstimate,
    initialBlurScore,
    shape_profile,
    quality_warnings = [],
    config: userConfig,
  } = input;

  const cfg = { ...DEFAULT_STUDIO_ENHANCEMENT_CONFIG, ...userConfig };
  const operationsRun: string[] = [];

  const { width, height, data } = pixels;
  const totalPixels = width * height;

  // Track initial metrics
  let initialOpaqueCount = 0;
  let initialLumSum = 0;
  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const a = data[offset + 3];
    if (a > 10) {
      initialOpaqueCount++;
      const lum = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
      initialLumSum += lum;
    }
  }

  const maskCoverageBefore = initialOpaqueCount / (totalPixels || 1);
  const meanLightnessBefore = initialOpaqueCount > 0 ? initialLumSum / initialOpaqueCount : 0;

  const tracker = externalTracker || new OpenCVMemoryTracker();

  // Convert raw pixel buffer to OpenCV Mat (RGBA)
  const src = tracker.track(
    cv.matFromImageData({
      data: new Uint8ClampedArray(data),
      width,
      height,
    })
  );

  let currentMat = tracker.track(src.clone());

  // Extract initial alpha channel
  const channels = tracker.track(new cv.MatVector());
  cv.split(currentMat, channels);
  const rawAlpha = tracker.track(channels.get(3));
  let alphaMask = tracker.track(rawAlpha.clone());
  tracker.delete(rawAlpha);
  tracker.delete(channels);

  let perspectiveApplied = false;

  try {
    // ------------------------------------------------------------------------
    // 1. FLAT ITEMS PERSPECTIVE CORRECTION (if shape_profile === 'flat')
    // ------------------------------------------------------------------------
    if (shape_profile === 'flat' && enhancement_mode === 'studio') {
      try {
        const binMask = tracker.track(new cv.Mat());
        cv.threshold(alphaMask, binMask, 128, 255, cv.THRESH_BINARY);

        const contours = tracker.track(new cv.MatVector());
        const hierarchy = tracker.track(new cv.Mat());
        cv.findContours(binMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        if (contours.size() > 0) {
          // Find largest contour
          let maxArea = 0;
          let maxIdx = 0;
          for (let i = 0; i < contours.size(); i++) {
            const cnt = tracker.track(contours.get(i));
            const area = cv.contourArea(cnt);
            if (area > maxArea) {
              maxArea = area;
              maxIdx = i;
            }
            tracker.delete(cnt);
          }

          const primaryContour = tracker.track(contours.get(maxIdx));
          const perimeter = cv.arcLength(primaryContour, true);
          const approx = tracker.track(new cv.Mat());
          cv.approxPolyDP(primaryContour, approx, 0.03 * perimeter, true);
          tracker.delete(primaryContour);

          // If approx polygon has 4 vertices and is convex
          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const rawPts: Array<{ x: number; y: number }> = [];
            for (let i = 0; i < 4; i++) {
              rawPts.push({
                x: approx.data32S[i * 2],
                y: approx.data32S[i * 2 + 1],
              });
            }

            const [tl, tr, br, bl] = orderQuadPoints(rawPts);

            // Compute target dimensions
            const topW = dist(tl, tr);
            const botW = dist(bl, br);
            const leftH = dist(tl, bl);
            const rightH = dist(tr, br);
            const targetW = Math.max(10, Math.round(Math.max(topW, botW)));
            const targetH = Math.max(10, Math.round(Math.max(leftH, rightH)));

            // Validate that quadrilateral isn't extremely collapsed
            const area = cv.contourArea(approx);
            if (area > 0.05 * totalPixels) {
              const srcTri = tracker.track(
                cv.matFromArray(4, 1, cv.CV_32FC2, [
                  tl.x, tl.y,
                  tr.x, tr.y,
                  br.x, br.y,
                  bl.x, bl.y,
                ])
              );
              const dstTri = tracker.track(
                cv.matFromArray(4, 1, cv.CV_32FC2, [
                  0, 0,
                  targetW, 0,
                  targetW, targetH,
                  0, targetH,
                ])
              );

              const M = tracker.track(cv.getPerspectiveTransform(srcTri, dstTri));
              const warped = tracker.track(new cv.Mat());
              const warpedAlpha = tracker.track(new cv.Mat());

              cv.warpPerspective(
                currentMat,
                warped,
                M,
                new cv.Size(targetW, targetH),
                cv.INTER_LINEAR,
                cv.BORDER_CONSTANT,
                new cv.Scalar(0, 0, 0, 0)
              );

              cv.warpPerspective(
                alphaMask,
                warpedAlpha,
                M,
                new cv.Size(targetW, targetH),
                cv.INTER_NEAREST,
                cv.BORDER_CONSTANT,
                new cv.Scalar(0)
              );

              tracker.delete(currentMat);
              currentMat = warped;

              tracker.delete(alphaMask);
              alphaMask = warpedAlpha;

              tracker.delete(srcTri);
              tracker.delete(dstTri);
              tracker.delete(M);

              perspectiveApplied = true;
              operationsRun.push('perspective_correction_flat');
            }
          }
          tracker.delete(approx);
        }

        tracker.delete(binMask);
        tracker.delete(contours);
        tracker.delete(hierarchy);
      } catch (pErr) {
        console.warn('[OpenCVEnhancer] Perspective correction skipped:', pErr);
      }
    }

    // ------------------------------------------------------------------------
    // 2. MASK REFINEMENT (Studio mode)
    // ------------------------------------------------------------------------
    if (enhancement_mode === 'studio') {
      try {
        const binMask = tracker.track(new cv.Mat());
        cv.threshold(alphaMask, binMask, 10, 255, cv.THRESH_BINARY);

        // A. Morphological opening (remove specks)
        const openKernel = tracker.track(
          cv.getStructuringElement(
            cv.MORPH_ELLIPSE,
            new cv.Size(cfg.morphOpenKernelSize, cfg.morphOpenKernelSize)
          )
        );
        const opened = tracker.track(new cv.Mat());
        cv.morphologyEx(binMask, opened, cv.MORPH_OPEN, openKernel);

        // B. Morphological closing (fill small interior holes)
        const closeKernel = tracker.track(
          cv.getStructuringElement(
            cv.MORPH_ELLIPSE,
            new cv.Size(cfg.morphCloseKernelSize, cfg.morphCloseKernelSize)
          )
        );
        const closed = tracker.track(new cv.Mat());
        cv.morphologyEx(opened, closed, cv.MORPH_CLOSE, closeKernel);

        // C. Connected components: keep largest + connected/relevant parts (chair legs)
        const labels = tracker.track(new cv.Mat());
        const stats = tracker.track(new cv.Mat());
        const centroids = tracker.track(new cv.Mat());
        const numLabels = cv.connectedComponentsWithStats(closed, labels, stats, centroids);

        let maxCompArea = 0;
        let maxCompIdx = 1;

        for (let i = 1; i < numLabels; i++) {
          const area = stats.intAt(i, cv.CC_STAT_AREA);
          if (area > maxCompArea) {
            maxCompArea = area;
            maxCompIdx = i;
          }
        }

        const refinedMask = tracker.track(cv.Mat.zeros(closed.rows, closed.cols, cv.CV_8UC1));
        const minAllowedArea = maxCompArea * cfg.minSecondaryComponentRatio;

        const labelsData = labels.data32S;
        const refinedData = refinedMask.data;
        const totalCompPixels = closed.rows * closed.cols;

        for (let i = 0; i < totalCompPixels; i++) {
          const lbl = labelsData[i];
          if (lbl > 0) {
            const area = stats.intAt(lbl, cv.CC_STAT_AREA);
            if (lbl === maxCompIdx || area >= minAllowedArea) {
              refinedData[i] = 255;
            }
          }
        }

        // D. Feather the edge with Gaussian blur on alpha
        const feathered = tracker.track(new cv.Mat());
        const kSize = Math.max(3, Math.round(cfg.alphaFeatherSigma * 3) | 1);
        cv.GaussianBlur(
          refinedMask,
          feathered,
          new cv.Size(kSize, kSize),
          cfg.alphaFeatherSigma,
          cfg.alphaFeatherSigma
        );

        tracker.delete(alphaMask);
        alphaMask = feathered;

        // Clean up temporary Mats
        tracker.delete(binMask);
        tracker.delete(openKernel);
        tracker.delete(opened);
        tracker.delete(closeKernel);
        tracker.delete(closed);
        tracker.delete(labels);
        tracker.delete(stats);
        tracker.delete(centroids);
        tracker.delete(refinedMask);

        operationsRun.push('mask_morphology_and_feathering');
      } catch (mErr) {
        console.warn('[OpenCVEnhancer] Mask refinement warning:', mErr);
      }
    }

    // ------------------------------------------------------------------------
    // 3. DENOISING (Bilateral filter only when estimated noise is high)
    // ------------------------------------------------------------------------
    if (noiseEstimate > cfg.noiseThreshold) {
      try {
        const rgb = tracker.track(new cv.Mat());
        cv.cvtColor(currentMat, rgb, cv.COLOR_RGBA2RGB);

        const denoisedRgb = tracker.track(new cv.Mat());
        cv.bilateralFilter(
          rgb,
          denoisedRgb,
          cfg.bilateralDiameter,
          cfg.bilateralSigmaColor,
          cfg.bilateralSigmaSpace
        );

        // Put denoised RGB back into currentMat
        const denoisedRgba = tracker.track(new cv.Mat());
        cv.cvtColor(denoisedRgb, denoisedRgba, cv.COLOR_RGB2RGBA);

        tracker.delete(currentMat);
        currentMat = denoisedRgba;

        tracker.delete(rgb);
        tracker.delete(denoisedRgb);
        operationsRun.push('bilateral_denoise');
      } catch (dErr) {
        console.warn('[OpenCVEnhancer] Denoise skipped:', dErr);
      }
    }

    // ------------------------------------------------------------------------
    // 4. LAB COLOR SPACE ENHANCEMENT (White balance, CLAHE, Adaptive Gamma)
    // ------------------------------------------------------------------------
    try {
      const rgb = tracker.track(new cv.Mat());
      cv.cvtColor(currentMat, rgb, cv.COLOR_RGBA2RGB);

      // A. Gray-world white balance on active pixels
      const rgbData = rgb.data;
      const curAlphaData = alphaMask.data;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;

      for (let i = 0; i < rgb.rows * rgb.cols; i++) {
        const alpha = enhancement_mode === 'studio' ? curAlphaData[i] : 255;
        if (alpha > 10) {
          const off = i * 3;
          rSum += rgbData[off];
          gSum += rgbData[off + 1];
          bSum += rgbData[off + 2];
          count++;
        }
      }

      if (count > 0) {
        const rAvg = rSum / count;
        const gAvg = gSum / count;
        const bAvg = bSum / count;
        const grayAvg = (rAvg + gAvg + bAvg) / 3;

        const rScale = rAvg > 0 ? grayAvg / rAvg : 1;
        const gScale = gAvg > 0 ? grayAvg / gAvg : 1;
        const bScale = bAvg > 0 ? grayAvg / bAvg : 1;

        for (let i = 0; i < rgb.rows * rgb.cols; i++) {
          const alpha = enhancement_mode === 'studio' ? curAlphaData[i] : 255;
          if (alpha > 10) {
            const off = i * 3;
            rgbData[off] = Math.min(255, Math.max(0, Math.round(rgbData[off] * rScale)));
            rgbData[off + 1] = Math.min(255, Math.max(0, Math.round(rgbData[off + 1] * gScale)));
            rgbData[off + 2] = Math.min(255, Math.max(0, Math.round(rgbData[off + 2] * bScale)));
          }
        }
        operationsRun.push('gray_world_white_balance');
      }

      // B. Convert to LAB color space
      const lab = tracker.track(new cv.Mat());
      cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);

      const labPlanes = tracker.track(new cv.MatVector());
      cv.split(lab, labPlanes);
      const lMat = tracker.track(labPlanes.get(0));

      // C. CLAHE on L channel
      const clahe = tracker.track(
        new cv.CLAHE(
          cfg.claheClipLimit,
          new cv.Size(cfg.claheTileSize[0], cfg.claheTileSize[1])
        )
      );
      const claheL = tracker.track(new cv.Mat());
      clahe.apply(lMat, claheL);
      operationsRun.push('clahe_l_channel');

      // D. Adaptive Gamma for dark images
      if (meanLightnessBefore < cfg.darkLightnessThreshold && meanLightnessBefore > 10) {
        const gamma = Math.max(0.65, Math.min(0.95, Math.log(0.5) / Math.log(meanLightnessBefore / 255)));
        const lut = tracker.track(new cv.Mat(1, 256, cv.CV_8U));
        for (let i = 0; i < 256; i++) {
          lut.data[i] = Math.min(255, Math.round(Math.pow(i / 255, gamma) * 255));
        }
        const gammaL = tracker.track(new cv.Mat());
        cv.LUT(claheL, lut, gammaL);
        tracker.delete(claheL);
        tracker.delete(lMat);
        labPlanes.set(0, gammaL);
        tracker.delete(lut);
        operationsRun.push('adaptive_gamma');
      } else {
        tracker.delete(lMat);
        labPlanes.set(0, claheL);
      }

      // Merge LAB planes back and convert to RGB
      const enhancedLab = tracker.track(new cv.Mat());
      cv.merge(labPlanes, enhancedLab);

      const enhancedRgb = tracker.track(new cv.Mat());
      cv.cvtColor(enhancedLab, enhancedRgb, cv.COLOR_Lab2RGB);

      // Put enhanced RGB + refined alpha back into currentMat
      const finalRgba = tracker.track(new cv.Mat());
      cv.cvtColor(enhancedRgb, finalRgba, cv.COLOR_RGB2RGBA);

      // Copy refined alpha channel
      const finalChannels = tracker.track(new cv.MatVector());
      cv.split(finalRgba, finalChannels);
      const oldAlpha = tracker.track(finalChannels.get(3));
      tracker.delete(oldAlpha);
      finalChannels.set(3, alphaMask);
      cv.merge(finalChannels, finalRgba);

      tracker.delete(currentMat);
      currentMat = finalRgba;

      // Clean up Mats
      tracker.delete(rgb);
      tracker.delete(lab);
      tracker.delete(labPlanes);
      tracker.delete(enhancedLab);
      tracker.delete(enhancedRgb);
      tracker.delete(finalChannels);
      tracker.delete(clahe);
    } catch (labErr) {
      console.warn('[OpenCVEnhancer] LAB enhancement warning:', labErr);
    }

    // ------------------------------------------------------------------------
    // 5. SHARPENING (Gentle unsharp mask when mildly soft)
    // ------------------------------------------------------------------------
    if (
      initialBlurScore >= cfg.mildSoftnessMinBlur &&
      initialBlurScore <= cfg.mildSoftnessMaxBlur
    ) {
      try {
        const blurred = tracker.track(new cv.Mat());
        cv.GaussianBlur(
          currentMat,
          blurred,
          new cv.Size(0, 0),
          cfg.unsharpSigma,
          cfg.unsharpSigma
        );

        // unsharp = current * (1 + amount) - blurred * amount
        const sharpened = tracker.track(new cv.Mat());
        cv.addWeighted(
          currentMat,
          1 + cfg.unsharpAmount,
          blurred,
          -cfg.unsharpAmount,
          0,
          sharpened
        );

        // Restore alpha channel
        const sharpChannels = tracker.track(new cv.MatVector());
        cv.split(sharpened, sharpChannels);
        const oldSharpAlpha = tracker.track(sharpChannels.get(3));
        tracker.delete(oldSharpAlpha);
        sharpChannels.set(3, alphaMask);
        cv.merge(sharpChannels, sharpened);

        tracker.delete(currentMat);
        currentMat = sharpened;

        tracker.delete(blurred);
        tracker.delete(sharpChannels);
        operationsRun.push('gentle_unsharp_mask');
      } catch (sErr) {
        console.warn('[OpenCVEnhancer] Sharpening warning:', sErr);
      }
    }

    // ------------------------------------------------------------------------
    // Final measurements calculation
    // ------------------------------------------------------------------------
    const outData = new Uint8ClampedArray(currentMat.data);
    const outW = currentMat.cols;
    const outH = currentMat.rows;
    const outTotal = outW * outH;

    let finalOpaqueCount = 0;
    let finalLumSum = 0;
    for (let i = 0; i < outTotal; i++) {
      const off = i * 4;
      const a = outData[off + 3];
      if (a > 10) {
        finalOpaqueCount++;
        const lum = 0.299 * outData[off] + 0.587 * outData[off + 1] + 0.114 * outData[off + 2];
        finalLumSum += lum;
      }
    }

    const maskCoverageAfter = finalOpaqueCount / (outTotal || 1);
    const meanLightnessAfter = finalOpaqueCount > 0 ? finalLumSum / finalOpaqueCount : 0;

    // Sharpness after: compute Laplacian variance on downscaled grayscale
    const fullGray = computeGrayscale(outData, outW, outH);
    const downscaled = downscaleGrayscale(fullGray, outW, outH, 256);
    const sharpnessAfter = computeVarianceOfLaplacian(downscaled.data, downscaled.width, downscaled.height);

    const log: ImageProcessingLog = {
      timestamp: new Date().toISOString(),
      enhancement_mode,
      operations: operationsRun,
      measurements: {
        noiseEstimate,
        sharpnessBefore: initialBlurScore,
        sharpnessAfter,
        meanLightnessBefore,
        meanLightnessAfter,
        maskCoverageBefore,
        maskCoverageAfter,
        perspectiveCorrectionApplied: perspectiveApplied,
      },
      opencvUsed: true,
      fallbackUsed: false,
      quality_warnings,
    };

    return {
      outputPixels: {
        data: outData,
        width: outW,
        height: outH,
      },
      log,
    };
  } finally {
    // Guarantees 100% of allocated cv.Mat, cv.MatVector, cv.CLAHE instances are freed
    tracker.deleteAll();
  }
}
