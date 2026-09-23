// Stage 6.5: pure logic for the Add Item wizard Describe step (step 2).
// No React, no I/O — exercised directly by tests.

import {
  dimensionKeysForShape,
  requiredDimensionKeysForShape,
} from '../../../../utils/dimensionMerger';
import type { DimensionKey, VoiceDimensionsValue } from '../../../../types/voice';
import type {
  ProductAiIdentification,
  ProductDimensionsRaw,
  ProductRecord,
  ProductShapeProfile,
  ProductStyle,
} from '../../../../types/product';

type Lang = 'hi' | 'mr' | 'en';
export const asDescribeLang = (code: string | null | undefined): Lang =>
  code === 'mr' || code === 'en' ? code : 'hi';

// ---------------------------------------------------------------------------
// Dimensions: raw (DB) <-> VoiceDimensionsValue (UI) conversion
// ---------------------------------------------------------------------------

const EMPTY_VOICE_DIMS: VoiceDimensionsValue = {
  length: null,
  width: null,
  height: null,
  diameter: null,
  thickness: null,
  unit: null,
  approximate: false,
};

/** products.dimensions (raw answer) -> the shape VoiceInputButton works with. */
export function rawDimensionsToVoiceValue(raw: ProductDimensionsRaw | null | undefined): VoiceDimensionsValue {
  if (!raw) return EMPTY_VOICE_DIMS;
  return {
    length: raw.values.length ?? null,
    width: raw.values.width ?? null,
    height: raw.values.height ?? null,
    diameter: raw.values.diameter ?? null,
    thickness: raw.values.thickness ?? null,
    unit: raw.unit,
    approximate: raw.approximate,
  };
}

/** VoiceDimensionsValue -> products.dimensions (raw answer), keeping only keys relevant to `shape`. */
export function voiceValueToRawDimensions(
  dims: VoiceDimensionsValue,
  shape: ProductShapeProfile
): ProductDimensionsRaw | null {
  if (!dims.unit) return null;
  const values: Partial<Record<DimensionKey, number>> = {};
  for (const key of dimensionKeysForShape(shape)) {
    const value = dims[key];
    if (value !== null && value !== undefined) values[key] = value;
  }
  return { shape, values, unit: dims.unit, approximate: dims.approximate };
}

/** Is products.dimensions complete for `shape` (all its required keys + unit present)? */
export function isDimensionsRawComplete(
  raw: ProductDimensionsRaw | null | undefined,
  shape: ProductShapeProfile
): boolean {
  if (!raw || raw.shape !== shape || !raw.unit) return false;
  return requiredDimensionKeysForShape(shape).every((key) => raw.values[key] !== undefined);
}

// ---------------------------------------------------------------------------
// Required facts + canProceed(2)
// ---------------------------------------------------------------------------

export interface DescribeAnswers {
  dimensions: ProductDimensionsRaw | null;
  technique: string | null;
  labor_days: number | null;
  availability: 'ready' | 'made_to_order' | null;
  quantity_available: number | null;
  lead_time_days: number | null;
}

export function describeAnswersFromDraft(draft: Partial<ProductRecord> | null | undefined): DescribeAnswers {
  return {
    dimensions: (draft?.dimensions as ProductDimensionsRaw | undefined) ?? null,
    technique: draft?.technique ?? null,
    labor_days: draft?.labor_days ?? null,
    availability: draft?.availability ?? null,
    quantity_available: draft?.quantity_available ?? null,
    lead_time_days: draft?.lead_time_days ?? null,
  };
}

/**
 * canProceed(2): dimensions complete for the shape, technique, labor_days,
 * availability, plus quantity_available (if ready) or lead_time_days
 * (if made_to_order) to match.
 */
