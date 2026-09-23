/**
 * Stage 6.5: technique options config — REAL LOGIC, no mocks.
 * Structural checks that each category's list matches the spec, every entry
 * has an icon + bilingual label, and ids are unique within a category.
 */
import { describe, it, expect } from 'vitest';
import { TECHNIQUE_OPTIONS_BY_CATEGORY, getTechniqueOptions, techniqueVoiceChoices } from '../techniqueOptions';

describe('TECHNIQUE_OPTIONS_BY_CATEGORY', () => {
  it('Woodwork and Furniture share: hand-carved, hand-turned (lathe), hand-joined, partly machine', () => {
    const expected = ['hand-carved', 'hand-turned-lathe', 'hand-joined', 'partly-machine'];
    expect(TECHNIQUE_OPTIONS_BY_CATEGORY.Woodwork.map((t) => t.id)).toEqual(expected);
    expect(TECHNIQUE_OPTIONS_BY_CATEGORY.Furniture.map((t) => t.id)).toEqual(expected);
  });

  it('Pottery: wheel-thrown, hand-built, moulded', () => {
    expect(TECHNIQUE_OPTIONS_BY_CATEGORY.Pottery.map((t) => t.id)).toEqual(['wheel-thrown', 'hand-built', 'moulded']);
  });

  it('Brasscraft and Metal share: hand-cast, hand-beaten, engraved, partly machine', () => {
    const expected = ['hand-cast', 'hand-beaten', 'engraved', 'partly-machine'];
    expect(TECHNIQUE_OPTIONS_BY_CATEGORY.Brasscraft.map((t) => t.id)).toEqual(expected);
    expect(TECHNIQUE_OPTIONS_BY_CATEGORY.Metal.map((t) => t.id)).toEqual(expected);
  });

  it('Textile: handloom-woven, hand-block printed, hand-embroidered, partly machine', () => {
    expect(TECHNIQUE_OPTIONS_BY_CATEGORY.Textile.map((t) => t.id)).toEqual([
      'handloom-woven', 'hand-block-printed', 'hand-embroidered', 'partly-machine',
    ]);
  });

  it('every option has an icon component and non-empty bilingual (en/hi/mr) labels', () => {
    for (const options of Object.values(TECHNIQUE_OPTIONS_BY_CATEGORY)) {
      for (const option of options) {
        expect(typeof option.icon).toBe('object'); // lucide-react icons are forwardRef objects
        expect(option.en.trim().length).toBeGreaterThan(0);
        expect(option.hi.trim().length).toBeGreaterThan(0);
        expect(option.mr.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('ids are unique within each category', () => {
    for (const options of Object.values(TECHNIQUE_OPTIONS_BY_CATEGORY)) {
      const ids = options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every one of the six categories in IdentifiedProductCategory is configured', () => {
    for (const category of ['Woodwork', 'Pottery', 'Brasscraft', 'Textile', 'Furniture', 'Metal'] as const) {
      expect(TECHNIQUE_OPTIONS_BY_CATEGORY[category].length).toBeGreaterThan(0);
    }
  });
});

describe('getTechniqueOptions / techniqueVoiceChoices', () => {
  it('returns the right list for a category, and [] for null/undefined', () => {
    expect(getTechniqueOptions('Pottery').map((t) => t.id)).toEqual(['wheel-thrown', 'hand-built', 'moulded']);
    expect(getTechniqueOptions(null)).toEqual([]);
    expect(getTechniqueOptions(undefined)).toEqual([]);
  });

  it('techniqueVoiceChoices mirrors the icon cards as {id, label_en, label_hi}', () => {
    const choices = techniqueVoiceChoices('Pottery');
    expect(choices).toEqual([
      { id: 'wheel-thrown', label_en: 'Wheel-thrown', label_hi: 'चाक पर बनाया गया' },
      { id: 'hand-built', label_en: 'Hand-built', label_hi: 'हाथ से बनाया गया' },
      { id: 'moulded', label_en: 'Moulded', label_hi: 'सांचे में ढाला गया' },
    ]);
  });
});
