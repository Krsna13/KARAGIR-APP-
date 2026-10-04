// src/components/portal/addItem/__tests__/patchValidator.test.ts
// Stage 6.6b Fix A: Compile-time and runtime validation for saveDraft ProductDraftPatch.

import { describe, it, expect } from 'vitest';
import { assertValidProductPatch } from '../../../../lib/patchValidator';
import type { ProductDraftPatch } from '../steps/PreviewStep';

describe('Fix A: ProductDraftPatch typing and patch validator', () => {
  it('compile-time test: ProductDraftPatch rejects non-column keys', () => {
    // Valid patch with known database columns compiles cleanly
    const validPatch: ProductDraftPatch = {
      title_en: 'Handmade Wooden Tray',
      listing_approved: false,
      summary_spoken: 'A spoken summary',
    };
    expect(validPatch.title_en).toBe('Handmade Wooden Tray');

    // Compile-time test proving non-column keys are rejected:
    // @ts-expect-error - 'non_column_key' does not exist in generated ProductUpdate
    const invalidPatch: ProductDraftPatch = { non_column_key: 'invalid' };
    void invalidPatch;
  });

  it('runtime test: assertValidProductPatch passes for valid column keys', () => {
    expect(() => {
      assertValidProductPatch({
        title_en: 'Clay Pot',
        price: 500,
        listing_approved: true,
        summary_spoken: 'Spoken summary',
      });
    }).not.toThrow();
  });

  it('runtime test: assertValidProductPatch throws descriptive error on unknown columns', () => {
    expect(() => {
      assertValidProductPatch({
        title_en: 'Clay Pot',
        unknown_app_field: 'bad',
      });
    }).toThrow(/contains key\(s\) not present in generated products Update type: unknown_app_field/i);
  });
});
