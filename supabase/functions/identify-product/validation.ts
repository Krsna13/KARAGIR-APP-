// supabase/functions/identify-product/validation.ts
// Pure validation logic for Gemini structured vision output.
// Shared between the Supabase Edge Function and Vitest unit tests.

export const ALLOWED_CATEGORIES = [
  'Woodwork',
  'Pottery',
  'Brasscraft',
  'Textile',
  'Furniture',
  'Metal',
] as const;

export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

// Stage 6.4 extended fields
export const FINISH_TYPES = ['natural', 'polished', 'painted', 'lacquered', 'unknown'] as const;
export const COMPLEXITY_LEVELS = ['simple', 'medium', 'intricate'] as const;
export const SHAPE_PROFILES = ['box', 'flat', 'round'] as const;

// Stage 6.5 extended fields
export const STYLE_TYPES = ['traditional', 'modern', 'rustic', 'fusion', 'unknown'] as const;
export const MAX_VISIBLE_FEATURES = 8;

export type FinishType = (typeof FINISH_TYPES)[number];
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];
export type ShapeProfile = (typeof SHAPE_PROFILES)[number];
export type StyleType = (typeof STYLE_TYPES)[number];

export interface ProductIdentificationResponse {
  item_name: string;
  material: string;
  category: AllowedCategory;
  confidence: number;
  short_description: string;
  // Optional (Stage 6.4/6.5). Absent keys mean "not returned / not determinable";
  // they are never filled in with guesses.
  secondary_materials?: string[];
  finish?: FinishType;
  complexity?: ComplexityLevel;
  complexity_reason?: string;
  complexity_reason_spoken?: string;
  shape_profile?: ShapeProfile;
  item_name_spoken?: string;
  material_spoken?: string;
  visible_features?: string[];
  colors?: string[];
  style?: StyleType;
  suggested_use?: string[];
}

export type ValidationResult =
  | { ok: true; value: ProductIdentificationResponse }
  | { ok: false; error: string };

/**
 * Validates the parsed JSON result returned by Gemini.
 * Enforces strict typing and presence of all required fields without
 * silently fabricating fallback or default values.
 */
export function validateGeminiResult(parsed: unknown): ValidationResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Gemini response must be a JSON object' };
  }

  const record = parsed as Record<string, unknown>;

  // 1. item_name: required non-empty string
  if (typeof record.item_name !== 'string' || record.item_name.trim() === '') {
    return { ok: false, error: 'Gemini response missing required field: item_name' };
  }

  // 2. material: required non-empty string
  if (typeof record.material !== 'string' || record.material.trim() === '') {
    return { ok: false, error: 'Gemini response missing required field: material' };
  }

  // 3. category: must be one of ALLOWED_CATEGORIES
  if (
    typeof record.category !== 'string' ||
    !ALLOWED_CATEGORIES.includes(record.category as AllowedCategory)
  ) {
    return {
      ok: false,
      error: `Gemini response returned invalid category: '${String(record.category)}'. Allowed categories: ${ALLOWED_CATEGORIES.join(', ')}`,
    };
  }

  // 4. confidence: must be present, number, not NaN, and within [0, 1]
  if (record.confidence === undefined || record.confidence === null) {
    return { ok: false, error: 'Gemini response missing required field: confidence' };
  }

  if (typeof record.confidence !== 'number' || Number.isNaN(record.confidence)) {
    return { ok: false, error: 'Gemini response confidence must be a valid number' };
  }

  if (record.confidence < -0.001 || record.confidence > 1.001) {
    return {
      ok: false,
      error: `Gemini response confidence must be between 0.0 and 1.0, got ${record.confidence}`,
    };
  }

  const clampedConfidence = Math.max(0, Math.min(1, Number(record.confidence.toFixed(4))));

  // 5. short_description: required non-empty string
  if (typeof record.short_description !== 'string' || record.short_description.trim() === '') {
    return { ok: false, error: 'Gemini response missing required field: short_description' };
  }

  const value: ProductIdentificationResponse = {
    item_name: record.item_name.trim(),
    material: record.material.trim(),
    category: record.category as AllowedCategory,
    confidence: clampedConfidence,
    short_description: record.short_description.trim(),
  };

  const extended = validateExtendedFields(record, value.material);
  if ('error' in extended) return { ok: false, error: extended.error };

  return { ok: true, value: { ...value, ...extended.value } };
}

const isAbsent = (v: unknown) => v === undefined || v === null;

/**
 * Stage 6.4 optional fields. Absent (undefined/null) stays absent. Present
 * values must be valid: an out-of-contract value is an error, never coerced
 * to a guess. Honest "don't know" values are 'unknown' (finish) or an empty
 * list (secondary_materials); complexity/shape_profile are simply omitted.
 */
