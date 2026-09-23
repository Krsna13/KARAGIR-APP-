// src/services/__tests__/voiceValidation.test.ts
// Stage 6.2: Real-logic test suite for Gemini voice transcription validation.
//
// TEST SUITE ARCHITECTURE & BOUNDARY DECLARATIONS:
// - REAL LOGIC: validateVoiceResult is a pure validation function. All schema parsing,
//   number validation, dimension nullability checks, choice ID constraints, and status rules
//   execute REAL logic directly against raw JSON payloads without any mocks.
// - MOCKS: NONE. No external services or browser APIs are mocked in this test suite.

import { describe, it, expect } from 'vitest';
import {
  validateVoiceResult,
  type VoiceFieldSpec,
} from '../voiceValidation';

describe('validateVoiceResult - Real-Logic Validation Suite (Stage 6.2)', () => {
  it('validates text field with original and English translation correctly', () => {
    const field: VoiceFieldSpec = {
      key: 'product_name',
      type: 'text',
      question_en: 'What is the name of your craft product?',
    };

    const parsed = {
      status: 'ok',
      transcript_original: 'हाथ से बना सागवान मंदिर',
      value: {
        original: 'हाथ से बना सागवान मंदिर',
        en: 'Handmade Teakwood Temple',
      },
      value_display_en: 'Handmade Teakwood Temple',
      value_display_hi: 'हाथ से बना सागवान मंदिर',
      value_display_spoken: 'हाथ से बना सागवान मंदिर',
      confidence: 0.96,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('ok');
      expect(res.value.value).toEqual({
        original: 'हाथ से बना सागवान मंदिर',
        en: 'Handmade Teakwood Temple',
      });
      expect(res.value.confidence).toBe(0.96);
    }
  });

  it('validates number field with valid numeric value', () => {
    const field: VoiceFieldSpec = {
      key: 'price',
      type: 'number',
      question_en: 'What is the price of this item in Rupees?',
    };

    const parsed = {
      status: 'ok',
      transcript_original: 'दो हजार पांच सौ रुपये',
      value: 2500,
      value_display_en: '₹2,500',
      value_display_hi: '₹2,500',
      value_display_spoken: 'दो हजार पांच सौ रुपये',
      confidence: 0.95,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.value).toBe(2500);
    }
  });

  it('rejects number field when value is null, missing, or not a number', () => {
    const field: VoiceFieldSpec = {
      key: 'price',
      type: 'number',
      question_en: 'What is the price of this item in Rupees?',
    };

    // Missing value
    const missingValue = {
      status: 'ok',
      transcript_original: 'बहुत सुंदर चीज है',
      value: null,
      value_display_en: 'None',
      value_display_hi: 'कोई नहीं',
      value_display_spoken: 'कोई नहीं',
      confidence: 0.5,
    };
    const res1 = validateVoiceResult(missingValue, field);
    expect(res1.ok).toBe(false);
    if (!res1.ok) {
      expect(res1.error).toContain("requires a valid numeric value");
    }

    // String instead of number
    const stringValue = {
      status: 'ok',
      transcript_original: 'दो हजार पांच सौ',
      value: '2500',
      value_display_en: '₹2,500',
      value_display_hi: '₹2,500',
      value_display_spoken: 'दो हजार पांच सौ',
      confidence: 0.9,
    };
    const res2 = validateVoiceResult(stringValue, field);
    expect(res2.ok).toBe(false);
  });

  it('validates dimensions field with complete values', () => {
    const field: VoiceFieldSpec = {
      key: 'size',
      type: 'dimensions',
      question_en: 'What are the dimensions?',
    };

    const parsed = {
      status: 'ok',
      transcript_original: 'चार फीट लंबा दो फीट चौड़ा और तीन फीट ऊंचा',
      value: {
        length: 4,
        width: 2,
        height: 3,
        unit: 'ft',
      },
      value_display_en: '4 × 2 × 3 ft',
      value_display_hi: '4 × 2 × 3 फीट',
      value_display_spoken: '4 बाय 2 बाय 3 फीट',
      confidence: 0.92,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.value).toEqual({
        length: 4,
        width: 2,
        height: 3,
        diameter: null,
        thickness: null,
        unit: 'ft',
        approximate: false,
      });
    }
  });

  it('accepts dimensions with partial null values without fabricating placeholders', () => {
    const field: VoiceFieldSpec = {
      key: 'size',
      type: 'dimensions',
      question_en: 'What are the dimensions?',
    };

    // Artisan only mentioned width
    const parsed = {
      status: 'ok',
      transcript_original: 'दो फीट चौड़ा',
      value: {
        length: null,
        width: 2,
        height: null,
        unit: 'ft',
      },
      value_display_en: 'Width: 2 ft',
      value_display_hi: 'चौड़ाई: 2 फीट',
      value_display_spoken: 'चौड़ाई 2 फीट',
      confidence: 0.88,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.value).toEqual({
        length: null,
        width: 2,
        height: null,
        diameter: null,
        thickness: null,
        unit: 'ft',
        approximate: false,
      });
    }
  });

  it('rejects dimensions when a non-numeric or invalid value is provided', () => {
    const field: VoiceFieldSpec = {
      key: 'size',
      type: 'dimensions',
      question_en: 'What are the dimensions?',
    };

    const parsed = {
      status: 'ok',
      transcript_original: 'चौड़ाई दो फीट',
      value: {
        length: null,
        width: 'two', // invalid: string instead of number
        height: null,
        unit: 'ft',
      },
      value_display_en: 'Width: 2 ft',
      value_display_hi: 'चौड़ाई 2 फीट',
      value_display_spoken: 'चौड़ाई 2 फीट',
      confidence: 0.8,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Dimension 'width' must be a non-negative number or null");
    }
  });

  it('rejects dimensions with invalid unit', () => {
    const field: VoiceFieldSpec = {
      key: 'size',
      type: 'dimensions',
      question_en: 'What are the dimensions?',
    };

    const parsed = {
      status: 'ok',
      transcript_original: 'चार गज',
      value: {
        length: 4,
        width: null,
        height: null,
        unit: 'yards', // not in ft, in, cm, m
      },
      value_display_en: '4 yards',
      value_display_hi: '4 गज',
      value_display_spoken: '4 गज',
      confidence: 0.8,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('Dimension unit must be one of [ft, in, cm, m]');
    }
  });

  it('validates choice field when choice id matches allowed options', () => {
    const field: VoiceFieldSpec = {
      key: 'technique',
      type: 'choice',
      question_en: 'Which technique was used?',
      choices: [
        { id: 'hand-carved', label_en: 'Hand-Carved' },
        { id: 'wheel-thrown', label_en: 'Wheel-Thrown' },
      ],
    };

    const parsed = {
      status: 'ok',
      transcript_original: 'हाथ से नक्काशी की है',
      value: 'hand-carved',
      value_display_en: 'Hand-Carved',
      value_display_hi: 'हस्त-नक्काशी',
      value_display_spoken: 'हस्त नक्काशी',
      confidence: 0.94,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.value).toBe('hand-carved');
    }
  });

  it('rejects choice field when returned id is not in choices', () => {
    const field: VoiceFieldSpec = {
      key: 'technique',
      type: 'choice',
      question_en: 'Which technique was used?',
      choices: [
        { id: 'hand-carved', label_en: 'Hand-Carved' },
        { id: 'wheel-thrown', label_en: 'Wheel-Thrown' },
      ],
    };

    const parsed = {
      status: 'ok',
      transcript_original: 'लेज़र कटिंग',
      value: 'laser-cut',
      value_display_en: 'Laser Cut',
      value_display_hi: 'लेज़र कट',
      value_display_spoken: 'लेज़र कट',
      confidence: 0.9,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("is not in provided choices: [hand-carved, wheel-thrown]");
    }
  });

  it('strictly enforces value: null when status is unclear or off_topic', () => {
    const field: VoiceFieldSpec = {
      key: 'product_name',
      type: 'text',
      question_en: 'What is the name of your craft product?',
    };

    // Valid unclear response
    const validUnclear = {
      status: 'unclear',
      transcript_original: '...',
      value: null,
      value_display_en: 'Not understood',
      value_display_hi: 'समझ नहीं आया',
      value_display_spoken: 'समझ नहीं आया',
      confidence: 0.2,
    };
    const res1 = validateVoiceResult(validUnclear, field);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.value.value).toBeNull();
    }

    // Invalid unclear response trying to fabricate a value
    const fabricatedUnclear = {
      status: 'unclear',
      transcript_original: '...',
      value: { original: 'Unknown Item', en: 'Unknown Item' },
      value_display_en: 'Unknown Item',
      value_display_hi: 'अज्ञात',
      value_display_spoken: 'अज्ञात',
      confidence: 0.2,
    };
    const res2 = validateVoiceResult(fabricatedUnclear, field);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error).toContain("Status 'unclear' must have value set to null");
    }
  });

  it('rejects invalid status values', () => {
    const field: VoiceFieldSpec = {
      key: 'price',
      type: 'number',
      question_en: 'Price?',
    };

    const parsed = {
      status: 'maybe_ok',
      transcript_original: 'पांच सौ',
      value: 500,
      value_display_en: '500',
      value_display_hi: '500',
      value_display_spoken: '500',
      confidence: 0.8,
    };

    const res = validateVoiceResult(parsed, field);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Invalid status 'maybe_ok'");
    }
  });
});