export function isDescribeStepComplete(
  answers: DescribeAnswers,
  shape: ProductShapeProfile | null | undefined
): boolean {
  if (!shape) return false;
  if (!isDimensionsRawComplete(answers.dimensions, shape)) return false;
  if (!answers.technique || !answers.technique.trim()) return false;
  if (answers.labor_days === null || answers.labor_days === undefined || Number.isNaN(answers.labor_days)) return false;
  if (answers.labor_days < 0) return false;
  if (answers.availability === 'ready') return answers.quantity_available !== null && answers.quantity_available !== undefined;
  if (answers.availability === 'made_to_order') return answers.lead_time_days !== null && answers.lead_time_days !== undefined;
  return false;
}

// ---------------------------------------------------------------------------
// Step machine — which required card to show next, resuming a partial answer
// ---------------------------------------------------------------------------

export type RequiredStep =
  | 'dimensions'
  | 'dimensions_thickness' // flat shape only, optional
  | 'technique'
  | 'labor_days'
  | 'availability'
  | 'availability_followup'
  | 'done';

/** Resolves which required question to show, so leaving mid-flow and returning resumes correctly. */
export function nextRequiredStep(
  answers: DescribeAnswers,
  shape: ProductShapeProfile | null | undefined
): RequiredStep {
  if (!shape) return 'done'; // should not happen: step 1 guarantees a shape
  if (!isDimensionsRawComplete(answers.dimensions, shape)) return 'dimensions';
  if (shape === 'flat' && answers.dimensions?.values.thickness === undefined && !answers.technique) {
    // Thickness is asked once, right after the required L/W, before moving on.
    // (Tracked implicitly: once the artisan answers or skips it, `technique` or a
    // later field becomes the resume point, so this only fires the first time.)
    return 'dimensions_thickness';
  }
  if (!answers.technique || !answers.technique.trim()) return 'technique';
  if (answers.labor_days === null || answers.labor_days === undefined) return 'labor_days';
  if (!answers.availability) return 'availability';
  if (answers.availability === 'ready' && (answers.quantity_available === null || answers.quantity_available === undefined)) {
    return 'availability_followup';
  }
  if (
    answers.availability === 'made_to_order' &&
    (answers.lead_time_days === null || answers.lead_time_days === undefined)
  ) {
    return 'availability_followup';
  }
  return 'done';
}

// ---------------------------------------------------------------------------
// Static bilingual copy for the required cards (no AI guess drives these)
// ---------------------------------------------------------------------------

export interface StepText {
  en: string;
  spoken: string;
}

const pick = (lang: Lang, en: string, hi: string, mr: string): StepText => ({
  en,
  spoken: lang === 'en' ? en : lang === 'mr' ? mr : hi,
});

export function dimensionsQuestionText(shape: ProductShapeProfile, speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  if (shape === 'round') return pick(lang, 'How big is it?', 'यह कितना बड़ा है?', 'हे किती मोठे आहे?');
  if (shape === 'flat') return pick(lang, 'What size is it?', 'इसका आकार क्या है?', 'याचा आकार काय आहे?');
  return pick(lang, 'What size is it?', 'इसका आकार क्या है?', 'याचा आकार काय आहे?');
}

export function thicknessQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(lang, 'How thick is it? (optional)', 'यह कितना मोटा है? (वैकल्पिक)', 'हे किती जाड आहे? (ऐच्छिक)');
}

export function techniqueQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(lang, 'How is it made?', 'यह कैसे बनाया जाता है?', 'हे कसे बनवले जाते?');
}

export function laborDaysQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(
    lang,
    'How many days did it take to make?',
    'इसे बनाने में कितने दिन लगे?',
    'हे बनवायला किती दिवस लागले?'
  );
}

export function availabilityQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(lang, 'Ready now, or made to order?', 'अभी तैयार है, या ऑर्डर पर बनाएंगे?', 'आता तयार आहे, की ऑर्डरवर बनवाल?');
}

export function quantityQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(lang, 'How many do you have?', 'आपके पास कितने हैं?', 'तुमच्याकडे किती आहेत?');
}

