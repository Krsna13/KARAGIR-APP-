/**
 * Stage 6.5: Describe step pure logic — REAL LOGIC, no mocks.
 * describeLogic.ts: raw<->voice dimension conversion, canProceed(2)
 * completeness, the resume step machine, and AI-facts detection.
 */
import { describe, it, expect } from 'vitest';
import {
  rawDimensionsToVoiceValue,
  voiceValueToRawDimensions,
  isDimensionsRawComplete,
  isDescribeStepComplete,
  nextRequiredStep,
  describeAnswersFromDraft,
  hasAiDescribeFacts,
  aiFactsFrom,
  type DescribeAnswers,
} from '../steps/describeLogic';
import type { ProductAiIdentification, ProductDimensionsRaw } from '../../../../types/product';

const answers = (overrides: Partial<DescribeAnswers> = {}): DescribeAnswers => ({
  dimensions: null,
  technique: null,
  labor_days: null,
  availability: null,
  quantity_available: null,
  lead_time_days: null,
  ...overrides,
});

describe('raw <-> voice dimension conversion', () => {
  it('round-trips a box answer', () => {
    const voice = { length: 60, width: 40, height: 30, diameter: null, thickness: null, unit: 'cm' as const, approximate: false };
    const raw = voiceValueToRawDimensions(voice, 'box');
    expect(raw).toEqual({ shape: 'box', values: { length: 60, width: 40, height: 30 }, unit: 'cm', approximate: false });
    expect(rawDimensionsToVoiceValue(raw)).toEqual(voice);
  });

  it('round shape: only height + diameter go into `values`, never length/width', () => {
    const voice = { length: null, width: null, height: 30, diameter: 20, thickness: null, unit: 'cm' as const, approximate: true };
    const raw = voiceValueToRawDimensions(voice, 'round')!;
    expect(raw.values).toEqual({ height: 30, diameter: 20 });
    expect(raw.approximate).toBe(true);
  });

  it('flat shape: length + width, thickness only when given', () => {
    const withoutThickness = voiceValueToRawDimensions(
      { length: 200, width: 90, height: null, diameter: null, thickness: null, unit: 'cm', approximate: false },
      'flat'
    )!;
    expect(withoutThickness.values).toEqual({ length: 200, width: 90 });

    const withThickness = voiceValueToRawDimensions(
      { length: 200, width: 90, height: null, diameter: null, thickness: 0.5, unit: 'cm', approximate: false },
      'flat'
    )!;
    expect(withThickness.values).toEqual({ length: 200, width: 90, thickness: 0.5 });
  });

  it('returns null when there is no unit (nothing meaningful to save)', () => {
    expect(voiceValueToRawDimensions({ length: 5, width: null, height: null, diameter: null, thickness: null, unit: null, approximate: false }, 'box')).toBeNull();
  });

  it('rawDimensionsToVoiceValue on null/undefined returns an empty value, not a crash', () => {
    expect(rawDimensionsToVoiceValue(null)).toEqual({
      length: null, width: null, height: null, diameter: null, thickness: null, unit: null, approximate: false,
    });
  });
});

describe('isDimensionsRawComplete', () => {
  it('round: complete with height+diameter, incomplete without diameter, ignores a stray shape mismatch', () => {
    const complete: ProductDimensionsRaw = { shape: 'round', values: { height: 30, diameter: 20 }, unit: 'cm', approximate: false };
    expect(isDimensionsRawComplete(complete, 'round')).toBe(true);
    const missing: ProductDimensionsRaw = { shape: 'round', values: { height: 30 }, unit: 'cm', approximate: false };
    expect(isDimensionsRawComplete(missing, 'round')).toBe(false);
    // Saved for a different shape (e.g. stale from before a shape correction) never satisfies the current shape.
    expect(isDimensionsRawComplete(complete, 'box')).toBe(false);
  });

  it('flat: complete without thickness (thickness is optional)', () => {
    const flat: ProductDimensionsRaw = { shape: 'flat', values: { length: 200, width: 90 }, unit: 'cm', approximate: false };
    expect(isDimensionsRawComplete(flat, 'flat')).toBe(true);
  });

  it('null/no-unit is never complete', () => {
    expect(isDimensionsRawComplete(null, 'box')).toBe(false);
  });
});

describe('isDescribeStepComplete (canProceed(2))', () => {
  const boxDims: ProductDimensionsRaw = { shape: 'box', values: { length: 10, width: 10, height: 10 }, unit: 'cm', approximate: false };

  it('needs dimensions, technique, labor_days, availability, and the matching count field', () => {
    const ready = answers({ dimensions: boxDims, technique: 'hand-carved', labor_days: 3, availability: 'ready', quantity_available: 2 });
    expect(isDescribeStepComplete(ready, 'box')).toBe(true);

    const madeToOrder = answers({ dimensions: boxDims, technique: 'hand-carved', labor_days: 3, availability: 'made_to_order', lead_time_days: 10 });
    expect(isDescribeStepComplete(madeToOrder, 'box')).toBe(true);
  });

  it("'ready' without quantity_available is incomplete, even with lead_time_days set", () => {
    const a = answers({ dimensions: boxDims, technique: 'hand-carved', labor_days: 3, availability: 'ready', lead_time_days: 10 });
    expect(isDescribeStepComplete(a, 'box')).toBe(false);
  });

  it("'made_to_order' without lead_time_days is incomplete, even with quantity_available set", () => {
    const a = answers({ dimensions: boxDims, technique: 'hand-carved', labor_days: 3, availability: 'made_to_order', quantity_available: 5 });
    expect(isDescribeStepComplete(a, 'box')).toBe(false);
  });

  it('missing dimensions, technique, labor_days, or availability each block completion', () => {
    const full = answers({ dimensions: boxDims, technique: 'hand-carved', labor_days: 3, availability: 'ready', quantity_available: 2 });
    expect(isDescribeStepComplete({ ...full, dimensions: null }, 'box')).toBe(false);
    expect(isDescribeStepComplete({ ...full, technique: null }, 'box')).toBe(false);
    expect(isDescribeStepComplete({ ...full, labor_days: null }, 'box')).toBe(false);
    expect(isDescribeStepComplete({ ...full, availability: null }, 'box')).toBe(false);
  });

  it('labor_days of exactly 0 is allowed (same-day finish); negative is not', () => {
    const full = answers({ dimensions: boxDims, technique: 'hand-carved', availability: 'ready', quantity_available: 1 });
    expect(isDescribeStepComplete({ ...full, labor_days: 0 }, 'box')).toBe(true);
    expect(isDescribeStepComplete({ ...full, labor_days: -1 }, 'box')).toBe(false);
  });

  it('no shape (should not happen after step 1) is always incomplete', () => {
    const full = answers({ dimensions: boxDims, technique: 'hand-carved', labor_days: 3, availability: 'ready', quantity_available: 2 });
    expect(isDescribeStepComplete(full, null)).toBe(false);
  });
});

