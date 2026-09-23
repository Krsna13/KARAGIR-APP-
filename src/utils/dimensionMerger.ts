// src/utils/dimensionMerger.ts
// Stage 6.2: Dimension merging and partial follow-up prompt builder for low-literacy artisans.
// Stage 6.5: shape-aware (only the dimensions relevant to the confirmed shape_profile
// are asked/required/merged), diameter + thickness, approximate flag, and
// normalizeDimensions() for cm-normalized values + volume/area.

import type { DimensionKey, VoiceDimensionsValue } from '../types/voice';
import type { ProductShapeProfile } from '../types/product';

/**
 * Which dimensions apply to each shape (Stage 6.4 shape_profile), and which of
 * those are required vs optional:
 *   box   -> length, width, height (all required)
 *   flat  -> length, width required; thickness optional
 *   round -> height, diameter (all required)
 */
export const SHAPE_DIMENSION_KEYS: Record<ProductShapeProfile, { required: DimensionKey[]; optional: DimensionKey[] }> = {
  box: { required: ['length', 'width', 'height'], optional: [] },
  flat: { required: ['length', 'width'], optional: ['thickness'] },
  round: { required: ['height', 'diameter'], optional: [] },
};

/** Every dimension key relevant to a shape (required + optional), in a stable order. */
export function dimensionKeysForShape(shape: ProductShapeProfile): DimensionKey[] {
  const { required, optional } = SHAPE_DIMENSION_KEYS[shape];
  return [...required, ...optional];
}

export function requiredDimensionKeysForShape(shape: ProductShapeProfile): DimensionKey[] {
  return SHAPE_DIMENSION_KEYS[shape].required;
}

const EMPTY_DIMENSIONS: VoiceDimensionsValue = {
  length: null,
  width: null,
  height: null,
  diameter: null,
  thickness: null,
  unit: null,
  approximate: false,
};

const DEFAULT_REQUIRED_KEYS: DimensionKey[] = ['length', 'width', 'height'];

/**
 * Checks if every dimension in `requiredKeys` (and the unit) has been
 * populated. Dimensions outside `requiredKeys` are ignored even if some stray
 * value is present for them (e.g. a stray width for a 'round' pot).
 * `requiredKeys` defaults to length/width/height (the original Stage 6.2
 * behaviour) so existing callers keep working unchanged.
 */
export function isDimensionsComplete(
  dims: VoiceDimensionsValue | null | undefined,
  requiredKeys: DimensionKey[] = DEFAULT_REQUIRED_KEYS
): boolean {
  if (!dims) return false;
  if (dims.unit === null) return false;
  return requiredKeys.every((key) => {
    const val = dims[key];
    return val !== null && val !== undefined && !Number.isNaN(val);
  });
}

/**
 * Merges newly parsed dimensions with previously heard dimensions.
 * Newly non-null values overwrite/fill in missing values. `approximate` is
 * sticky: once any answer was hedged, the merged set stays marked approximate
 * (a later precise-sounding number does not silently drop that caveat).
 * Real logic: purely functional, no external dependencies.
 */
export function mergeDimensions(
  previous: VoiceDimensionsValue | null | undefined,
  incoming: VoiceDimensionsValue
): VoiceDimensionsValue {
  const base = previous ?? EMPTY_DIMENSIONS;
  const pick = (key: 'length' | 'width' | 'height' | 'diameter' | 'thickness') =>
    incoming[key] !== null && incoming[key] !== undefined ? incoming[key] : base[key];

  return {
    length: pick('length'),
    width: pick('width'),
    height: pick('height'),
    diameter: pick('diameter'),
    thickness: pick('thickness'),
    unit: incoming.unit !== null && incoming.unit !== undefined ? incoming.unit : base.unit,
    approximate: Boolean(base.approximate) || Boolean(incoming.approximate),
  };
}

export interface DimensionPrompt {
  en: string;
  hi: string;
  spoken: string;
}

type Lang = 'hi' | 'mr' | 'en';
const asLang = (code: string | null | undefined): Lang => (code === 'mr' || code === 'en' ? code : 'hi');

const DIMENSION_LABELS: Record<DimensionKey, { en: string; hi: string; mr: string }> = {
  length: { en: 'length', hi: 'लंबाई', mr: 'लांबी' },
  width: { en: 'width', hi: 'चौड़ाई', mr: 'रुंदी' },
  height: { en: 'height', hi: 'ऊंचाई', mr: 'उंची' },
  diameter: { en: 'diameter', hi: 'व्यास', mr: 'व्यास' },
  thickness: { en: 'thickness', hi: 'मोटाई', mr: 'जाडी' },
};

const UNIT_LABELS: Record<'ft' | 'in' | 'cm' | 'm', { en: string; hi: string; mr: string }> = {
  ft: { en: 'ft', hi: 'फीट', mr: 'फूट' },
  in: { en: 'in', hi: 'इंच', mr: 'इंच' },
  cm: { en: 'cm', hi: 'सेमी', mr: 'सेंमी' },
  m: { en: 'm', hi: 'मीटर', mr: 'मीटर' },
};

