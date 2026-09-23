// Stage 6.4: pure logic for the Add Item wizard Identify step (step 1).
// No React, no I/O — exercised directly by tests.

import type {
  IdentificationPhotos,
  IdentifiedProductCategory,
  ProductAiIdentification,
  ProductComplexity,
  ProductFinish,
  ProductImage,
  ProductRecord,
  ProductShapeProfile,
} from '../../../../types/product';

export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export const IDENTIFY_CATEGORIES: ReadonlyArray<{ id: IdentifiedProductCategory; hi: string; mr: string }> = [
  { id: 'Woodwork', hi: 'लकड़ी का काम', mr: 'लाकडी काम' },
  { id: 'Pottery', hi: 'मिट्टी के बर्तन', mr: 'मातीची भांडी' },
  { id: 'Brasscraft', hi: 'पीतल शिल्प', mr: 'पितळ काम' },
  { id: 'Textile', hi: 'कपड़ा', mr: 'कापड / वस्त्र' },
  { id: 'Furniture', hi: 'फर्नीचर', mr: 'फर्निचर' },
  { id: 'Metal', hi: 'धातु', mr: 'धातू काम' },
];

export const COMPLEXITY_OPTIONS: ReadonlyArray<{ id: ProductComplexity; en: string; hi: string; mr: string }> = [
  { id: 'simple', en: 'Simple', hi: 'सादा', mr: 'साधे' },
  { id: 'medium', en: 'Medium', hi: 'मध्यम', mr: 'मध्यम' },
  { id: 'intricate', en: 'Intricate', hi: 'बारीक', mr: 'बारीक काम' },
];

export const SHAPE_OPTIONS: ReadonlyArray<{
  id: ProductShapeProfile;
  en: string;
  hi: string;
  mr: string;
  examplesEn: string;
  examplesHi: string;
  examplesMr: string;
}> = [
  { id: 'box', en: 'Box', hi: 'डिब्बे जैसा', mr: 'पेटीसारखा', examplesEn: 'stool, table', examplesHi: 'स्टूल, मेज़', examplesMr: 'स्टूल, टेबल' },
  { id: 'flat', en: 'Flat', hi: 'चपटा', mr: 'सपाट', examplesEn: 'dupatta, wall panel', examplesHi: 'दुपट्टा, दीवार पैनल', examplesMr: 'दुपट्टा, वॉल पॅनल' },
  { id: 'round', en: 'Round', hi: 'गोल', mr: 'गोल', examplesEn: 'pot, vase', examplesHi: 'मटका, फूलदान', examplesMr: 'माठ, फुलदाणी' },
];

export const FINISH_OPTIONS: ReadonlyArray<{ id: Exclude<ProductFinish, 'unknown'>; en: string; hi: string; mr: string }> = [
  { id: 'natural', en: 'Natural', hi: 'प्राकृतिक', mr: 'नैसर्गिक' },
  { id: 'polished', en: 'Polished', hi: 'पॉलिश', mr: 'पॉलिश केलेले' },
  { id: 'painted', en: 'Painted', hi: 'रंगा हुआ', mr: 'रंगवलेले' },
  { id: 'lacquered', en: 'Lacquered', hi: 'लाख वाला', mr: 'लाखकाम केलेले' },
];

/** Quick-pick chips for correcting the material. `value` is what gets saved. */
export const MATERIAL_CHIPS: ReadonlyArray<{ value: string; en: string; hi: string; mr: string }> = [
  { value: 'Teak Wood', en: 'Teak', hi: 'सागवान', mr: 'सागवान' },
  { value: 'Sheesham Wood', en: 'Sheesham', hi: 'शीशम', mr: 'शिसव' },
  { value: 'Mango Wood', en: 'Mango wood', hi: 'आम की लकड़ी', mr: 'आंब्याचे लाकूड' },
  { value: 'Brass', en: 'Brass', hi: 'पीतल', mr: 'पितळ' },
  { value: 'Copper', en: 'Copper', hi: 'तांबा', mr: 'तांबे' },
  { value: 'Terracotta', en: 'Terracotta', hi: 'टेराकोटा', mr: 'टेराकोटा' },
  { value: 'Cotton', en: 'Cotton', hi: 'सूती', mr: 'सुती' },
  { value: 'Silk', en: 'Silk', hi: 'रेशम', mr: 'रेशीम' },
];

