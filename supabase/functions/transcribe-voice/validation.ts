// supabase/functions/transcribe-voice/validation.ts
// Stage 6.2: Pure validation logic for Gemini structured voice transcription output.
// Shared between the Supabase Edge Function and Vitest unit tests.

export type VoiceFieldType = 'text' | 'long_text' | 'number' | 'dimensions' | 'choice';

export interface VoiceFieldChoice {
  id: string;
  label_en: string;
  label_hi?: string;
}

/** Stage 6.5: which dimensions a 'dimensions' field asks for (shape-aware). */
export type DimensionKey = 'length' | 'width' | 'height' | 'diameter' | 'thickness';

export const ALL_DIMENSION_KEYS: readonly DimensionKey[] = ['length', 'width', 'height', 'diameter', 'thickness'];

export interface VoiceFieldSpec {
  key: string;
  question_en: string;
  question_hi?: string;
  type: VoiceFieldType;
  choices?: VoiceFieldChoice[];
  unit_hint?: string;
  /** For type 'dimensions': which keys to ask for/accept. Defaults to length/width/height if omitted. */
  dimension_keys?: DimensionKey[];
}

export interface VoiceDimensionsValue {
  length: number | null;
  width: number | null;
  height: number | null;
  /** Stage 6.5: round shapes (pots, vases). */
  diameter: number | null;
  /** Stage 6.5: optional for flat shapes (textiles, wall panels). */
  thickness: number | null;
  unit: 'ft' | 'in' | 'cm' | 'm' | null;
  /** Stage 6.5: true when the artisan hedged the answer (e.g. "lagbhag 6 foot" / "around 6 feet"). */
  approximate: boolean;
}

export interface VoiceTextValue {
  original: string;
  en: string;
}

export type VoiceTranscriptionStatus = 'ok' | 'unclear' | 'off_topic';

export interface VoiceTranscriptionResponse {
  status: VoiceTranscriptionStatus;
  transcript_original: string;
  value: VoiceTextValue | number | VoiceDimensionsValue | string | null;
  value_display_en: string;
  value_display_hi: string;
  value_display_spoken: string;
  confidence: number;
}

export type ValidationResult =
  | { ok: true; value: VoiceTranscriptionResponse }
  | { ok: false; error: string };

const VALID_DIMENSION_UNITS = ['ft', 'in', 'cm', 'm'] as const;

/**
 * Validates the parsed JSON result returned by Gemini for voice field transcription.
 * Enforces strict typing, Indian number conversions, dimension nullability (no hallucinations),
 * and choice ID restrictions. Unclear/off_topic results must strictly have value: null.
 */
