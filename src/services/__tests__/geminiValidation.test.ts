// src/services/__tests__/geminiValidation.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateGeminiResult,
  ALLOWED_CATEGORIES,
  type ProductIdentificationResponse,
} from '../../../supabase/functions/identify-product/validation.ts';

/**
 * VALIDATION LOGIC TEST SUITE:
 * These tests exercise the REAL validation logic directly from `validateGeminiResult()`,
 * NOT mocks. There is no mocking of Gemini or Supabase here — this directly executes
 * the production validation code used by the Supabase Edge Function to prevent silent fallbacks.
 */

describe('validateGeminiResult - Strict Real-Logic Validation (Stage 5.1)', () => {
  const validPayload: ProductIdentificationResponse = {
    item_name: 'Handcrafted Sheesham Coffee Table',
    material: 'Sheesham Wood (Indian Rosewood)',
    category: 'Woodwork',
    confidence: 0.942,
    short_description:
      'A masterfully carved solid Sheesham wood coffee table featuring traditional brass inlay motifs.',
  };

  it('passes when given fully valid input with all required fields', () => {
    const result = validateGeminiResult(validPayload);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        item_name: 'Handcrafted Sheesham Coffee Table',
        material: 'Sheesham Wood (Indian Rosewood)',
        category: 'Woodwork',
        confidence: 0.942,
        short_description:
          'A masterfully carved solid Sheesham wood coffee table featuring traditional brass inlay motifs.',
      });
    }
  });

  it('passes and validates across all allowed craft categories', () => {
    for (const category of ALLOWED_CATEGORIES) {
      const result = validateGeminiResult({
        ...validPayload,
        category,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.category).toBe(category);
      }
    }
  });

  it('fails when item_name is missing, null, or empty string without fabricating a placeholder', () => {
    // Missing key
    const missing = { ...validPayload };
    // @ts-expect-error testing missing property
    delete missing.item_name;
    const res1 = validateGeminiResult(missing);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain('missing required field: item_name');
    }

    // Empty whitespace string
    const empty = { ...validPayload, item_name: '   ' };
    const res2 = validateGeminiResult(empty);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toContain('missing required field: item_name');
    }

    // Non-string type
    const nonString = { ...validPayload, item_name: 12345 };
    const res3 = validateGeminiResult(nonString);
    expect(res3.ok).toBe(false);
    if (!res3.ok) {
      expect(res3.error).toContain('missing required field: item_name');
    }
  });

  it('fails when material is empty string or missing without fabricating a placeholder', () => {
    const emptyMaterial = { ...validPayload, material: '   ' };
    const res1 = validateGeminiResult(emptyMaterial);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain('missing required field: material');
    }

    const missingMaterial = { ...validPayload };
    // @ts-expect-error testing missing property
    delete missingMaterial.material;
    const res2 = validateGeminiResult(missingMaterial);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toContain('missing required field: material');
    }
  });

  it("fails when category is invalid (e.g. 'Electronics') and names the invalid value instead of defaulting to 'Woodwork'", () => {
    const invalidCat = { ...validPayload, category: 'Electronics' };
    const result = validateGeminiResult(invalidCat);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("returned invalid category: 'Electronics'");
      expect(result.error).toContain('Woodwork');
    }
  });

  it('fails when confidence is missing without fabricating 0.85', () => {
    const missingConf = { ...validPayload };
    // @ts-expect-error testing missing property
    delete missingConf.confidence;
    const result = validateGeminiResult(missingConf);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('missing required field: confidence');
    }
  });

  it('fails when confidence is NaN without fabricating 0.85', () => {
    const nanConf = { ...validPayload, confidence: NaN };
    const result = validateGeminiResult(nanConf);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('confidence must be a valid number');
    }
  });

  it('fails when confidence is significantly outside [0, 1] range', () => {
    const highConf = { ...validPayload, confidence: 1.8 };
    const res1 = validateGeminiResult(highConf);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain('confidence must be between 0.0 and 1.0');
    }

    const negConf = { ...validPayload, confidence: -0.5 };
    const res2 = validateGeminiResult(negConf);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toContain('confidence must be between 0.0 and 1.0');
    }
  });

  it('clamps slightly out-of-range floating point confidence (e.g. 1.00001) gracefully without fabricating numbers', () => {
    const floatConf = { ...validPayload, confidence: 1.00001 };
    const result = validateGeminiResult(floatConf);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence).toBe(1);
    }
  });

  it('fails when short_description is missing or empty whitespace string', () => {
    const emptyDesc = { ...validPayload, short_description: '  ' };
    const res1 = validateGeminiResult(emptyDesc);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain('missing required field: short_description');
    }

    const missingDesc = { ...validPayload };
    // @ts-expect-error testing missing property
    delete missingDesc.short_description;
    const res2 = validateGeminiResult(missingDesc);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toContain('missing required field: short_description');
    }
  });

  it('fails when input is not an object (e.g. null, array, string)', () => {
    expect(validateGeminiResult(null).ok).toBe(false);
    expect(validateGeminiResult([]).ok).toBe(false);
    expect(validateGeminiResult('invalid string').ok).toBe(false);
  });
});