function validateExtendedFields(
  record: Record<string, unknown>,
  primaryMaterial: string
):
  | { ok: true; value: Partial<ProductIdentificationResponse> }
  | { ok: false; error: string } {
  const out: Partial<ProductIdentificationResponse> = {};

  // secondary_materials: string[]; trimmed, blanks dropped, de-duplicated,
  // and the primary material removed (it is not "secondary").
  if (!isAbsent(record.secondary_materials)) {
    const list = record.secondary_materials;
    if (!Array.isArray(list) || list.some((m) => typeof m !== 'string')) {
      return { ok: false, error: 'Gemini response secondary_materials must be an array of strings' };
    }
    const seen = new Set<string>([primaryMaterial.toLowerCase()]);
    out.secondary_materials = [];
    for (const raw of list as string[]) {
      const material = raw.trim();
      const key = material.toLowerCase();
      if (!material || seen.has(key)) continue;
      seen.add(key);
      out.secondary_materials.push(material);
    }
  }

  if (!isAbsent(record.finish)) {
    if (!FINISH_TYPES.includes(record.finish as FinishType)) {
      return {
        ok: false,
        error: `Gemini response returned invalid finish: '${String(record.finish)}'. Allowed: ${FINISH_TYPES.join(', ')}`,
      };
    }
    out.finish = record.finish as FinishType;
  }

  const hasComplexity = !isAbsent(record.complexity);
  const reason = typeof record.complexity_reason === 'string' ? record.complexity_reason.trim() : '';
  if (hasComplexity) {
    if (!COMPLEXITY_LEVELS.includes(record.complexity as ComplexityLevel)) {
      return {
        ok: false,
        error: `Gemini response returned invalid complexity: '${String(record.complexity)}'. Allowed: ${COMPLEXITY_LEVELS.join(', ')}`,
      };
    }
    if (!reason) {
      return { ok: false, error: 'Gemini response gave complexity without a complexity_reason' };
    }
    out.complexity = record.complexity as ComplexityLevel;
    out.complexity_reason = reason;
  } else if (!isAbsent(record.complexity_reason) && reason) {
    return { ok: false, error: 'Gemini response gave complexity_reason without a complexity' };
  }

  if (!isAbsent(record.shape_profile)) {
    if (!SHAPE_PROFILES.includes(record.shape_profile as ShapeProfile)) {
      return {
        ok: false,
        error: `Gemini response returned invalid shape_profile: '${String(record.shape_profile)}'. Allowed: ${SHAPE_PROFILES.join(', ')}`,
      };
    }
    out.shape_profile = record.shape_profile as ShapeProfile;
  }

  for (const key of ['item_name_spoken', 'material_spoken'] as const) {
    if (isAbsent(record[key])) continue;
    if (typeof record[key] !== 'string') {
      return { ok: false, error: `Gemini response ${key} must be a string` };
    }
    const spoken = (record[key] as string).trim();
    if (spoken) out[key] = spoken; // empty = not available; left absent, not invented
  }

  // complexity_reason_spoken: only makes sense alongside complexity_reason
  // (Stage 6.5, fixes the 6.4 open item of reading complexity_reason in English only).
  if (!isAbsent(record.complexity_reason_spoken)) {
    if (typeof record.complexity_reason_spoken !== 'string') {
      return { ok: false, error: 'Gemini response complexity_reason_spoken must be a string' };
    }
    if (!hasComplexity || !reason) {
      return { ok: false, error: 'Gemini response gave complexity_reason_spoken without a complexity_reason' };
    }
    const spoken = record.complexity_reason_spoken.trim();
    if (spoken) out.complexity_reason_spoken = spoken;
  }

  // visible_features: short phrases of things actually visible in the photos.
  // Trimmed, blanks dropped, de-duplicated, capped at MAX_VISIBLE_FEATURES
  // (truncated rather than rejected: extra items are not a fabrication, just noise).
  if (!isAbsent(record.visible_features)) {
    const list = record.visible_features;
    if (!Array.isArray(list) || list.some((f) => typeof f !== 'string')) {
      return { ok: false, error: 'Gemini response visible_features must be an array of strings' };
    }
    out.visible_features = dedupeTrimmed(list as string[]).slice(0, MAX_VISIBLE_FEATURES);
  }

  // colors: main visible colors. Empty list if unclear (never guessed).
  if (!isAbsent(record.colors)) {
    const list = record.colors;
    if (!Array.isArray(list) || list.some((c) => typeof c !== 'string')) {
      return { ok: false, error: 'Gemini response colors must be an array of strings' };
    }
    out.colors = dedupeTrimmed(list as string[]);
  }

  if (!isAbsent(record.style)) {
    if (!STYLE_TYPES.includes(record.style as StyleType)) {
      return {
        ok: false,
        error: `Gemini response returned invalid style: '${String(record.style)}'. Allowed: ${STYLE_TYPES.join(', ')}`,
      };
    }
    out.style = record.style as StyleType;
  }

  // suggested_use: e.g. "living room", "puja room", "gifting". Empty if unclear.
  if (!isAbsent(record.suggested_use)) {
    const list = record.suggested_use;
    if (!Array.isArray(list) || list.some((u) => typeof u !== 'string')) {
      return { ok: false, error: 'Gemini response suggested_use must be an array of strings' };
    }
    out.suggested_use = dedupeTrimmed(list as string[]);
  }

  return { ok: true, value: out };
}

/** Trims, drops blanks, de-duplicates case-insensitively, keeping first-seen casing/order. */
function dedupeTrimmed(list: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    const item = raw.trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
