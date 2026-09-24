// supabase/functions/generate-listing/validation.ts
/**
 * Stage 6.6: Pure validation function for generated product listings.
 * Enforces NO-FABRICATION rules:
 * 1. Numbers must strictly match confirmed facts (dimensions, cm-converted, labor_days,
 *    experience_years, quantity, lead time, or numbers present in artisan text inputs).
 * 2. No price or currency mentions anywhere (pricing is a separate wizard step).
 * 3. Risky claims (antique, vintage, heritage, eco-friendly, organic, sustainable, certified,
 *    GI tag, award-winning, generations, centuries, 100%, guaranteed, etc.) allowed ONLY if
 *    present in the artisan's own story, care instructions, or extra notes.
 * 4. Experience years must never be mentioned if experience_years is not set (and never '0 years').
 * 5. Full schema validation for English & Hindi listings.
 */

import { RISKY_CLAIMS } from '../_shared/riskyClaimsConfig.ts';

export interface ListingValidationResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  failedRule?: 'schema' | 'numbers' | 'price' | 'risky_claims' | 'experience';
}

export interface ListingOutput {
  title_en: string;
  title_hi: string;
  seo_caption_en: string;
  seo_caption_hi: string;
  highlights_en: string[];
  highlights_hi: string[];
  description_en: string;
  description_hi: string;
  search_tags: string[];
  summary_spoken: string;
}

export interface ArtisanListingProfile {
  shop_name?: string | null;
  city?: string | null;
  experience_years?: number | null;
}

export interface ProductFactsInput {
  item_type?: string | null;
  material?: string | null;
  category?: string | null;
  secondary_materials?: string[] | null;
  finish?: string | null;
  complexity?: string | null;
  shape_profile?: string | null;
  visible_features?: string[] | null;
  colors?: string[] | null;
  style?: string | null;
  suggested_use?: string[] | null;
  dimensions?: {
    shape?: string;
    values?: Record<string, number | null | undefined>;
    unit?: string;
    approximate?: boolean;
  } | null;
  normalized_dimensions?: any;
  technique?: string | null;
  labor_days?: number | null;
  availability?: string | null;
  quantity_available?: number | null;
  lead_time_days?: number | null;
  accepts_customization?: boolean | null;
  story_original?: string | null;
  story_en?: string | null;
  care_instructions?: string | null;
  extra_notes_original?: string | null;
  extra_notes_en?: string | null;
}

/** Converts Devanagari numerals (०-९) to standard ASCII digits (0-9). */
export function devanagariToStandardDigits(str: string): string {
  const map: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  };
  return str.replace(/[०-९]/g, (ch) => map[ch] ?? ch);
}