export function validateVoiceResult(parsed: unknown, field: VoiceFieldSpec): ValidationResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Gemini response must be a JSON object' };
  }

  const record = parsed as Record<string, unknown>;

  // 1. Status check: 'ok' | 'unclear' | 'off_topic'
  const status = record.status;
  if (status !== 'ok' && status !== 'unclear' && status !== 'off_topic') {
    return {
      ok: false,
      error: `Invalid status '${String(status)}'. Must be 'ok', 'unclear', or 'off_topic'.`,
    };
  }

  // 2. Transcript original: string
  const transcriptOriginal =
    typeof record.transcript_original === 'string' ? record.transcript_original.trim() : '';

  // 3. Confidence: number between 0 and 1
  let confidence = 0.5;
  if (record.confidence !== undefined && record.confidence !== null) {
    const rawConf = Number(record.confidence);
    if (typeof record.confidence !== 'number' || Number.isNaN(rawConf)) {
      return { ok: false, error: 'Confidence score must be a valid number' };
    }
    confidence = Math.max(0, Math.min(1, Number(rawConf.toFixed(4))));
  }

  // 4. Value display strings
  const valueDisplayEn =
    typeof record.value_display_en === 'string' ? record.value_display_en.trim() : '';
  const valueDisplayHi =
    typeof record.value_display_hi === 'string' ? record.value_display_hi.trim() : '';
  const valueDisplaySpoken =
    typeof record.value_display_spoken === 'string'
      ? record.value_display_spoken.trim()
      : valueDisplayHi || valueDisplayEn;

  // 5. If status is unclear or off_topic, value MUST be null (no guessed or placeholder values)
  if (status === 'unclear' || status === 'off_topic') {
    if (record.value !== null && record.value !== undefined) {
      return {
        ok: false,
        error: `Status '${status}' must have value set to null, got: ${JSON.stringify(record.value)}`,
      };
    }

    return {
      ok: true,
      value: {
        status,
        transcript_original: transcriptOriginal,
        value: null,
        value_display_en: valueDisplayEn || 'Not understood',
        value_display_hi: valueDisplayHi || 'समझ नहीं आया',
        value_display_spoken: valueDisplaySpoken || valueDisplayHi || 'समझ नहीं आया',
        confidence,
      },
    };
  }

  // 6. Validate value per field.type
  let validatedValue: VoiceTranscriptionResponse['value'] = null;

  switch (field.type) {
    case 'text':
    case 'long_text': {
      if (
        !record.value ||
        typeof record.value !== 'object' ||
        Array.isArray(record.value)
      ) {
        return {
          ok: false,
          error: `Field '${field.key}' of type '${field.type}' requires object value { original, en }`,
        };
      }
      const valObj = record.value as Record<string, unknown>;
      if (typeof valObj.original !== 'string' || valObj.original.trim() === '') {
        return {
          ok: false,
          error: `Field '${field.key}' missing required 'original' text string in value`,
        };
      }
      if (typeof valObj.en !== 'string') {
        return {
          ok: false,
          error: `Field '${field.key}' missing required 'en' translation string in value`,
        };
      }
      validatedValue = {
        original: valObj.original.trim(),
        en: valObj.en.trim(),
      };
      break;
    }

    case 'number': {
      if (
        record.value === null ||
        record.value === undefined ||
        typeof record.value !== 'number' ||
        Number.isNaN(record.value)
      ) {
        return {
          ok: false,
          error: `Field '${field.key}' of type 'number' requires a valid numeric value, got: ${JSON.stringify(record.value)}`,
        };
      }
      validatedValue = record.value;
      break;
    }

    case 'dimensions': {
      if (
        !record.value ||
        typeof record.value !== 'object' ||
        Array.isArray(record.value)
      ) {
        return {
          ok: false,
          error: `Field '${field.key}' of type 'dimensions' requires an object value { length, width, height, diameter, thickness, unit, approximate }`,
        };
      }
      const valObj = record.value as Record<string, unknown>;
      // Which keys this question actually asked for (shape-aware, Stage 6.5).
      // Defaults to length/width/height for backward compatibility with
      // existing field specs that omit dimension_keys.
      const askedKeys = field.dimension_keys ?? ['length', 'width', 'height'];

      const validateDimPart = (partName: DimensionKey): number | null => {
        const val = valObj[partName];
        if (val === null || val === undefined) return null;
        if (!askedKeys.includes(partName)) {
          // Never guessed for a dimension the question did not ask about,
          // even if Gemini returned a value for it (e.g. a stray height for a flat item).
          return null;
        }
        if (typeof val === 'number' && !Number.isNaN(val) && val >= 0) return val;
        throw new Error(`Dimension '${partName}' must be a non-negative number or null, got: ${JSON.stringify(val)}`);
      };

      let length: number | null = null;
      let width: number | null = null;
      let height: number | null = null;
      let diameter: number | null = null;
      let thickness: number | null = null;

      try {
        length = validateDimPart('length');
        width = validateDimPart('width');
        height = validateDimPart('height');
        diameter = validateDimPart('diameter');
        thickness = validateDimPart('thickness');
      } catch (err: any) {
        return { ok: false, error: err.message };
      }

      let unit: 'ft' | 'in' | 'cm' | 'm' | null = null;
      if (valObj.unit !== null && valObj.unit !== undefined) {
        if (
          typeof valObj.unit !== 'string' ||
          !VALID_DIMENSION_UNITS.includes(valObj.unit as any)
        ) {
          return {
            ok: false,
            error: `Dimension unit must be one of [${VALID_DIMENSION_UNITS.join(', ')}] or null, got: '${String(valObj.unit)}'`,
          };
        }
        unit = valObj.unit as 'ft' | 'in' | 'cm' | 'm';
      }

      // approximate: true only when Gemini explicitly detected a hedge word
      // ("lagbhag", "around", "roughly", ...). Absent/false is the honest default.
      let approximate = false;
      if (valObj.approximate !== null && valObj.approximate !== undefined) {
        if (typeof valObj.approximate !== 'boolean') {
          return { ok: false, error: `Dimension 'approximate' must be a boolean or null, got: ${JSON.stringify(valObj.approximate)}` };
        }
        approximate = valObj.approximate;
      }

      validatedValue = {
        length,
        width,
        height,
        diameter,
        thickness,
        unit,
        approximate,
      };
      break;
    }

    case 'choice': {
      if (typeof record.value !== 'string' || record.value.trim() === '') {
        return {
          ok: false,
          error: `Field '${field.key}' of type 'choice' requires a string choice id, got: ${JSON.stringify(record.value)}`,
        };
      }
      const chosenId = record.value.trim();
      const validChoiceIds = (field.choices || []).map((c) => c.id);
      if (!validChoiceIds.includes(chosenId)) {
        return {
          ok: false,
          error: `Field '${field.key}' returned choice id '${chosenId}' which is not in provided choices: [${validChoiceIds.join(', ')}]`,
        };
      }
      validatedValue = chosenId;
      break;
    }

    default:
      return { ok: false, error: `Unsupported field type: '${field.type}'` };
  }

  return {
    ok: true,
    value: {
      status,
      transcript_original: transcriptOriginal,
      value: validatedValue,
      value_display_en: valueDisplayEn || String(validatedValue),
      value_display_hi: valueDisplayHi || valueDisplayEn || String(validatedValue),
      value_display_spoken: valueDisplaySpoken || valueDisplayHi || valueDisplayEn,
      confidence,
    },
  };
}