/**
 * Stage 6.5: shape-aware dimension_keys, diameter, thickness, approximate.
 * REAL LOGIC — validateVoiceResult executed directly, no mocks.
 */
describe('validateVoiceResult - dimension_keys / diameter / thickness / approximate (Stage 6.5)', () => {
  const baseParsed = (value: unknown) => ({
    status: 'ok' as const,
    transcript_original: 'x',
    value,
    value_display_en: 'x',
    value_display_hi: 'x',
    value_display_spoken: 'x',
    confidence: 0.9,
  });

  it("round shape (dimension_keys: ['height','diameter']) accepts height+diameter and never fabricates length/width", () => {
    const field: VoiceFieldSpec = { key: 'size', type: 'dimensions', question_en: 'Size?', dimension_keys: ['height', 'diameter'] };
    const res = validateVoiceResult(
      baseParsed({ height: 30, diameter: 20, unit: 'cm' }),
      field
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.value).toEqual({
        length: null, width: null, height: 30, diameter: 20, thickness: null, unit: 'cm', approximate: false,
      });
    }
  });

  it("a dimension outside dimension_keys is discarded (never guessed), even if Gemini returns a stray value for it", () => {
    // Field only asked for height + diameter (a pot); Gemini hallucinates a width anyway.
    const field: VoiceFieldSpec = { key: 'size', type: 'dimensions', question_en: 'Size?', dimension_keys: ['height', 'diameter'] };
    const res = validateVoiceResult(
      baseParsed({ height: 30, diameter: 20, width: 999, unit: 'cm' }),
      field
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect((res.value.value as any).width).toBeNull();
    }
  });

  it("flat shape (dimension_keys: ['length','width','thickness']) accepts thickness", () => {
    const field: VoiceFieldSpec = { key: 'size', type: 'dimensions', question_en: 'Size?', dimension_keys: ['length', 'width', 'thickness'] };
    const res = validateVoiceResult(
      baseParsed({ length: 200, width: 90, thickness: 0.5, unit: 'cm' }),
      field
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.value).toMatchObject({ length: 200, width: 90, thickness: 0.5, height: null, diameter: null });
    }
  });

  it('no dimension_keys on the field spec falls back to length/width/height (backward compatible)', () => {
    const field: VoiceFieldSpec = { key: 'size', type: 'dimensions', question_en: 'Size?' };
    const res = validateVoiceResult(baseParsed({ length: 4, width: 2, height: 3, unit: 'ft' }), field);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.value).toMatchObject({ length: 4, width: 2, height: 3 });
  });

  it("approximate: true only when Gemini explicitly set it (hedge words like 'lagbhag')", () => {
    const field: VoiceFieldSpec = { key: 'size', type: 'dimensions', question_en: 'Size?' };
    const hedged = validateVoiceResult(baseParsed({ length: 6, width: null, height: null, unit: 'ft', approximate: true }), field);
    expect(hedged.ok).toBe(true);
    if (hedged.ok) expect((hedged.value.value as any).approximate).toBe(true);

    const precise = validateVoiceResult(baseParsed({ length: 6, width: null, height: null, unit: 'ft' }), field);
    expect(precise.ok).toBe(true);
    if (precise.ok) expect((precise.value.value as any).approximate).toBe(false); // honest default
  });

  it('rejects a non-boolean approximate instead of coercing it', () => {
    const field: VoiceFieldSpec = { key: 'size', type: 'dimensions', question_en: 'Size?' };
    const res = validateVoiceResult(baseParsed({ length: 6, width: null, height: null, unit: 'ft', approximate: 'yes' }), field);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("'approximate' must be a boolean");
  });

  it('rejects a non-numeric diameter/thickness the same way as length/width/height', () => {
    const field: VoiceFieldSpec = { key: 'size', type: 'dimensions', question_en: 'Size?', dimension_keys: ['height', 'diameter'] };
    const res = validateVoiceResult(baseParsed({ height: 30, diameter: 'big', unit: 'cm' }), field);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Dimension 'diameter' must be a non-negative number or null");
  });
});
