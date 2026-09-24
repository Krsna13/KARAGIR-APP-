/**
 * Stage 6.6: Listing validation and pure logic unit tests.
 *
 * REAL LOGIC under test (NO MOCKS):
 * - validateListingResult: strict No-Fabrication enforcement
 * - extractAllowedNumbers: dimension values, cm-conversions, labor, quantity, lead time, artisan inputs
 * - Price & currency rejection
 * - Risky claims detection and story verification
 * - Experience years rules (unset rejected, '0 years' rejected, valid accepted)
 * - computeFactsHash: stability and change detection
 * - generateSimpleListing: deterministic fallback template compliance with all rules
 */

import { describe, it, expect } from 'vitest';
import {
  validateListingResult,
  extractAllowedNumbers,
  extractNumbersFromText,
  devanagariToStandardDigits,
  type ListingOutput,
  type ProductFactsInput,
  type ArtisanListingProfile,
} from '../../../../../supabase/functions/generate-listing/validation';
import {
  computeFactsHash,
  haveFactsChanged,
  generateSimpleListing,
  canProceedPreview,
  isListingPresent,
} from '../steps/listingLogic';
import type { ProductRecord } from '../../../../types/product';
import { assertValidProductPatch } from './patchValidator';

const sampleFacts: ProductFactsInput = {
  item_type: 'Diya',
  material: 'Clay',
  category: 'Pottery',
  secondary_materials: ['Natural Glaze'],
  finish: 'natural',
  complexity: 'simple',
  shape_profile: 'round',
  visible_features: ['fluted rim'],
  colors: ['terracotta'],
  style: 'traditional',
  suggested_use: ['puja', 'home decor'],
  dimensions: {
    shape: 'round',
    values: { height: 10, diameter: 15 },
    unit: 'cm',
    approximate: false,
  },
  normalized_dimensions: { height: 10, diameter: 15 },
  technique: 'Wheel thrown',
  labor_days: 2,
  availability: 'ready',
  quantity_available: 5,
  lead_time_days: null,
  accepts_customization: false,
  story_original: 'मिट्टी से बना पारंपरिक दीया',
  story_en: 'Traditional diya made of clay',
  care_instructions: 'Clean with dry cloth',
};

const sampleArtisan: ArtisanListingProfile = {
  shop_name: 'Mitti Kala',
  city: 'Jaipur',
  experience_years: 12,
};

const validOutput: ListingOutput = {
  title_en: 'Handmade Terracotta Clay Diya',
  title_hi: 'हस्तनिर्मित मिट्टी का पारंपरिक दीया',
  seo_caption_en: 'Authentic 10 cm high clay diya crafted using traditional wheel thrown pottery.',
  seo_caption_hi: 'पारंपरिक चाक पर तैयार 10 सेमी ऊंचा प्रामाणिक मिट्टी का दीया।',
  highlights_en: [
    'Made with authentic terracotta clay',
    'Wheel thrown artisanal technique',
    'Height 10 cm with 15 cm diameter',
    'Requires 2 days of skilled craft labor',
  ],
  highlights_hi: [
    'प्रामाणिक मिट्टी से हस्तनिर्मित',
    'पारंपरिक चाक शिल्प तकनीक',
    'ऊंचाई 10 सेमी और व्यास 15 सेमी',
    '2 दिनों का कुशल कारीगरी कार्य',
  ],
  description_en:
    'This traditional Diya is carefully wheel thrown using natural Clay in Jaipur. Taking 2 days of dedicated artisan work, it measures 10 cm in height and 15 cm in diameter. Ideal for puja and home decor.',
  description_hi:
    'यह पारंपरिक दीया जयपुर में प्राकृतिक मिट्टी से चाक पर हस्तनिर्मित किया गया है। इसे बनाने में 2 दिनों की कुशल कारीगरी लगी है। इसकी ऊंचाई 10 सेमी और व्यास 15 सेमी है।',
  search_tags: ['mitti diya', 'clay lamp', 'pottery diya', 'terracotta diya', 'puja diya', 'handmade diya', 'wheel thrown pottery', 'jaipur craft'],
  summary_spoken: 'यह 10 सेमी का मिट्टी का दीया चाक पर 2 दिनों में तैयार किया गया है।',
};