const joinParts = (parts: string[], conj: string) => {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${conj} ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, ${conj} ${parts[parts.length - 1]}`;
};

/**
 * Bilingual follow-up prompt when `requiredKeys` are only partially answered.
 * Only asks about the given keys — a dupatta (flat) passing
 * requiredDimensionKeysForShape('flat') is never asked for height, a pot
 * ('round') is never asked for width. Defaults to length/width/height.
 */
export function getMissingDimensionsPrompt(
  dims: VoiceDimensionsValue,
  requiredKeys: DimensionKey[] = DEFAULT_REQUIRED_KEYS,
  speakingLanguage: string = 'hi'
): DimensionPrompt {
  const lang = asLang(speakingLanguage);
  const keys = requiredKeys;

  const heard: Record<Lang, string[]> = { en: [], hi: [], mr: [] };
  const missing: Record<Lang, string[]> = { en: [], hi: [], mr: [] };

  for (const key of keys) {
    const value = dims[key];
    const label = DIMENSION_LABELS[key];
    if (value !== null && value !== undefined) {
      const unitLabel = dims.unit ? UNIT_LABELS[dims.unit] : null;
      heard.en.push(`${label.en} ${value}${unitLabel ? ` ${unitLabel.en}` : ''}`);
      heard.hi.push(`${label.hi} ${value}${unitLabel ? ` ${unitLabel.hi}` : ''}`);
      heard.mr.push(`${label.mr} ${value}${unitLabel ? ` ${unitLabel.mr}` : ''}`);
    } else {
      missing.en.push(label.en);
      missing.hi.push(label.hi);
      missing.mr.push(label.mr);
    }
  }

  if (!dims.unit) {
    missing.en.push('unit (feet, inches, cm, meters)');
    missing.hi.push('इकाई (फीट, इंच, सेमी)');
    missing.mr.push('एकक (फूट, इंच, सेंमी)');
  }

  let en: string;
  let hi: string;
  let mr: string;

  if (heard.en.length > 0) {
    en = `I heard ${joinParts(heard.en, 'and')}. Please tell me the ${joinParts(missing.en, 'and')}.`;
    hi = `मैंने ${joinParts(heard.hi, 'और')} सुनी। कृपया ${joinParts(missing.hi, 'और')} बताइए।`;
    mr = `मी ${joinParts(heard.mr, 'आणि')} ऐकले. कृपया ${joinParts(missing.mr, 'आणि')} सांगा.`;
  } else {
    const allEn = joinParts([...keys.map((k) => DIMENSION_LABELS[k].en), 'measurement unit'], 'and');
    const allHi = joinParts([...keys.map((k) => DIMENSION_LABELS[k].hi), 'माप की इकाई'], 'और');
    const allMr = joinParts([...keys.map((k) => DIMENSION_LABELS[k].mr), 'मापाचे एकक'], 'आणि');
    en = `Please tell me the ${allEn}.`;
    hi = `कृपया ${allHi} बताइए।`;
    mr = `कृपया ${allMr} सांगा.`;
  }

  const spoken = lang === 'en' ? en : lang === 'mr' ? mr : hi;
  return { en, hi: lang === 'mr' ? mr : hi, spoken };
}

// ---------------------------------------------------------------------------
// Stage 6.5: normalizeDimensions — centimetre values + volume/area
// ---------------------------------------------------------------------------

/** Conversion factor from each supported unit to centimetres. */
const CM_PER_UNIT: Record<'ft' | 'in' | 'cm' | 'm', number> = {
  ft: 30.48,
  in: 2.54,
  cm: 1,
  m: 100,
};

export interface NormalizedDimensions {
  shape: ProductShapeProfile;
  /** Every value below is in centimetres. */
  unit: 'cm';
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  diameter_cm?: number;
  thickness_cm?: number;
  /** box: L×W×H. round: cylinder π×(d/2)²×h. flat: only if thickness was given (L×W×T). */
  volume_cm3?: number;
  /** flat only: L×W. */
  area_cm2?: number;
  approximate: boolean;
}

/**
 * Converts a raw dimensions answer to centimetres and computes volume (box,
 * round, and flat-with-thickness) or area (flat). Pure function; throws if
 * `dims.unit` is missing (callers should only call this once
 * isDimensionsComplete(dims, shape) is true).
 */
export function normalizeDimensions(dims: VoiceDimensionsValue, shape: ProductShapeProfile): NormalizedDimensions {
  if (!dims.unit) {
    throw new Error('normalizeDimensions: dimensions have no unit set');
  }
  const factor = CM_PER_UNIT[dims.unit];
  const toCm = (value: number | null | undefined): number | undefined =>
    value === null || value === undefined ? undefined : round2(value * factor);

  const result: NormalizedDimensions = {
    shape,
    unit: 'cm',
    length_cm: toCm(dims.length),
    width_cm: toCm(dims.width),
    height_cm: toCm(dims.height),
    diameter_cm: toCm(dims.diameter),
    thickness_cm: toCm(dims.thickness),
    approximate: Boolean(dims.approximate),
  };

  if (shape === 'box') {
    if (result.length_cm !== undefined && result.width_cm !== undefined && result.height_cm !== undefined) {
      result.volume_cm3 = round2(result.length_cm * result.width_cm * result.height_cm);
    }
  } else if (shape === 'round') {
    if (result.diameter_cm !== undefined && result.height_cm !== undefined) {
      const radius = result.diameter_cm / 2;
      result.volume_cm3 = round2(Math.PI * radius * radius * result.height_cm);
    }
  } else {
    // flat
    if (result.length_cm !== undefined && result.width_cm !== undefined) {
      result.area_cm2 = round2(result.length_cm * result.width_cm);
      if (result.thickness_cm !== undefined) {
        result.volume_cm3 = round2(result.area_cm2 * result.thickness_cm);
      }
    }
  }

  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