export function leadTimeQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(
    lang,
    'How many days to make a new one?',
    'नया बनाने में कितने दिन लगेंगे?',
    'नवीन बनवायला किती दिवस लागतील?'
  );
}

export function customizationQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(
    lang,
    'Can you make it in another size or material?',
    'क्या आप इसे किसी और साइज़ या सामग्री में बना सकते हैं?',
    'तुम्ही हे दुसऱ्या आकारात किंवा साहित्यात बनवू शकता का?'
  );
}

export function storyQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(
    lang,
    'Tell buyers your story',
    'खरीदारों को अपनी कहानी बताइए',
    'खरेदीदारांना तुमची कहाणी सांगा'
  );
}

export const storyEncouragement = (speakingLanguage: string | null | undefined): string => {
  const lang = asDescribeLang(speakingLanguage);
  return {
    en: 'Buyers love to hear your story',
    hi: 'खरीदार आपकी कहानी सुनना पसंद करते हैं',
    mr: 'खरेदीदारांना तुमची कहाणी ऐकायला आवडते',
  }[lang];
};

export function careInstructionsQuestionText(speakingLanguage: string | null | undefined): StepText {
  const lang = asDescribeLang(speakingLanguage);
  return pick(lang, 'How should buyers take care of it?', 'खरीदार इसकी देखभाल कैसे करें?', 'खरेदीदारांनी याची काळजी कशी घ्यावी?');
}

export const AVAILABILITY_OPTIONS: ReadonlyArray<{ id: 'ready' | 'made_to_order'; en: string; hi: string; mr: string }> = [
  { id: 'ready', en: 'Ready now', hi: 'अभी तैयार है', mr: 'आता तयार आहे' },
  { id: 'made_to_order', en: 'Made to order', hi: 'ऑर्डर पर बनाएंगे', mr: 'ऑर्डरवर बनवू' },
];

export const YES_NO_OPTIONS: ReadonlyArray<{ id: 'yes' | 'no'; en: string; hi: string; mr: string }> = [
  { id: 'yes', en: 'Yes', hi: 'हाँ', mr: 'हो' },
  { id: 'no', en: 'No', hi: 'नहीं', mr: 'नाही' },
];

export const STYLE_OPTIONS: ReadonlyArray<{ id: Exclude<ProductStyle, 'unknown'>; en: string; hi: string; mr: string }> = [
  { id: 'traditional', en: 'Traditional', hi: 'पारंपरिक', mr: 'पारंपरिक' },
  { id: 'modern', en: 'Modern', hi: 'आधुनिक', mr: 'आधुनिक' },
  { id: 'rustic', en: 'Rustic', hi: 'देहाती', mr: 'ग्रामीण' },
  { id: 'fusion', en: 'Fusion', hi: 'फ्यूज़न', mr: 'फ्यूजन' },
];

// ---------------------------------------------------------------------------
// AI-assisted facts (visible_features / colors / style / suggested_use)
// ---------------------------------------------------------------------------

export interface DescribeAiFacts {
  visible_features: string[];
  colors: string[];
  style: ProductStyle | null;
  suggested_use: string[];
}

/** True if the AI response has at least one of these four fields to show. */
export function hasAiDescribeFacts(ai: ProductAiIdentification | null | undefined): boolean {
  if (!ai) return false;
  return Boolean(
    (ai.visible_features && ai.visible_features.length > 0) ||
      (ai.colors && ai.colors.length > 0) ||
      (ai.style && ai.style !== 'unknown') ||
      (ai.suggested_use && ai.suggested_use.length > 0)
  );
}

export function aiFactsFrom(ai: ProductAiIdentification | null | undefined): DescribeAiFacts {
  return {
    visible_features: ai?.visible_features ?? [],
    colors: ai?.colors ?? [],
    style: ai?.style && ai.style !== 'unknown' ? ai.style : null,
    suggested_use: ai?.suggested_use ?? [],
  };
}
