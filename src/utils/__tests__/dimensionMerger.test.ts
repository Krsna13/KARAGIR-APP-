// src/utils/__tests__/dimensionMerger.test.ts
// Stage 6.2/6.5: Real-logic test suite for dimension merging, shape-aware
// prompt generation, and cm-normalization.
//
// TEST SUITE ARCHITECTURE & BOUNDARY DECLARATIONS:
// - REAL LOGIC: mergeDimensions, isDimensionsComplete, getMissingDimensionsPrompt,
//   dimensionKeysForShape/requiredDimensionKeysForShape, and normalizeDimensions
//   are pure functions executed directly against data structures.
// - MOCKS: NONE. 100% real logic without external API or browser mocks.

import { describe, it, expect } from 'vitest';
import {
  mergeDimensions,
  isDimensionsComplete,
  getMissingDimensionsPrompt,
  dimensionKeysForShape,
  requiredDimensionKeysForShape,
  normalizeDimensions,
  SHAPE_DIMENSION_KEYS,
} from '../dimensionMerger';
import type { VoiceDimensionsValue } from '../../types/voice';

const dims = (overrides: Partial<VoiceDimensionsValue> = {}): VoiceDimensionsValue => ({
  length: null,
  width: null,
  height: null,
  diameter: null,
  thickness: null,
  unit: null,
  approximate: false,
  ...overrides,
});

describe('shape -> dimension keys (Stage 6.5)', () => {
  it('box needs length, width, height (all required)', () => {
    expect(SHAPE_DIMENSION_KEYS.box).toEqual({ required: ['length', 'width', 'height'], optional: [] });
    expect(requiredDimensionKeysForShape('box')).toEqual(['length', 'width', 'height']);
    expect(dimensionKeysForShape('box')).toEqual(['length', 'width', 'height']);
  });

  it('flat needs length + width required, thickness optional (never height)', () => {
    expect(requiredDimensionKeysForShape('flat')).toEqual(['length', 'width']);
    expect(dimensionKeysForShape('flat')).toEqual(['length', 'width', 'thickness']);
    expect(requiredDimensionKeysForShape('flat')).not.toContain('height');
  });

  it('round needs height + diameter (never length or width)', () => {
    expect(requiredDimensionKeysForShape('round')).toEqual(['height', 'diameter']);
    expect(dimensionKeysForShape('round')).toEqual(['height', 'diameter']);
    expect(requiredDimensionKeysForShape('round')).not.toContain('length');
    expect(requiredDimensionKeysForShape('round')).not.toContain('width');
  });
});

describe('mergeDimensions (real logic)', () => {
  it('initializes dimensions from incoming partial answer when previous is null', () => {
    const incoming = dims({ width: 2, unit: 'ft' });
    const merged = mergeDimensions(null, incoming);
    expect(merged).toEqual(dims({ width: 2, unit: 'ft' }));
    expect(isDimensionsComplete(merged, ['length', 'width', 'height'])).toBe(false);
  });

  it('merges subsequent spoken dimensions with previously heard dimensions', () => {
    const step1 = dims({ width: 2, unit: 'ft' }); // "width 2 feet"
    const step2 = dims({ length: 4, height: 3 }); // "length 4, height 3"
    const merged = mergeDimensions(step1, step2);
    expect(merged).toEqual(dims({ length: 4, width: 2, height: 3, unit: 'ft' }));
    expect(isDimensionsComplete(merged, ['length', 'width', 'height'])).toBe(true);
  });

  it('allows incoming unit to override previous unit if explicitly stated', () => {
    const step1 = dims({ length: 10, width: 20, height: 30, unit: 'in' });
    const step2 = dims({ unit: 'cm' });
    const merged = mergeDimensions(step1, step2);
    expect(merged.unit).toBe('cm');
    expect(merged.length).toBe(10);
  });

  it('merges diameter and thickness the same way as the original three', () => {
    const step1 = dims({ diameter: 20, unit: 'cm' });
    const step2 = dims({ height: 15 });
    expect(mergeDimensions(step1, step2)).toEqual(dims({ diameter: 20, height: 15, unit: 'cm' }));

    const flat1 = dims({ length: 200, width: 90, unit: 'cm' });
    const flat2 = dims({ thickness: 0.2, unit: 'cm' });
    expect(mergeDimensions(flat1, flat2)).toEqual(dims({ length: 200, width: 90, thickness: 0.2, unit: 'cm' }));
  });

  it('approximate is sticky: once hedged, a later precise-looking value keeps it true', () => {
    const hedged = mergeDimensions(null, dims({ length: 6, unit: 'ft', approximate: true }));
    expect(hedged.approximate).toBe(true);
    const stillHedged = mergeDimensions(hedged, dims({ width: 3, unit: 'ft', approximate: false }));
    expect(stillHedged.approximate).toBe(true);
    expect(stillHedged.width).toBe(3);
  });

  it('starts as not approximate when nothing hedged', () => {
    expect(mergeDimensions(null, dims({ length: 5, unit: 'ft' })).approximate).toBe(false);
  });
});