/** The five answers that must be confirmed before leaving the step. */
export interface IdentifyAnswers {
  item_type: string | null;
  material: string | null;
  category: IdentifiedProductCategory | null;
  complexity: ProductComplexity | null;
  shape_profile: ProductShapeProfile | null;
}

export const REQUIRED_ANSWER_KEYS: ReadonlyArray<keyof IdentifyAnswers> = [
  'item_type',
  'material',
  'category',
  'complexity',
  'shape_profile',
];

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

/** canProceed(1): item_type, material, category, complexity and shape_profile all confirmed. */
export function isIdentifyStepComplete(record: Partial<Pick<ProductRecord, keyof IdentifyAnswers>> | null | undefined): boolean {
  if (!record) return false;
  return REQUIRED_ANSWER_KEYS.every((key) => filled(record[key]));
}

export function answersFromDraft(draft: Partial<ProductRecord> | null | undefined): IdentifyAnswers {
  return {
    item_type: filled(draft?.item_type) ? (draft!.item_type as string) : null,
    material: filled(draft?.material) ? (draft!.material as string) : null,
    category: draft?.category ?? null,
    complexity: draft?.complexity ?? null,
    shape_profile: draft?.shape_profile ?? null,
  };
}

/** Snapshot of the product's photos at identification time (stored in products.identification_photos). */
export function buildIdentificationPhotos(
  usedImageIds: string[],
  coverImageId: string | null,
  allImages: Pick<ProductImage, 'id'>[]
): IdentificationPhotos {
  return {
    used_image_ids: [...usedImageIds],
    cover_image_id: coverImageId,
    all_image_ids: allImages.map((img) => img.id),
  };
}

/**
 * True when the photos no longer match the last identification run: the
 * cover changed, or a photo was added or removed. False when there was no run.
 */
export function havePhotosChanged(
  recorded: IdentificationPhotos | null | undefined,
  currentImages: Pick<ProductImage, 'id' | 'is_cover'>[]
): boolean {
  if (!recorded) return false;
  const currentCover = currentImages.find((img) => img.is_cover)?.id ?? null;
  if ((recorded.cover_image_id ?? null) !== currentCover) return true;

  const before = new Set(recorded.all_image_ids ?? []);
  const now = new Set(currentImages.map((img) => img.id));
  if (before.size !== now.size) return true;
  for (const id of now) if (!before.has(id)) return true;
  return false;
}

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const sameSet = (a: string[] | null | undefined, b: string[] | null | undefined) => {
  const norm = (list: string[] | null | undefined) =>
    [...new Set((list ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean))].sort().join('|');
  return norm(a) === norm(b);
};

export interface ConfirmedIdentification extends IdentifyAnswers {
  secondary_materials: string[] | null;
  finish: ProductFinish | null;
}

/**
 * 'ai_confirmed' only if every guess the AI actually made was accepted
 * unchanged. Fields the AI did not return (e.g. no complexity) are not guesses
 * and do not count either way. No AI result (identification failed, all
 * manual) is always 'artisan_corrected'.
 */
export function computeIdentificationSource(
  ai: ProductAiIdentification | null | undefined,
  confirmed: ConfirmedIdentification
): 'ai_confirmed' | 'artisan_corrected' {
  if (!ai) return 'artisan_corrected';

  const unchanged =
    sameText(confirmed.item_type, ai.item_name) &&
    sameText(confirmed.material, ai.material) &&
    confirmed.category === ai.category &&
    (ai.complexity === undefined || confirmed.complexity === ai.complexity) &&
    (ai.shape_profile === undefined || confirmed.shape_profile === ai.shape_profile) &&
    (ai.secondary_materials === undefined || sameSet(confirmed.secondary_materials, ai.secondary_materials)) &&
    (ai.finish === undefined || confirmed.finish === ai.finish);

  return unchanged ? 'ai_confirmed' : 'artisan_corrected';
}

export type QuestionKey = 'item_type' | 'material' | 'category' | 'complexity' | 'shape_profile';

export const QUESTION_ORDER: ReadonlyArray<QuestionKey> = [
  'item_type',
  'material',
  'category',
  'complexity',
  'shape_profile',
];