describe('nextRequiredStep (resume machine)', () => {
  const boxDims: ProductDimensionsRaw = { shape: 'box', values: { length: 10, width: 10, height: 10 }, unit: 'cm', approximate: false };

  it('starts at dimensions when nothing is answered', () => {
    expect(nextRequiredStep(answers(), 'box')).toBe('dimensions');
    expect(nextRequiredStep(answers(), 'round')).toBe('dimensions');
  });

  it('box/round skip the thickness step entirely', () => {
    expect(nextRequiredStep(answers({ dimensions: boxDims }), 'box')).toBe('technique');
    const roundDims: ProductDimensionsRaw = { shape: 'round', values: { height: 10, diameter: 10 }, unit: 'cm', approximate: false };
    expect(nextRequiredStep(answers({ dimensions: roundDims }), 'round')).toBe('technique');
  });

  it('flat shape offers the optional thickness step once, before technique', () => {
    const flatDims: ProductDimensionsRaw = { shape: 'flat', values: { length: 10, width: 10 }, unit: 'cm', approximate: false };
    expect(nextRequiredStep(answers({ dimensions: flatDims }), 'flat')).toBe('dimensions_thickness');
    // Once technique is answered (thickness was shown & skipped or answered), it is never re-offered.
    expect(nextRequiredStep(answers({ dimensions: flatDims, technique: 'handloom-woven' }), 'flat')).toBe('labor_days');
  });

  it('progresses technique -> labor_days -> availability -> availability_followup -> done', () => {
    let a = answers({ dimensions: boxDims });
    a = { ...a, technique: 'hand-carved' };
    expect(nextRequiredStep(a, 'box')).toBe('labor_days');
    a = { ...a, labor_days: 5 };
    expect(nextRequiredStep(a, 'box')).toBe('availability');
    a = { ...a, availability: 'ready' };
    expect(nextRequiredStep(a, 'box')).toBe('availability_followup');
    a = { ...a, quantity_available: 3 };
    expect(nextRequiredStep(a, 'box')).toBe('done');
  });

  it('made_to_order branch resumes at availability_followup until lead_time_days is set', () => {
    let a = answers({ dimensions: boxDims, technique: 'hand-carved', labor_days: 5, availability: 'made_to_order' });
    expect(nextRequiredStep(a, 'box')).toBe('availability_followup');
    a = { ...a, lead_time_days: 7 };
    expect(nextRequiredStep(a, 'box')).toBe('done');
  });
});

describe('describeAnswersFromDraft', () => {
  it('reads the six fields from a draft, defaulting missing ones to null', () => {
    expect(describeAnswersFromDraft({ technique: 'wheel-thrown', labor_days: 4 })).toEqual(
      answers({ technique: 'wheel-thrown', labor_days: 4 })
    );
    expect(describeAnswersFromDraft(null)).toEqual(answers());
  });
});

describe('hasAiDescribeFacts / aiFactsFrom', () => {
  it('true when any of the four fields has content', () => {
    expect(hasAiDescribeFacts(null)).toBe(false);
    expect(hasAiDescribeFacts({} as ProductAiIdentification)).toBe(false);
    expect(hasAiDescribeFacts({ visible_features: [] } as unknown as ProductAiIdentification)).toBe(false);
    expect(hasAiDescribeFacts({ visible_features: ['brass handles'] } as unknown as ProductAiIdentification)).toBe(true);
    expect(hasAiDescribeFacts({ colors: ['brown'] } as unknown as ProductAiIdentification)).toBe(true);
    expect(hasAiDescribeFacts({ style: 'traditional' } as unknown as ProductAiIdentification)).toBe(true);
    expect(hasAiDescribeFacts({ style: 'unknown' } as unknown as ProductAiIdentification)).toBe(false);
    expect(hasAiDescribeFacts({ suggested_use: ['gifting'] } as unknown as ProductAiIdentification)).toBe(true);
  });

  it("aiFactsFrom treats style 'unknown' the same as no style, and defaults arrays to []", () => {
    expect(aiFactsFrom(null)).toEqual({ visible_features: [], colors: [], style: null, suggested_use: [] });
    expect(aiFactsFrom({ style: 'unknown' } as unknown as ProductAiIdentification).style).toBeNull();
    expect(aiFactsFrom({ style: 'rustic' } as unknown as ProductAiIdentification).style).toBe('rustic');
  });
});
