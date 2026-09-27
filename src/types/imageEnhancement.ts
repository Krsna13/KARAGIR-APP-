/**
 * Stage 6.3b: Image Enhancement and OpenCV Processing Types
 */

import type { EnhancementMode, QualityWarning } from './product';

export interface ImageProcessingMeasurements {
  noiseEstimate: number;
  sharpnessBefore: number;
  sharpnessAfter: number;
  meanLightnessBefore: number;
  meanLightnessAfter: number;
  maskCoverageBefore: number;
  maskCoverageAfter: number;
  perspectiveCorrectionApplied: boolean;
  [key: string]: unknown;
}

export interface ImageProcessingLog {
  timestamp: string;
  enhancement_mode: EnhancementMode;
  operations: string[];
  measurements: ImageProcessingMeasurements;
  opencvUsed: boolean;
  fallbackUsed: boolean;
  quality_warnings?: QualityWarning[];
  [key: string]: unknown;
}

export interface StudioEnhancementConfig {
  /** Bilateral filter parameters for denoising */
  bilateralDiameter: number;
  bilateralSigmaColor: number;
  bilateralSigmaSpace: number;
  /** Noise threshold to trigger bilateral filter */
  noiseThreshold: number;

  /** Mask morphological structuring element sizes */
  morphOpenKernelSize: number;
  morphCloseKernelSize: number;
  /** Alpha feather Gaussian blur sigma */
  alphaFeatherSigma: number;
  /** Connected components: minimum relative area to retain secondary components */
  minSecondaryComponentRatio: number;

  /** LAB CLAHE clip limit (default: 2.0) */
  claheClipLimit: number;
  /** LAB CLAHE tile grid size (default: 8x8) */
  claheTileSize: [number, number];
  /** Dark image mean lightness threshold to trigger adaptive gamma */
  darkLightnessThreshold: number;

  /** Unsharp mask parameters */
  unsharpAmount: number;
  unsharpSigma: number;
  /** Sharpness bounds to trigger unsharp mask: mildly soft photos only */
  mildSoftnessMinBlur: number;
  mildSoftnessMaxBlur: number;

  /** Studio canvas configuration */
  canvasSize: number;
  paddingPercent: number; // e.g. 0.08 = 8%
  enableContactShadow: boolean;
  exportJpegQuality: number; // 0.9 per requirement
  defaultBackgroundColor: string;
}

export const DEFAULT_STUDIO_ENHANCEMENT_CONFIG: StudioEnhancementConfig = {
  bilateralDiameter: 5,
  bilateralSigmaColor: 50,
  bilateralSigmaSpace: 50,
  noiseThreshold: 12.0,

  morphOpenKernelSize: 3,
  morphCloseKernelSize: 5,
  alphaFeatherSigma: 1.2,
  minSecondaryComponentRatio: 0.04, // retain parts like chair legs >= 4% of primary

  claheClipLimit: 2.0,
  claheTileSize: [8, 8],
  darkLightnessThreshold: 100,

  unsharpAmount: 0.5,
  unsharpSigma: 1.0,
  mildSoftnessMinBlur: 35,
  mildSoftnessMaxBlur: 140,

  canvasSize: 1200,
  paddingPercent: 0.08,
  enableContactShadow: true,
  exportJpegQuality: 0.9,
  defaultBackgroundColor: '#FFFFFF',
};

export type PhotoBackground = 'white' | 'soft_grey' | 'warm_studio' | 'original';

export const PHOTO_BACKGROUND_COLORS: Record<Exclude<PhotoBackground, 'original'>, string> = {
  white: '#FFFFFF',
  soft_grey: '#F3F4F6',
  warm_studio: '#FAF5EF',
};

export interface PhotoBackgroundOption {
  id: PhotoBackground;
  label_en: string;
  label_hi: string;
  speech_en: string;
  speech_hi: string;
  colorHex: string;
}

export const PHOTO_BACKGROUND_OPTIONS: PhotoBackgroundOption[] = [
  {
    id: 'white',
    label_en: 'White',
    label_hi: 'सफ़ेद',
    speech_en: 'White background',
    speech_hi: 'सफ़ेद पृष्ठभूमि',
    colorHex: '#FFFFFF',
  },
  {
    id: 'soft_grey',
    label_en: 'Soft grey',
    label_hi: 'हल्का स्लेटी',
    speech_en: 'Soft grey background',
    speech_hi: 'हल्का स्लेटी पृष्ठभूमि',
    colorHex: '#F3F4F6',
  },
  {
    id: 'warm_studio',
    label_en: 'Warm studio',
    label_hi: 'गर्म स्टूडियो',
    speech_en: 'Warm studio background',
    speech_hi: 'गर्म स्टूडियो पृष्ठभूमि',
    colorHex: '#FAF5EF',
  },
  {
    id: 'original',
    label_en: 'Original',
    label_hi: 'असली',
    speech_en: 'Original photo without cutout',
    speech_hi: 'बिना कटआउट असली फोटो',
    colorHex: 'transparent',
  },
];