describe('devanagariToStandardDigits & extractNumbersFromText', () => {
  it('converts Hindi Devanagari numerals to standard digits', () => {
    expect(devanagariToStandardDigits('ऊंचाई १० सेमी और व्यास १५.५ सेमी')).toBe('ऊंचाई 10 सेमी और व्यास 15.5 सेमी');
    expect(devanagariToStandardDigits('०१२३४५६७८९')).toBe('0123456789');
  });

  it('extracts numbers accurately from mixed English and Hindi text', () => {
    expect(extractNumbersFromText('Dimensions 10 cm x 20.5 cm')).toEqual([10, 20.5]);
    expect(extractNumbersFromText('ऊंचाई १० सेमी व्यास १५ सेमी')).toEqual([10, 15]);
    expect(extractNumbersFromText('No numbers here')).toEqual([]);
  });
});

describe('No-Fabrication Validation Rules', () => {
  it('passes a fully compliant valid listing', () => {
    const res = validateListingResult(validOutput, sampleFacts, sampleArtisan);
    expect(res.ok).toBe(true);
    expect(res.value?.title_en).toBe(validOutput.title_en);
  });

  it('rejects stray numbers not in facts', () => {
    const invalidOutput = {
      ...validOutput,
      description_en: 'Crafted over 45 days with 99 delicate brush strokes.', // 45 and 99 are not in facts!
    };
    const res = validateListingResult(invalidOutput, sampleFacts, sampleArtisan);
    expect(res.ok).toBe(false);
    expect(res.failedRule).toBe('numbers');
    expect(res.error).toContain('unauthorized number');
  });

  it('accepts dimension values and their rounded cm conversions', () => {
    const inchFacts: ProductFactsInput = {
      ...sampleFacts,
      dimensions: {
        shape: 'flat',
        values: { length: 12, width: 8 },
        unit: 'in',
      },
      normalized_dimensions: { length: 30.48, width: 20.32 },
    };

    const allowed = extractAllowedNumbers(inchFacts);
    // Raw inches
    expect(allowed.has(12)).toBe(true);
    expect(allowed.has(8)).toBe(true);
    // Cm values and rounded
    expect(allowed.has(30.48)).toBe(true);
    expect(allowed.has(30)).toBe(true); // Math.round(30.48)
    expect(allowed.has(20.32)).toBe(true);
    expect(allowed.has(20)).toBe(true); // Math.round(20.32)
  });

  it('rejects price or currency mentions (₹, Rs, INR, price, कीमत, etc.)', () => {
    const priceVariants = [
      'Priced at ₹500 only',
      'Affordable at Rs. 400',
      'Best INR price for home decor',
      ' इसकी कीमत बहुत कम है',
      'उचित मूल्य पर उपलब्ध',
      'अच्छे दाम में हस्तशिल्प',
    ];

    for (const text of priceVariants) {
      const outputWithPrice = {
        ...validOutput,
        description_en: `This Diya is carefully crafted. ${text}`,
      };
      const res = validateListingResult(outputWithPrice, sampleFacts, sampleArtisan);
      expect(res.ok).toBe(false);
      expect(res.failedRule).toBe('price');
      expect(res.error).toContain('price or currency');
    }
  });

  it('rejects unverified risky promotional claims unless stated by artisan', () => {
    const riskyTerms = [
      'Features an antique finish',
      'Authentic vintage look for living room',
      'A true heritage craft piece',
      '100% eco-friendly terracotta',
      'Organic clay extracted locally',
      'Certified artisan craft',
      'Official GI tag certified',
      'Award-winning master artisan work',
      'Passed down for generations',
      'Made through centuries of tradition',
      '100% pure clay guarantee',
      'Comes with guaranteed durability',
    ];

    for (const term of riskyTerms) {
      const outputWithRisky = {
        ...validOutput,
        description_en: `Handmade diya. ${term}.`,
      };
      const res = validateListingResult(outputWithRisky, sampleFacts, sampleArtisan);
      expect(res.ok).toBe(false);
      expect(res.failedRule).toBe('risky_claims');
      expect(res.error).toContain('unverified risky claim');
    }
  });

  it('allows risky promotional claim if explicitly mentioned in artisan story or care instructions', () => {
    const factsWithStoryClaim: ProductFactsInput = {
      ...sampleFacts,
      story_original: 'This design has a vintage aesthetic passed down in our village.',
      story_en: 'This design has a vintage aesthetic passed down in our village.',
    };

    const outputWithVintage = {
      ...validOutput,
      description_en:
        'This traditional Diya is carefully wheel thrown with a vintage aesthetic. Taking 2 days of work, it measures 10 cm in height and 15 cm in diameter.',
    };

    const res = validateListingResult(outputWithVintage, factsWithStoryClaim, sampleArtisan);
    expect(res.ok).toBe(true);
  });

  it('allows normal sentence using "सतत" (continuous) without failing sustainable risky claim', () => {
    const outputWithSatat = {
      ...validOutput,
      description_hi:
        'कारीगर सतत अभ्यास और पारंपरिक तकनीकों से यह सुंदर मिट्टी का दीया तैयार करते हैं। 10 सेमी ऊंचाई और 15 सेमी व्यास, 2 दिन की मेहनत।',
    };

    const res = validateListingResult(outputWithSatat, sampleFacts, sampleArtisan);
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('still rejects unverified sustainable claims like "सस्टेनेबल" or "sustainable"', () => {
    const outputWithSustainable = {
      ...validOutput,
      description_hi:
        'यह उत्पाद सस्टेनेबल पर्यावरण सामग्री से बना है। 10 सेमी ऊंचाई और 15 सेमी व्यास, 2 दिन की मेहनत।',
    };

    const res = validateListingResult(outputWithSustainable, sampleFacts, sampleArtisan);
    expect(res.ok).toBe(false);
    expect(res.failedRule).toBe('risky_claims');
    expect(res.error).toContain('unverified risky claim');
  });

  it('allows numbers appearing in artisan text inputs (story, notes) and visible_features (e.g. 20 years, 3 drawers)', () => {
    const factsWithArtisanNumbers: ProductFactsInput = {
      ...sampleFacts,
      visible_features: ['3 drawers', 'solid brass fittings'],
      story_original: 'Crafted with 20 years of family dedication and heritage techniques.',
      story_en: 'Crafted with 20 years of family dedication and heritage techniques.',
    };

    // Verify extractAllowedNumbers includes numbers from story and features
    const allowed = extractAllowedNumbers(factsWithArtisanNumbers, { experience_years: null });
    expect(allowed.has(3)).toBe(true);
    expect(allowed.has(20)).toBe(true);

    const outputWithAllowedNumbers = {
      ...validOutput,
      highlights_en: [
        'Built with 3 drawers for convenient storage',
        'Features terracotta clay finish',
        'Dimensions: 10 cm height by 15 cm diameter',
        'Requires 2 days of master craftsmanship',
      ],
      description_en:
        'Crafted with 20 years of family dedication and heritage techniques, this piece includes 3 drawers. Taking 2 days of focused labor, it stands 10 cm in height and 15 cm in diameter.',
      description_hi:
        '20 साल के पारिवारिक समर्पण और पारंपरिक तकनीकों से निर्मित, इस कृति में 3 दराज शामिल हैं। 10 सेमी ऊंचाई और 15 सेमी व्यास, 2 दिन का कुशल कार्य।',
    };

    const res = validateListingResult(outputWithAllowedNumbers, factsWithArtisanNumbers, { experience_years: null });
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('rejects experience mention when experience_years is not set on artisan profile and not in artisan story', () => {
    const artisanWithoutExp: ArtisanListingProfile = {
      shop_name: 'Mitti Kala',
      city: 'Jaipur',
      experience_years: null,
    };

    const outputWithExp = {
      ...validOutput,
      description_en:
        'Crafted with 12 years of experience by master potters. Measuring 10 cm by 15 cm, it took 2 days to create.',
    };

    const res = validateListingResult(outputWithExp, sampleFacts, artisanWithoutExp);
    expect(res.ok).toBe(false);
    expect(res.failedRule).toBe('experience');
    expect(res.error).toContain('experience_years is not set');
  });

  it('strictly rejects "0 years" or "0 years of experience" under any circumstance', () => {
    const outputWithZeroYears = {
      ...validOutput,
      description_en: 'Crafted with 0 years of experience in pottery.',
    };
    const res = validateListingResult(outputWithZeroYears, sampleFacts, sampleArtisan);
    expect(res.ok).toBe(false);
    expect(res.failedRule).toBe('experience');
    expect(res.error).toContain("'0 years' of experience");
  });
});

describe('Facts Hash Stability & Change Detection', () => {
  const baseDraft: ProductRecord = {
    id: 'prod-101',
    artisan_id: 'art-202',
    listing_status: 'draft',
    created_at: '2026-09-24T00:00:00Z',
    item_type: 'Diya',
    material: 'Clay',
    category: 'Pottery',
    finish: 'natural',
    labor_days: 2,
    dimensions: {
      shape: 'round',
      values: { height: 10, diameter: 15 },
      unit: 'cm',
      approximate: false,
    },
    technique: 'Wheel thrown',
  };

  it('produces identical hash for identical facts across repeated calls', () => {
    const hash1 = computeFactsHash(baseDraft);
    const hash2 = computeFactsHash({ ...baseDraft });
    expect(hash1).toBe(hash2);
    expect(hash1.startsWith('facts_')).toBe(true);
  });

  it('changes hash when any confirmed fact is modified', () => {
    const originalHash = computeFactsHash(baseDraft);

    // Change material
    const modifiedMaterial = { ...baseDraft, material: 'Brass' };
    expect(computeFactsHash(modifiedMaterial)).not.toBe(originalHash);

    // Change dimension value
    const modifiedDims = {
      ...baseDraft,
      dimensions: {
        ...baseDraft.dimensions!,
        values: { height: 12, diameter: 15 },
      },
    };
    expect(computeFactsHash(modifiedDims)).not.toBe(originalHash);

    // Change labor days
    const modifiedLabor = { ...baseDraft, labor_days: 3 };
    expect(computeFactsHash(modifiedLabor)).not.toBe(originalHash);
  });

  it('correctly detects facts change against stored listing_facts_hash', () => {
    const hash = computeFactsHash(baseDraft);
    const draftWithHash: ProductRecord = {
      ...baseDraft,
      listing_facts_hash: hash,
    };

    expect(haveFactsChanged(draftWithHash)).toBe(false);

    const changedDraft: ProductRecord = {
      ...draftWithHash,
      labor_days: 4,
    };
    expect(haveFactsChanged(changedDraft)).toBe(true);
  });
});

describe('Deterministic Simple Listing Fallback Template', () => {
  const testDraft: ProductRecord = {
    id: 'prod-303',
    artisan_id: 'art-404',
    listing_status: 'draft',
    created_at: '2026-09-24T00:00:00Z',
    item_type: 'Bowl',
    material: 'Wood',
    category: 'Woodwork',
    finish: 'polished',
    labor_days: 3,
    availability: 'ready',
    quantity_available: 4,
    dimensions: {
      shape: 'round',
      values: { height: 8, diameter: 14 },
      unit: 'cm',
      approximate: false,
    },
    technique: 'Hand turned',
  };

  it('generates a simple listing using only confirmed facts', () => {
    const listing = generateSimpleListing(testDraft, { shop_name: 'WoodCraft', city: 'Saharanpur' }, 'hi');

    expect(listing.title_en).toContain('Handcrafted Wood Bowl');
    expect(listing.title_hi).toContain('हस्तनिर्मित Wood Bowl');
    expect(listing.highlights_en.length).toBeGreaterThanOrEqual(4);
    expect(listing.highlights_hi.length).toBeGreaterThanOrEqual(4);
    expect(listing.search_tags.length).toBeGreaterThanOrEqual(8);
    expect(listing.summary_spoken).toBeTruthy();
  });

  it('passes strict No-Fabrication validation rules with zero errors', () => {
    const listing = generateSimpleListing(testDraft, { shop_name: 'WoodCraft', city: 'Saharanpur' }, 'hi');
    const factsInput: ProductFactsInput = {
      item_type: testDraft.item_type,
      material: testDraft.material,
      category: testDraft.category,
      finish: testDraft.finish,
      labor_days: testDraft.labor_days,
      availability: testDraft.availability,
      quantity_available: testDraft.quantity_available,
      dimensions: testDraft.dimensions as any,
      technique: testDraft.technique,
    };

    const res = validateListingResult(listing, factsInput, { experience_years: null });
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });
});

describe('canProceedPreview & isListingPresent gate', () => {
  const completeDraft: ProductRecord = {
    id: 'prod-505',
    artisan_id: 'art-606',
    listing_status: 'draft',
    created_at: '2026-09-24T00:00:00Z',
    title_en: 'Handmade Shawl',
    title_hi: 'हस्तनिर्मित शॉल',
    seo_caption_en: 'Warm handmade wool shawl',
    seo_caption_hi: 'गर्म हस्तनिर्मित ऊनी शॉल',
    highlights_en: ['Point 1', 'Point 2', 'Point 3', 'Point 4'],
    highlights_hi: ['बिंदु 1', 'बिंदु 2', 'बिंदु 3', 'बिंदु 4'],
    description_en: 'Description in English about the shawl.',
    description_hi: 'शॉल के बारे में हिंदी विवरण।',
    listing_approved: true,
  };

  it('recognizes complete listing', () => {
    expect(isListingPresent(completeDraft)).toBe(true);
    expect(canProceedPreview(completeDraft)).toBe(true);
  });

  it('blocks canProceed when listing_approved is false or missing', () => {
    expect(canProceedPreview({ ...completeDraft, listing_approved: false })).toBe(false);
    expect(canProceedPreview({ ...completeDraft, listing_approved: null })).toBe(false);
  });

  it('blocks canProceed when listing content is missing even if approved is true', () => {
    expect(canProceedPreview({ ...completeDraft, title_en: '' })).toBe(false);
    expect(canProceedPreview({ ...completeDraft, highlights_en: [] })).toBe(false);
  });
});

describe('Products Table Patch Validator Test Helper', () => {
  it('accepts valid product update patches including summary_spoken and listing fields', () => {
    expect(() => {
      assertValidProductPatch({
        title_en: 'Handmade Shawl',
        title_hi: 'हस्तनिर्मित शॉल',
        summary_spoken: 'Audio summary script for the shawl',
        listing_approved: false,
        listing_facts_hash: 'facts_12345',
        extra_notes_original: 'Notes from artisan',
        extra_notes_en: 'Notes in English',
      });
    }).not.toThrow();
  });

  it('fails and throws descriptive Error when a patch contains unknown keys not in products Update type', () => {
    expect(() => {
      assertValidProductPatch({
        title_en: 'Handmade Shawl',
        unknown_column_xyz: 'this column does not exist',
      });
    }).toThrow(/not present in generated products Update type.*unknown_column_xyz/);
  });

  it('fails when patch contains non-existent summary_audio or fabricated columns', () => {
    expect(() => {
      assertValidProductPatch({
        summary_spoken: 'Valid text',
        summary_audio_url_fabricated: 'https://example.com/audio.mp3',
      });
    }).toThrow(/summary_audio_url_fabricated/);
  });
});