/**
 * Stage 6.4 extended fields — REAL validateGeminiResult logic, no mocks.
 * Rule under test: unknowable values are 'unknown' (finish), an empty list
 * (secondary_materials) or absent (complexity, shape_profile, spoken names).
 * Nothing is ever filled in with a guess, and out-of-contract values fail.
 */
describe('validateGeminiResult - extended fields (Stage 6.4)', () => {
  const base = {
    item_name: 'Carved Teak Mandir',
    material: 'Teak Wood',
    category: 'Woodwork',
    confidence: 0.9,
    short_description: 'A hand-carved home temple.',
  };

  const extended = {
    ...base,
    secondary_materials: ['Brass inlay', 'Cane'],
    finish: 'polished',
    complexity: 'intricate',
    complexity_reason: 'Deep floral carving covers every panel.',
    shape_profile: 'box',
    item_name_spoken: 'सागवान मंदिर',
    material_spoken: 'सागवान की लकड़ी',
  };

  it('a legacy response (no new fields) produces exactly the legacy shape — no keys added', () => {
    const result = validateGeminiResult(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value).sort()).toEqual(
        ['category', 'confidence', 'item_name', 'material', 'short_description']
      );
    }
  });

  it('passes a full extended response through, trimmed', () => {
    const result = validateGeminiResult({ ...extended, complexity_reason: '  Deep floral carving covers every panel.  ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ ...extended, confidence: 0.9 });
    }
  });

  it("keeps honest 'unknown' finish and an empty secondary_materials list as-is", () => {
    const result = validateGeminiResult({ ...base, finish: 'unknown', secondary_materials: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.finish).toBe('unknown');
      expect(result.value.secondary_materials).toEqual([]);
    }
  });

  it('leaves omitted / null optional fields absent instead of inventing values', () => {
    const result = validateGeminiResult({
      ...base,
      finish: null,
      complexity: null,
      complexity_reason: null,
      shape_profile: undefined,
      secondary_materials: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const key of ['finish', 'complexity', 'complexity_reason', 'shape_profile', 'secondary_materials']) {
        expect(result.value).not.toHaveProperty(key);
      }
    }
  });

  it('cleans secondary_materials: trims, drops blanks and duplicates, and removes the primary material', () => {
    const result = validateGeminiResult({
      ...base,
      secondary_materials: ['  Brass inlay ', '', '   ', 'brass INLAY', 'teak wood', 'Cane'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.secondary_materials).toEqual(['Brass inlay', 'Cane']);
  });

  it('rejects secondary_materials that is not an array of strings', () => {
    for (const bad of ['Brass', [1, 2], [{ name: 'Brass' }]]) {
      const result = validateGeminiResult({ ...base, secondary_materials: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('secondary_materials must be an array of strings');
    }
  });

  it("rejects an out-of-enum finish instead of coercing it (e.g. 'glossy' is not silently 'polished')", () => {
    for (const bad of ['glossy', '', 'Polished']) {
      const result = validateGeminiResult({ ...base, finish: bad });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('invalid finish');
    }
  });

  it('rejects invalid complexity and shape_profile values', () => {
    const c = validateGeminiResult({ ...base, complexity: 'very hard', complexity_reason: 'x' });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toContain('invalid complexity');

    const s = validateGeminiResult({ ...base, shape_profile: 'cylinder' });
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.error).toContain('invalid shape_profile');
  });

  it('requires complexity and complexity_reason to come together (no unexplained or orphaned reason)', () => {
    const noReason = validateGeminiResult({ ...base, complexity: 'medium' });
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error).toContain('without a complexity_reason');

    const blankReason = validateGeminiResult({ ...base, complexity: 'medium', complexity_reason: '   ' });
    expect(blankReason.ok).toBe(false);

    const orphan = validateGeminiResult({ ...base, complexity_reason: 'Looks detailed.' });
    expect(orphan.ok).toBe(false);
    if (!orphan.ok) expect(orphan.error).toContain('without a complexity');
  });

  it('accepts every allowed shape_profile, complexity and finish value', () => {
    for (const shape_profile of ['box', 'flat', 'round']) {
      expect(validateGeminiResult({ ...base, shape_profile }).ok).toBe(true);
    }
    for (const complexity of ['simple', 'medium', 'intricate']) {
      expect(validateGeminiResult({ ...base, complexity, complexity_reason: 'Visible detail.' }).ok).toBe(true);
    }
    for (const finish of ['natural', 'polished', 'painted', 'lacquered', 'unknown']) {
      expect(validateGeminiResult({ ...base, finish }).ok).toBe(true);
    }
  });

  it('spoken names: blank means "not available" (absent), non-strings fail', () => {
    const blank = validateGeminiResult({ ...base, item_name_spoken: '  ', material_spoken: 'लकड़ी' });
    expect(blank.ok).toBe(true);
    if (blank.ok) {
      expect(blank.value).not.toHaveProperty('item_name_spoken');
      expect(blank.value.material_spoken).toBe('लकड़ी');
    }

    const bad = validateGeminiResult({ ...base, item_name_spoken: 42 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('item_name_spoken must be a string');
  });

  it('an invalid extended field still fails the whole response even when the base fields are valid', () => {
    const result = validateGeminiResult({ ...extended, finish: 'shiny' });
    expect(result.ok).toBe(false);
  });
});

/**
 * Stage 6.5 extended fields — REAL validateGeminiResult logic, no mocks.
 * Rule under test: visible_features, colors, style and suggested_use are only
 * what is actually visible (honest empty list / 'unknown' when unclear), and
 * complexity_reason_spoken fixes the 6.4 open item (complexity_reason read
 * aloud in the artisan's own language).
 */
describe('validateGeminiResult - Stage 6.5 fields (describe step facts)', () => {
  const base = {
    item_name: 'Carved Teak Mandir',
    material: 'Teak Wood',
    category: 'Woodwork',
    confidence: 0.9,
    short_description: 'A hand-carved home temple.',
  };

  it('accepts visible_features, colors, style and suggested_use together', () => {
    const result = validateGeminiResult({
      ...base,
      visible_features: ['carved floral motif', 'brass handles', 'cushioned seat'],
      colors: ['brown', 'gold'],
      style: 'traditional',
      suggested_use: ['living room', 'puja room', 'gifting'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.visible_features).toEqual(['carved floral motif', 'brass handles', 'cushioned seat']);
      expect(result.value.colors).toEqual(['brown', 'gold']);
      expect(result.value.style).toBe('traditional');
      expect(result.value.suggested_use).toEqual(['living room', 'puja room', 'gifting']);
    }
  });

  it("keeps honest empty lists and 'unknown' style as-is (never fabricated)", () => {
    const result = validateGeminiResult({ ...base, visible_features: [], colors: [], style: 'unknown', suggested_use: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.visible_features).toEqual([]);
      expect(result.value.colors).toEqual([]);
      expect(result.value.style).toBe('unknown');
      expect(result.value.suggested_use).toEqual([]);
    }
  });

  it('leaves these fields absent instead of inventing values when omitted or null', () => {
    const result = validateGeminiResult({
      ...base,
      visible_features: null,
      colors: undefined,
      style: null,
      suggested_use: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const key of ['visible_features', 'colors', 'style', 'suggested_use']) {
        expect(result.value).not.toHaveProperty(key);
      }
    }
  });

  it('trims, drops blanks, and de-duplicates visible_features/colors/suggested_use', () => {
    const result = validateGeminiResult({
      ...base,
      visible_features: ['  Carved floral motif ', '', '  ', 'carved FLORAL motif', 'Brass handles'],
      colors: ['Brown', ' brown ', 'Gold'],
      suggested_use: ['Gifting', '  ', 'gifting'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.visible_features).toEqual(['Carved floral motif', 'Brass handles']);
      expect(result.value.colors).toEqual(['Brown', 'Gold']);
      expect(result.value.suggested_use).toEqual(['Gifting']);
    }
  });

  it('caps visible_features at 8 (truncates rather than rejecting extras)', () => {
    const many = Array.from({ length: 12 }, (_, i) => `feature ${i}`);
    const result = validateGeminiResult({ ...base, visible_features: many });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.visible_features).toHaveLength(8);
      expect(result.value.visible_features).toEqual(many.slice(0, 8));
    }
  });

  it('rejects visible_features/colors/suggested_use that are not arrays of strings', () => {
    for (const bad of ['a feature', [1, 2], [{ x: 1 }]]) {
      expect(validateGeminiResult({ ...base, visible_features: bad }).ok).toBe(false);
      expect(validateGeminiResult({ ...base, colors: bad }).ok).toBe(false);
      expect(validateGeminiResult({ ...base, suggested_use: bad }).ok).toBe(false);
    }
  });

  it("rejects an out-of-enum style instead of coercing it (e.g. 'boho' is not silently 'fusion')", () => {
    const result = validateGeminiResult({ ...base, style: 'boho' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('invalid style');
  });

  it('accepts every allowed style value', () => {
    for (const style of ['traditional', 'modern', 'rustic', 'fusion', 'unknown']) {
      expect(validateGeminiResult({ ...base, style }).ok).toBe(true);
    }
  });

  it('complexity_reason_spoken: kept alongside a real complexity_reason, in the artisan language', () => {
    const result = validateGeminiResult({
      ...base,
      complexity: 'intricate',
      complexity_reason: 'Deep floral carving covers every panel.',
      complexity_reason_spoken: 'हर पैनल पर गहरी फूलों की नक्काशी है।',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complexity_reason_spoken).toBe('हर पैनल पर गहरी फूलों की नक्काशी है।');
    }
  });

  it('complexity_reason_spoken without a complexity_reason is rejected (nothing to translate)', () => {
    const result = validateGeminiResult({ ...base, complexity_reason_spoken: 'कुछ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('complexity_reason_spoken without a complexity_reason');
  });

  it('a blank complexity_reason_spoken is left absent, not invented from the English reason', () => {
    const result = validateGeminiResult({
      ...base,
      complexity: 'simple',
      complexity_reason: 'Plain surface, no carving.',
      complexity_reason_spoken: '   ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).not.toHaveProperty('complexity_reason_spoken');
  });

  it('rejects a non-string complexity_reason_spoken', () => {
    const result = validateGeminiResult({
      ...base,
      complexity: 'simple',
      complexity_reason: 'Plain surface.',
      complexity_reason_spoken: 42,
    });
    expect(result.ok).toBe(false);
  });

  it('a legacy response (no Stage 6.5 fields) produces exactly the legacy shape — no keys added', () => {
    const result = validateGeminiResult(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value).sort()).toEqual(
        ['category', 'confidence', 'item_name', 'material', 'short_description']
      );
    }
  });
});