describe('isDimensionsComplete (shape-aware, real logic)', () => {
  it('defaults to length/width/height (box-equivalent) for backward compatibility', () => {
    expect(isDimensionsComplete(null)).toBe(false);
    expect(isDimensionsComplete(dims({ length: 4, width: 2, unit: 'ft' }))).toBe(false); // no height
    expect(isDimensionsComplete(dims({ length: 4, width: 2, height: 3, unit: 'ft' }))).toBe(true);
    expect(isDimensionsComplete(dims({ length: 4, width: 2, height: 3, unit: null }))).toBe(false); // no unit
  });

  it('round (height + diameter): complete WITHOUT length/width; incomplete without diameter', () => {
    const requiredKeys = requiredDimensionKeysForShape('round');
    expect(isDimensionsComplete(dims({ height: 30, diameter: 20, unit: 'cm' }), requiredKeys)).toBe(true);
    expect(isDimensionsComplete(dims({ height: 30, unit: 'cm' }), requiredKeys)).toBe(false); // missing diameter
    // A stray length value (never asked for a pot) does not make it "more complete" or interfere
    expect(isDimensionsComplete(dims({ height: 30, diameter: 20, length: 999, unit: 'cm' }), requiredKeys)).toBe(true);
  });

  it('flat (length + width required, thickness NOT required): complete without thickness or height', () => {
    const requiredKeys = requiredDimensionKeysForShape('flat');
    expect(isDimensionsComplete(dims({ length: 200, width: 90, unit: 'cm' }), requiredKeys)).toBe(true);
    expect(isDimensionsComplete(dims({ length: 200, unit: 'cm' }), requiredKeys)).toBe(false); // missing width
  });
});

describe('getMissingDimensionsPrompt (shape-aware, real logic)', () => {
  it('a pot (round) is never asked for width — only height and diameter appear', () => {
    const requiredKeys = requiredDimensionKeysForShape('round');
    const empty = getMissingDimensionsPrompt(dims(), requiredKeys, 'hi');
    expect(empty.hi).toContain('ऊंचाई');
    expect(empty.hi).toContain('व्यास');
    expect(empty.hi).not.toContain('चौड़ाई');
    expect(empty.en).not.toContain('width');
    expect(empty.en).not.toContain('length');
  });

  it('a dupatta (flat) is never asked for height', () => {
    const requiredKeys = requiredDimensionKeysForShape('flat');
    const partial = getMissingDimensionsPrompt(dims({ length: 2, unit: 'm' }), requiredKeys, 'hi');
    expect(partial.hi).toContain('मैंने लंबाई 2 मीटर सुनी');
    expect(partial.hi).toContain('चौड़ाई');
    expect(partial.hi).not.toContain('ऊंचाई');
    expect(partial.en).not.toContain('height');
  });

  it('generates a bilingual follow-up stating what was heard and what is still needed (box)', () => {
    const requiredKeys = requiredDimensionKeysForShape('box');
    const partial = dims({ width: 2, unit: 'ft' });
    const prompt = getMissingDimensionsPrompt(partial, requiredKeys, 'hi');
    expect(prompt.en).toContain('I heard width 2 ft. Please tell me the length and height.');
    expect(prompt.hi).toContain('मैंने चौड़ाई 2 फीट सुनी। कृपया लंबाई और ऊंचाई बताइए।');
    expect(prompt.spoken).toBe(prompt.hi);

    const promptEn = getMissingDimensionsPrompt(partial, requiredKeys, 'en');
    expect(promptEn.spoken).toBe(promptEn.en);

    const promptMr = getMissingDimensionsPrompt(partial, requiredKeys, 'mr');
    expect(promptMr.spoken).toContain('रुंदी');
  });

  it('generates a complete request prompt when nothing has been heard yet (defaults to box keys)', () => {
    const prompt = getMissingDimensionsPrompt(dims(), undefined, 'hi');
    expect(prompt.hi).toBe('कृपया लंबाई, चौड़ाई, ऊंचाई, और माप की इकाई बताइए।');
    expect(prompt.en).toBe('Please tell me the length, width, height, and measurement unit.');
  });

  it('mentions the unit as still-missing only when it was not heard', () => {
    const requiredKeys = requiredDimensionKeysForShape('round');
    const prompt = getMissingDimensionsPrompt(dims({ height: 10, diameter: 5, unit: null }), requiredKeys, 'en');
    expect(prompt.en).toContain('unit');
  });
});