export interface QuestionText {
  /** Shown on screen (English). */
  en: string;
  /** Shown on screen and read aloud, in the artisan's speaking language. */
  spoken: string;
}

type Lang = 'hi' | 'mr' | 'en';
const asLang = (code: string | null | undefined): Lang => (code === 'mr' || code === 'en' ? code : 'hi');

/**
 * Question wording. `ai` is the current guess, or null when there is none
 * (identification failed or the AI did not return that field): then the
 * question asks the artisan to choose/say it, and never names a value.
 */
export function buildQuestionText(
  key: QuestionKey,
  ai: ProductAiIdentification | null,
  speakingLanguage: string | null | undefined
): QuestionText {
  const lang = asLang(speakingLanguage);

  if (key === 'item_type') {
    if (!ai) {
      return {
        en: 'What is this item?',
        spoken: { hi: 'यह क्या चीज़ है? बोलकर बताइए।', mr: 'ही कोणती वस्तू आहे? बोलून सांगा.', en: 'What is this item? Please say it.' }[lang],
      };
    }
    const low = ai.confidence < LOW_CONFIDENCE_THRESHOLD;
    const nameSpoken = ai.item_name_spoken || ai.item_name;
    return {
      en: low ? `Could this be a ${ai.item_name}?` : `Is this a ${ai.item_name}?`,
      spoken: {
        hi: low ? `क्या यह ${nameSpoken} हो सकता है?` : `क्या यह ${nameSpoken} है?`,
        mr: low ? `हे ${nameSpoken} असू शकते का?` : `हे ${nameSpoken} आहे का?`,
        en: low ? `Could this be a ${ai.item_name}?` : `Is this a ${ai.item_name}?`,
      }[lang],
    };
  }

  if (key === 'material') {
    if (!ai) {
      return {
        en: 'What is it made of?',
        spoken: { hi: 'यह किस चीज़ से बना है?', mr: 'हे कशापासून बनवले आहे?', en: 'What is it made of?' }[lang],
      };
    }
    const materialSpoken = ai.material_spoken || ai.material;
    return {
      en: `Is it made of ${ai.material}?`,
      spoken: {
        hi: `क्या यह ${materialSpoken} से बना है?`,
        mr: `हे ${materialSpoken} पासून बनवले आहे का?`,
        en: `Is it made of ${ai.material}?`,
      }[lang],
    };
  }

  if (key === 'category') {
    return {
      en: 'Which craft is it?',
      spoken: { hi: 'यह किस तरह का शिल्प है?', mr: 'ही कोणत्या प्रकारची कला आहे?', en: 'Which craft is it?' }[lang],
    };
  }

  if (key === 'complexity') {
    const base = {
      en: 'How detailed is the work?',
      spoken: { hi: 'काम कितना बारीक है?', mr: 'काम किती बारीक आहे?', en: 'How detailed is the work?' }[lang],
    };
    // complexity_reason is only read when the AI actually returned a complexity.
    // Stage 6.5: read complexity_reason_spoken (the artisan's own language) when
    // present; fall back to the English complexity_reason if the AI did not
    // (or could not) give a spoken form.
    if (ai?.complexity && ai.complexity_reason) {
      const reasonSpoken = ai.complexity_reason_spoken || ai.complexity_reason;
      return { en: base.en, spoken: `${base.spoken} ${reasonSpoken}` };
    }
    return base;
  }

  return {
    en: 'What shape is it?',
    spoken: { hi: 'इसका आकार कैसा है?', mr: 'याचा आकार कसा आहे?', en: 'What shape is it?' }[lang],
  };
}

/** Spoken prompt when the artisan says "No" and should give the right answer. */
export function buildCorrectionPrompt(key: 'item_type' | 'material', speakingLanguage: string | null | undefined): string {
  const lang = asLang(speakingLanguage);
  if (key === 'item_type') {
    return { hi: 'तो यह क्या है? बोलकर बताइए।', mr: 'मग हे काय आहे? बोलून सांगा.', en: 'Then what is it? Please say it.' }[lang];
  }
  return {
    hi: 'तो यह किस चीज़ से बना है? बोलिए या नीचे से चुनिए।',
    mr: 'मग हे कशापासून बनवले आहे? बोला किंवा खालून निवडा.',
    en: 'Then what is it made of? Say it or pick below.',
  }[lang];
}
