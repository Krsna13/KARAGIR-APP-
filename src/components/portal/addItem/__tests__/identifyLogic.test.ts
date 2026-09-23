/**
 * Stage 6.4: Identify step pure logic — REAL LOGIC, no mocks.
 * identifyLogic.ts: completeness (canProceed(1)), photos-changed detection,
 * identification_source rules and question wording (incl. low confidence).
 */
import { describe, it, expect } from 'vitest';
import {
  buildIdentificationPhotos,
  buildQuestionText,
  computeIdentificationSource,
  havePhotosChanged,
  isIdentifyStepComplete,
  type ConfirmedIdentification,
} from '../steps/identifyLogic';
import type { ProductAiIdentification } from '../../../../types/product';

const ai: ProductAiIdentification = {
  item_name: 'Carved Mandir',
  material: 'Teak Wood',
  category: 'Woodwork',
  confidence: 0.9,
  short_description: 'A carved temple.',
  secondary_materials: ['Brass inlay'],
  finish: 'polished',
  complexity: 'intricate',
  complexity_reason: 'Deep carving on every panel.',
  shape_profile: 'box',
  item_name_spoken: 'नक्काशीदार मंदिर',
  material_spoken: 'सागवान',
};

const accepted: ConfirmedIdentification = {
  item_type: 'Carved Mandir',
  material: 'Teak Wood',
  category: 'Woodwork',
  complexity: 'intricate',
  shape_profile: 'box',
  secondary_materials: ['Brass inlay'],
  finish: 'polished',
};

describe('isIdentifyStepComplete (canProceed(1))', () => {
  it('needs item_type, material, category, complexity and shape_profile', () => {
    expect(isIdentifyStepComplete(accepted)).toBe(true);
    for (const key of ['item_type', 'material', 'category', 'complexity', 'shape_profile'] as const) {
      expect(isIdentifyStepComplete({ ...accepted, [key]: null })).toBe(false);
    }
    expect(isIdentifyStepComplete({ ...accepted, item_type: '   ' })).toBe(false);
    expect(isIdentifyStepComplete(null)).toBe(false);
  });

  it('optional extras do not affect it', () => {
    const withoutExtras: ConfirmedIdentification = { ...accepted, secondary_materials: null, finish: null };
    expect(isIdentifyStepComplete(withoutExtras)).toBe(true);
  });
});

describe('computeIdentificationSource', () => {
  it("'ai_confirmed' when every AI guess was accepted unchanged", () => {
    expect(computeIdentificationSource(ai, accepted)).toBe('ai_confirmed');
    // case / whitespace / order differences are not corrections
    expect(
      computeIdentificationSource(ai, { ...accepted, item_type: ' carved mandir ', secondary_materials: ['brass INLAY'] })
    ).toBe('ai_confirmed');
  });

  it("'artisan_corrected' when any single guess changed", () => {
    const changes: Partial<ConfirmedIdentification>[] = [
      { item_type: 'Wall Shelf' },
      { material: 'Sheesham Wood' },
      { category: 'Furniture' },
      { complexity: 'simple' },
      { shape_profile: 'flat' },
      { secondary_materials: [] },
      { secondary_materials: ['Brass inlay', 'Cane'] },
      { finish: 'unknown' },
    ];
    for (const change of changes) {
      expect(computeIdentificationSource(ai, { ...accepted, ...change })).toBe('artisan_corrected');
    }
  });

  it('fields the AI did not return are not guesses, so choosing them does not count as a correction', () => {
    const partialAi: ProductAiIdentification = { ...ai, complexity: undefined, complexity_reason: undefined, shape_profile: undefined };
    expect(computeIdentificationSource(partialAi, { ...accepted, complexity: 'simple', shape_profile: 'round' })).toBe(
      'ai_confirmed'
    );
  });

  it("no AI result (identification failed, all manual) is always 'artisan_corrected'", () => {
    expect(computeIdentificationSource(null, accepted)).toBe('artisan_corrected');
  });
});

describe('havePhotosChanged', () => {
  const photos = [
    { id: 'a', is_cover: true },
    { id: 'b', is_cover: false },
    { id: 'c', is_cover: false },
  ];
  const recorded = buildIdentificationPhotos(['a', 'b', 'c'], 'a', photos);

  it('false when there was no identification run, or nothing changed (order irrelevant)', () => {
    expect(havePhotosChanged(null, photos)).toBe(false);
    expect(havePhotosChanged(recorded, [...photos].reverse())).toBe(false);
  });

  it('true when the cover changed', () => {
    expect(havePhotosChanged(recorded, photos.map((p) => ({ ...p, is_cover: p.id === 'b' })))).toBe(true);
  });

  it('true when a photo was added (even one that would not have been sent) or removed', () => {
    expect(havePhotosChanged(recorded, [...photos, { id: 'd', is_cover: false }])).toBe(true);
    expect(havePhotosChanged(recorded, photos.filter((p) => p.id !== 'c'))).toBe(true);
    // same count, one swapped
    expect(havePhotosChanged(recorded, [photos[0], photos[1], { id: 'z', is_cover: false }])).toBe(true);
  });

  it('records the used ids separately from all ids (413 cover-only run)', () => {
    expect(buildIdentificationPhotos(['a'], 'a', photos)).toEqual({
      used_image_ids: ['a'],
      cover_image_id: 'a',
      all_image_ids: ['a', 'b', 'c'],
    });
  });
});

describe('buildQuestionText', () => {
  it('asks "Is this a ...?" at normal confidence and "Could this be a ...?" below 0.6', () => {
    expect(buildQuestionText('item_type', ai, 'en').en).toBe('Is this a Carved Mandir?');
    const low = { ...ai, confidence: 0.59 };
    expect(buildQuestionText('item_type', low, 'en').en).toBe('Could this be a Carved Mandir?');
    expect(buildQuestionText('item_type', { ...ai, confidence: 0.6 }, 'en').en).toBe('Is this a Carved Mandir?');
  });

  it('speaks in the artisan language using item_name_spoken / material_spoken when present', () => {
    expect(buildQuestionText('item_type', ai, 'hi').spoken).toBe('क्या यह नक्काशीदार मंदिर है?');
    expect(buildQuestionText('item_type', { ...ai, confidence: 0.4 }, 'hi').spoken).toBe(
      'क्या यह नक्काशीदार मंदिर हो सकता है?'
    );
    expect(buildQuestionText('material', ai, 'mr').spoken).toBe('हे सागवान पासून बनवले आहे का?');
    // Falls back to the English name when no spoken form was returned
    const noSpoken = { ...ai, item_name_spoken: undefined };
    expect(buildQuestionText('item_type', noSpoken, 'hi').spoken).toBe('क्या यह Carved Mandir है?');
  });

  it('reads complexity_reason only when the AI returned a complexity', () => {
    expect(buildQuestionText('complexity', ai, 'hi').spoken).toBe('काम कितना बारीक है? Deep carving on every panel.');
    expect(buildQuestionText('complexity', null, 'hi').spoken).toBe('काम कितना बारीक है?');
  });

  it('without a guess the question never names a value', () => {
    const q = buildQuestionText('item_type', null, 'en');
    expect(q.en).toBe('What is this item?');
    expect(buildQuestionText('material', null, 'hi').spoken).not.toContain('Teak');
  });
});