describe('normalizeDimensions (unit conversion + volume/area, real logic)', () => {
  it('converts feet, inches, meters, and cm to centimetres', () => {
    expect(normalizeDimensions(dims({ length: 1, width: 1, height: 1, unit: 'ft' }), 'box').length_cm).toBeCloseTo(30.48, 2);
    expect(normalizeDimensions(dims({ length: 1, width: 1, height: 1, unit: 'in' }), 'box').length_cm).toBeCloseTo(2.54, 2);
    expect(normalizeDimensions(dims({ length: 1, width: 1, height: 1, unit: 'm' }), 'box').length_cm).toBeCloseTo(100, 2);
    expect(normalizeDimensions(dims({ length: 1, width: 1, height: 1, unit: 'cm' }), 'box').length_cm).toBeCloseTo(1, 2);
  });

  it('box: volume_cm3 = L x W x H, converted to cm first', () => {
    // A 2ft x 3ft x 1ft box
    const result = normalizeDimensions(dims({ length: 2, width: 3, height: 1, unit: 'ft' }), 'box');
    const L = 2 * 30.48;
    const W = 3 * 30.48;
    const H = 1 * 30.48;
    expect(result.length_cm).toBeCloseTo(L, 1);
    expect(result.width_cm).toBeCloseTo(W, 1);
    expect(result.height_cm).toBeCloseTo(H, 1);
    expect(result.volume_cm3).toBeCloseTo(L * W * H, 0);
    expect(result.area_cm2).toBeUndefined();
    expect(result.shape).toBe('box');
    expect(result.unit).toBe('cm');
  });

  it('round: volume_cm3 = pi x (d/2)^2 x h (cylinder)', () => {
    // A pot: 20cm diameter, 30cm height
    const result = normalizeDimensions(dims({ diameter: 20, height: 30, unit: 'cm' }), 'round');
    const expectedVolume = Math.PI * 10 * 10 * 30;
    expect(result.diameter_cm).toBeCloseTo(20, 2);
    expect(result.height_cm).toBeCloseTo(30, 2);
    expect(result.volume_cm3).toBeCloseTo(expectedVolume, 0);
  });

  it('round with inches: converts before computing cylinder volume', () => {
    // 4in diameter, 6in height
    const result = normalizeDimensions(dims({ diameter: 4, height: 6, unit: 'in' }), 'round');
    const d = 4 * 2.54;
    const h = 6 * 2.54;
    const expectedVolume = Math.PI * (d / 2) * (d / 2) * h;
    expect(result.volume_cm3).toBeCloseTo(expectedVolume, 0);
  });

  it('flat: area_cm2 = L x W; volume_cm3 present only when thickness was given', () => {
    const noThickness = normalizeDimensions(dims({ length: 200, width: 90, unit: 'cm' }), 'flat');
    expect(noThickness.area_cm2).toBeCloseTo(200 * 90, 0);
    expect(noThickness.volume_cm3).toBeUndefined();

    const withThickness = normalizeDimensions(dims({ length: 200, width: 90, thickness: 0.5, unit: 'cm' }), 'flat');
    expect(withThickness.area_cm2).toBeCloseTo(200 * 90, 0);
    expect(withThickness.volume_cm3).toBeCloseTo(200 * 90 * 0.5, 0);
  });

  it('flat with feet: converts length/width/thickness before computing area and volume', () => {
    const result = normalizeDimensions(dims({ length: 1, width: 1, thickness: 1, unit: 'ft' }), 'flat');
    const side = 30.48;
    expect(result.area_cm2).toBeCloseTo(side * side, 1);
    expect(result.volume_cm3).toBeCloseTo(side * side * side, 0);
  });

  it('omits volume/area when required inputs are missing (does not fabricate a number)', () => {
    expect(normalizeDimensions(dims({ length: 10, width: 10, unit: 'cm' }), 'box').volume_cm3).toBeUndefined();
    expect(normalizeDimensions(dims({ diameter: 10, unit: 'cm' }), 'round').volume_cm3).toBeUndefined();
    expect(normalizeDimensions(dims({ length: 10, unit: 'cm' }), 'flat').area_cm2).toBeUndefined();
  });

  it('carries the approximate flag through unchanged', () => {
    expect(normalizeDimensions(dims({ length: 1, unit: 'cm', approximate: true }), 'box').approximate).toBe(true);
    expect(normalizeDimensions(dims({ length: 1, unit: 'cm', approximate: false }), 'box').approximate).toBe(false);
  });

  it('throws rather than guessing a unit when unit is missing', () => {
    expect(() => normalizeDimensions(dims({ length: 1 }), 'box')).toThrow('no unit set');
  });
});