/** Extracts all numeric tokens from arbitrary text (English or Hindi digits). */
export function extractNumbersFromText(text: string): number[] {
  if (!text || typeof text !== 'string') return [];
  const normalized = devanagariToStandardDigits(text);
  const matches = normalized.match(/\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((m) => parseFloat(m)).filter((n) => !Number.isNaN(n));
}

/** Extracts all verified allowed numbers from the confirmed facts and artisan profile. */
export function extractAllowedNumbers(
  facts: ProductFactsInput,
  artisanProfile?: ArtisanListingProfile | null
): Set<number> {
  const allowed = new Set<number>();

  const addNum = (val: unknown) => {
    if (typeof val === 'number' && !Number.isNaN(val)) {
      allowed.add(val);
      // Also add common conversions / roundings for dimensions
      allowed.add(Math.round(val));
      allowed.add(Math.floor(val));
      allowed.add(Math.ceil(val));
      allowed.add(parseFloat(val.toFixed(1)));
      allowed.add(parseFloat(val.toFixed(0)));
    }
  };

  // 1. Raw dimension values
  if (facts.dimensions?.values && typeof facts.dimensions.values === 'object') {
    Object.values(facts.dimensions.values).forEach(addNum);
  }

  // 2. Normalized dimensions (cm conversions)
  if (facts.normalized_dimensions && typeof facts.normalized_dimensions === 'object') {
    Object.values(facts.normalized_dimensions).forEach(addNum);
  }

  // 3. Labor days
  if (typeof facts.labor_days === 'number') {
    addNum(facts.labor_days);
  }

  // 4. Quantity available
  if (typeof facts.quantity_available === 'number') {
    addNum(facts.quantity_available);
  }

  // 5. Lead time days
  if (typeof facts.lead_time_days === 'number') {
    addNum(facts.lead_time_days);
  }

  // 6. Experience years (only if set and positive)
  if (artisanProfile?.experience_years && artisanProfile.experience_years > 0) {
    addNum(artisanProfile.experience_years);
  }

  // 7. Numbers explicitly stated by the artisan in their own voice text / story / care / notes
  const artisanTexts = [
    facts.story_original,
    facts.story_en,
    facts.care_instructions,
    facts.extra_notes_original,
    facts.extra_notes_en,
  ].filter(Boolean) as string[];

  for (const text of artisanTexts) {
    const nums = extractNumbersFromText(text);
    nums.forEach(addNum);
  }

  // 8. Numbers appearing in visible_features
  if (Array.isArray(facts.visible_features)) {
    for (const feat of facts.visible_features) {
      if (typeof feat === 'string') {
        const nums = extractNumbersFromText(feat);
        nums.forEach(addNum);
      }
    }
  }

  return allowed;
}

/** Check for prohibited price or currency mentions. */
const PRICE_PATTERNS = [
  /₹/,
  /\b(?:rs\.?|inr|price|prices|pricing|rupee|rupees)\b/i,
  /कीमत/i,
  /मूल्य/i,
  /दाम/i,
  /रुपये/i,
  /रुपया/i,
];

export function findPriceMention(text: string): string | null {
  for (const pattern of PRICE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * Validates a generated listing result against all No-Fabrication and schema rules.
 */
export function validateListingResult(
  output: unknown,
  facts: ProductFactsInput,
  artisanProfile?: ArtisanListingProfile | null
): ListingValidationResult<ListingOutput> {
  // 1. Basic schema check
  if (!output || typeof output !== 'object') {
    return { ok: false, error: 'Output must be a JSON object.', failedRule: 'schema' };
  }

  const raw = output as Record<string, unknown>;

  const checkString = (key: string, min = 1, max = 2000): string | null => {
    const val = raw[key];
    if (typeof val !== 'string' || val.trim().length < min || val.trim().length > max) {
      return `Field '${key}' must be a non-empty string between ${min} and ${max} characters.`;
    }
    return null;
  };

  const checkArray = (key: string, min: number, max: number): string | null => {
    const val = raw[key];
    if (!Array.isArray(val) || val.length < min || val.length > max) {
      return `Field '${key}' must be an array of ${min} to ${max} items.`;
    }
    if (val.some((item) => typeof item !== 'string' || !item.trim())) {
      return `Field '${key}' items must all be non-empty strings.`;
    }
    return null;
  };

  const schemaErrors = [
    checkString('title_en', 3, 100),
    checkString('title_hi', 3, 100),
    checkString('seo_caption_en', 5, 200),
    checkString('seo_caption_hi', 5, 200),
    checkArray('highlights_en', 4, 6),
    checkArray('highlights_hi', 4, 6),
    checkString('description_en', 30, 2000),
    checkString('description_hi', 30, 2000),
    checkArray('search_tags', 6, 20),
    checkString('summary_spoken', 10, 1000),
  ].filter(Boolean);

  if (schemaErrors.length > 0) {
    return { ok: false, error: schemaErrors.join(' '), failedRule: 'schema' };
  }

  const result: ListingOutput = {
    title_en: String(raw.title_en).trim(),
    title_hi: String(raw.title_hi).trim(),
    seo_caption_en: String(raw.seo_caption_en).trim(),
    seo_caption_hi: String(raw.seo_caption_hi).trim(),
    highlights_en: (raw.highlights_en as string[]).map((s) => s.trim()),
    highlights_hi: (raw.highlights_hi as string[]).map((s) => s.trim()),
    description_en: String(raw.description_en).trim(),
    description_hi: String(raw.description_hi).trim(),
    search_tags: (raw.search_tags as string[]).map((s) => s.trim()),
    summary_spoken: String(raw.summary_spoken).trim(),
  };

  // Combine all generated texts for rule checking
  const allGeneratedTexts = [
    result.title_en,
    result.title_hi,
    result.seo_caption_en,
    result.seo_caption_hi,
    ...result.highlights_en,
    ...result.highlights_hi,
    result.description_en,
    result.description_hi,
    ...result.search_tags,
    result.summary_spoken,
  ];
  const combinedText = allGeneratedTexts.join(' ');

  // 2. Price / Currency Check
  const priceMatch = findPriceMention(combinedText);
  if (priceMatch) {
    return {
      ok: false,
      error: `Output mentions price or currency ('${priceMatch}'). Pricing is not permitted in this step.`,
      failedRule: 'price',
    };
  }

  // Build corpus of artisan-provided source texts
  const artisanSourceCorpus = [
    facts.story_original,
    facts.story_en,
    facts.care_instructions,
    facts.extra_notes_original,
    facts.extra_notes_en,
  ]
    .filter(Boolean)
    .join(' ');

  // 3. Experience Years Rule
  const hasExperience = typeof artisanProfile?.experience_years === 'number' && artisanProfile.experience_years > 0;

  // Never allow "0 years" under any circumstance
  const zeroYearsPatterns = [
    /\b0\s*(?:years?|yrs?)\b/i,
    /\b0\s*(?:years?|yrs?)\s*(?:of\s*)?experience\b/i,
    /(?<![0-9०-९])०\s*साल/i,
    /(?<![0-9०-९])०\s*वर्ष/i,
    /(?<![0-9०-९])0\s*साल/i,
    /(?<![0-9०-९])0\s*वर्ष/i,
  ];
  for (const pattern of zeroYearsPatterns) {
    if (pattern.test(combinedText)) {
      return {
        ok: false,
        error: "Output mentions '0 years' of experience, which is invalid.",
        failedRule: 'experience',
      };
    }
  }

  // If experience_years is NOT set, text must not mention experience years unless explicitly stated by artisan
  if (!hasExperience) {
    const experienceMentions = [
      /\b\d+\s*(?:years?|yrs?)\s*(?:of\s*)?experience\b/i,
      /\b\d+\s*(?:years?|yrs?)\s*in\s*craft(?:ing)?\b/i,
      /साल(?:ों)?\s*का\s*अनुभव/i,
      /वर्ष(?:ों)?\s*का\s*अनुभव/i,
    ];
    for (const pattern of experienceMentions) {
      if (pattern.test(combinedText)) {
        const verifiedByArtisan = pattern.test(artisanSourceCorpus);
        if (!verifiedByArtisan) {
          return {
            ok: false,
            error: 'Output mentions years of experience, but experience_years is not set on the artisan profile.',
            failedRule: 'experience',
          };
        }
      }
    }
  }

  // 4. Risky Claims Rule

  for (const claim of RISKY_CLAIMS) {
    // Does the generated output contain any pattern of this risky claim?
    let matchedPattern: RegExp | null = null;
    for (const pattern of claim.patterns) {
      if (pattern.test(combinedText)) {
        matchedPattern = pattern;
        break;
      }
    }

    if (matchedPattern) {
      // Check if ANY pattern of this claim was present in the artisan's source corpus
      const verifiedByArtisan = claim.patterns.some((p) => p.test(artisanSourceCorpus));
      if (!verifiedByArtisan) {
        return {
          ok: false,
          error: `Output contains unverified risky claim '${claim.label}'. Such claims are only permitted if explicitly stated in the artisan's own story or notes.`,
          failedRule: 'risky_claims',
        };
      }
    }
  }

  // 5. Numbers Rule: Every number in the generated output must match an allowed fact number
  const allowedNumbers = extractAllowedNumbers(facts, artisanProfile);
  const foundNumbers = extractNumbersFromText(combinedText);

  for (const num of foundNumbers) {
    if (!allowedNumbers.has(num)) {
      return {
        ok: false,
        error: `Output contains unauthorized number: ${num}. Numbers must strictly come from confirmed facts.`,
        failedRule: 'numbers',
      };
    }
  }

  return { ok: true, value: result };
}
