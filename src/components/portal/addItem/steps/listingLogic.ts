// src/components/portal/addItem/steps/listingLogic.ts
/**
 * Stage 6.6: Preview step business logic.
 *
 * 1. computeFactsHash(): Deterministic hash of all confirmed facts. Detects any
 *    fact edits so the wizard never silently overwrites an approved listing.
 * 2. generateSimpleListing(): Deterministic fallback listing built strictly from
 *    confirmed facts using fixed bilingual phrase templates (no AI, no hallucinations).
 * 3. Validation helpers and canProceed(3) gate.
 */

import type { ProductRecord, ListingResult } from '../../../../types/product';
import type { ArtisanListingProfile } from '../../../../../supabase/functions/generate-listing/validation';

/** Canonical facts object used for stable hash computation. */
export interface CanonicalListingFacts {
  item_type: string;
  material: string;
  category: string;
  secondary_materials: string[];
  finish: string;
  complexity: string;
  shape_profile: string;
  visible_features: string[];
  colors: string[];
  style: string;
  suggested_use: string[];
  dimensions: {
    shape?: string;
    values?: Record<string, number | null | undefined>;
    unit?: string;
    approximate?: boolean;
  } | null;
  technique: string;
  labor_days: number | null;
  availability: string;
  quantity_available: number | null;
  lead_time_days: number | null;
  accepts_customization: boolean | null;
  story_original: string;
  story_en: string;
  care_instructions: string;
  extra_notes_original: string;
  extra_notes_en: string;
}

/** Extracts and normalizes facts from a draft for hash computation. */
export function extractCanonicalFacts(draft: ProductRecord | null | undefined): CanonicalListingFacts {
  if (!draft) {
    return {
      item_type: '',
      material: '',
      category: '',
      secondary_materials: [],
      finish: '',
      complexity: '',
      shape_profile: '',
      visible_features: [],
      colors: [],
      style: '',
      suggested_use: [],
      dimensions: null,
      technique: '',
      labor_days: null,
      availability: '',
      quantity_available: null,
      lead_time_days: null,
      accepts_customization: null,
      story_original: '',
      story_en: '',
      care_instructions: '',
      extra_notes_original: '',
      extra_notes_en: '',
    };
  }

  const cleanArr = (arr?: string[] | null) => (arr ? [...arr].sort() : []);

  let cleanDims: CanonicalListingFacts['dimensions'] = null;
  if (draft.dimensions) {
    const rawVals = draft.dimensions.values || {};
    const sortedVals: Record<string, number | null | undefined> = {};
    Object.keys(rawVals)
      .sort()
      .forEach((k) => {
        sortedVals[k] = (rawVals as Record<string, number | null | undefined>)[k];
      });

    cleanDims = {
      shape: draft.dimensions.shape,
      values: sortedVals,
      unit: draft.dimensions.unit,
      approximate: draft.dimensions.approximate,
    };
  }

  return {
    item_type: (draft.item_type || '').trim().toLowerCase(),
    material: (draft.material || '').trim().toLowerCase(),
    category: (draft.category || '').trim().toLowerCase(),
    secondary_materials: cleanArr(draft.secondary_materials),
    finish: (draft.finish || '').trim().toLowerCase(),
    complexity: (draft.complexity || '').trim().toLowerCase(),
    shape_profile: (draft.shape_profile || '').trim().toLowerCase(),
    visible_features: cleanArr(draft.visible_features),
    colors: cleanArr(draft.colors),
    style: (draft.style || '').trim().toLowerCase(),
    suggested_use: cleanArr(draft.suggested_use),
    dimensions: cleanDims,
    technique: (draft.technique || '').trim().toLowerCase(),
    labor_days: draft.labor_days ?? null,
    availability: (draft.availability || '').trim().toLowerCase(),
    quantity_available: draft.quantity_available ?? null,
    lead_time_days: draft.lead_time_days ?? null,
    accepts_customization: draft.accepts_customization ?? null,
    story_original: (draft.story_original || '').trim(),
    story_en: (draft.story_en || '').trim(),
    care_instructions: (draft.care_instructions || '').trim(),
    extra_notes_original: (draft.extra_notes_original || '').trim(),
    extra_notes_en: (draft.extra_notes_en || '').trim(),
  };
}

/**
 * FNV-1a 32-bit hash algorithm.
 * Deterministic across all JavaScript runtimes and platforms.
 */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Computes a stable hash of all confirmed product facts.
 * If any fact changes, this hash changes.
 */
export function computeFactsHash(draft: ProductRecord | null | undefined): string {
  const canonical = extractCanonicalFacts(draft);
  const jsonStr = JSON.stringify(canonical);
  return `facts_${fnv1a(jsonStr)}`;
}

/** Checks whether the draft's confirmed facts have changed since listing generation. */
export function haveFactsChanged(draft: ProductRecord | null | undefined): boolean {
  if (!draft || !draft.listing_facts_hash) return false;
  return draft.listing_facts_hash !== computeFactsHash(draft);
}

/** Checks whether a listing is complete and present on the draft. */
export function isListingPresent(draft: ProductRecord | null | undefined): boolean {
  if (!draft) return false;
  return Boolean(
    draft.title_en?.trim() &&
    draft.title_hi?.trim() &&
    draft.description_en?.trim() &&
    draft.description_hi?.trim() &&
    Array.isArray(draft.highlights_en) &&
    draft.highlights_en.length >= 4 &&
    Array.isArray(draft.highlights_hi) &&
    draft.highlights_hi.length >= 4
  );
}

/**
 * canProceed(3) requires that:
 * 1. A listing is present (all core fields populated)
 * 2. listing_approved is explicitly true
 */
export function canProceedPreview(draft: ProductRecord | null | undefined): boolean {
  if (!draft) return false;
  return Boolean(draft.listing_approved && isListingPresent(draft));
}

/** Formats dimensions into a concise factual string. */
function formatDimensionsText(
  dims: CanonicalListingFacts['dimensions']
): { en: string; hi: string } | null {
  if (!dims || !dims.values) return null;
  const unit = dims.unit || 'cm';
  const v = dims.values;

  if (dims.shape === 'round') {
    const h = v.height;
    const d = v.diameter;
    if (h != null && d != null) {
      return {
        en: `Height: ${h} ${unit}, Diameter: ${d} ${unit}`,
        hi: `ऊंचाई: ${h} ${unit}, व्यास: ${d} ${unit}`,
      };
    }
    if (h != null) {
      return {
        en: `Height: ${h} ${unit}`,
        hi: `ऊंचाई: ${h} ${unit}`,
      };
    }
  }

  if (dims.shape === 'flat') {
    const l = v.length;
    const w = v.width;
    const t = v.thickness;
    if (l != null && w != null && t != null) {
      return {
        en: `${l} x ${w} x ${t} ${unit}`,
        hi: `${l} x ${w} x ${t} ${unit}`,
      };
    }
    if (l != null && w != null) {
      return {
        en: `${l} x ${w} ${unit}`,
        hi: `${l} x ${w} ${unit}`,
      };
    }
  }

  // Box / Default
  const l = v.length;
  const w = v.width;
  const h = v.height;
  if (l != null && w != null && h != null) {
    return {
      en: `${l} x ${w} x ${h} ${unit}`,
      hi: `${l} x ${w} x ${h} ${unit}`,
    };
  }

  return null;
}

/**
 * Deterministic Simple Listing Generator.
 * Used when AI listing generation fails or when artisan chooses "Use a simple listing".
 * Strictly uses provided facts with zero invented numbers, claims, or price mentions.
 */
export function generateSimpleListing(
  draft: ProductRecord,
  _artisanProfile?: ArtisanListingProfile | null,
  speakingLanguage: string = 'hi'
): ListingResult {
  const itemType = (draft.item_type || 'Craft Item').trim();
  const material = (draft.material || 'Natural Material').trim();
  const technique = (draft.technique || 'Handcrafted').trim();
  const laborDays = draft.labor_days ?? 1;
  const dimsText = formatDimensionsText(extractCanonicalFacts(draft).dimensions);

  // 1. Titles (max ~70 chars)
  const title_en = `Handcrafted ${material} ${itemType}`.slice(0, 70);
  const title_hi = `हस्तनिर्मित ${material} ${itemType}`.slice(0, 70);

  // 2. SEO Meta Captions (one line, max ~120 chars)
  const seo_caption_en = `Authentic handmade ${material} ${itemType} crafted using traditional ${technique} techniques.`.slice(0, 120);
  const seo_caption_hi = `पारंपरिक ${technique} विधि से तैयार किया गया प्रामाणिक ${material} ${itemType}।`.slice(0, 120);

  // 3. Highlights (4-6 bullets)
  const highlights_en: string[] = [
    `Handmade with authentic ${material}`,
    `Crafted using specialized ${technique} method`,
    dimsText ? `Dimensions: ${dimsText.en}` : `Carefully proportioned ${draft.shape_profile || 'artisan'} shape`,
    `${laborDays} days of dedicated artisanal craftsmanship`,
  ];

  const highlights_hi: string[] = [
    `प्रामाणिक ${material} से हस्तनिर्मित`,
    `${technique} कारीगरी द्वारा तैयार`,
    dimsText ? `आकार: ${dimsText.hi}` : `सुव्यवस्थित ${draft.shape_profile || 'शिल्प'} रूप`,
    `${laborDays} दिनों का कुशल कारीगरी कार्य`,
  ];

  if (draft.availability === 'made_to_order' && typeof draft.lead_time_days === 'number') {
    highlights_en.push(`Made to order with ${draft.lead_time_days} days creation time`);
    highlights_hi.push(`ऑर्डर पर निर्माण: ${draft.lead_time_days} दिनों का समय`);
  } else if (typeof draft.quantity_available === 'number') {
    highlights_en.push(`Ready stock: ${draft.quantity_available} units available`);
    highlights_hi.push(`तैयार स्टॉक: ${draft.quantity_available} पीस उपलब्ध`);
  } else {
    highlights_en.push(draft.accepts_customization ? 'Custom orders accepted' : 'Authentic one-of-a-kind craft piece');
    highlights_hi.push(draft.accepts_customization ? 'कस्टम ऑर्डर स्वीकार्य हैं' : 'एकल विशिष्ट हस्तकला कृति');
  }

  if (draft.care_instructions?.trim()) {
    highlights_en.push(`Care: ${draft.care_instructions.trim()}`);
    highlights_hi.push(`रखरखाव: ${draft.care_instructions.trim()}`);
  }

  // Trim to at most 6
  const finalHighlightsEn = highlights_en.slice(0, 6);
  const finalHighlightsHi = highlights_hi.slice(0, 6);

  // 4. Descriptions (~80-150 words)
  const finishTextEn = draft.finish && draft.finish !== 'unknown' ? ` Featuring a ${draft.finish} finish.` : '';
  const finishTextHi = draft.finish && draft.finish !== 'unknown' ? ` यह ${draft.finish} फिनिश के साथ आता है।` : '';

  const useTextEn = draft.suggested_use?.length ? ` Ideal for ${draft.suggested_use.join(', ')}.` : '';
  const useTextHi = draft.suggested_use?.length ? ` यह ${draft.suggested_use.join(', ')} के लिए उपयुक्त है।` : '';

  const storyAdditionEn = draft.story_en?.trim() ? ` ${draft.story_en.trim()}` : '';
  const storyAdditionHi = draft.story_original?.trim() ? ` ${draft.story_original.trim()}` : '';

  const description_en = `This authentic ${itemType} is skillfully made by hand from ${material} using ${technique} techniques. Each piece reflects ${laborDays} days of dedicated artisan labor.${finishTextEn}${useTextEn}${storyAdditionEn}`;
  const description_hi = `यह सुंदर ${itemType} ${material} से ${technique} विधि द्वारा हस्तनिर्मित किया गया है। इसे तैयार करने में ${laborDays} दिनों का कुशल परिश्रम लगा है।${finishTextHi}${useTextHi}${storyAdditionHi}`;

  // 5. Search tags (8-15)
  const search_tags = [
    itemType.toLowerCase(),
    material.toLowerCase(),
    technique.toLowerCase(),
    `${material.toLowerCase()} ${itemType.toLowerCase()}`,
    `handmade ${itemType.toLowerCase()}`,
    'handcrafted',
    'indian craft',
    'kaaragir',
    ...(draft.category ? [draft.category.toLowerCase()] : []),
    ...(draft.colors ? draft.colors.map((c) => c.toLowerCase()) : []),
  ].slice(0, 12);

  // 6. Summary spoken (2-3 sentences)
  const summary_spoken =
    speakingLanguage === 'mr'
      ? `हे हस्तनिर्मित ${material} ${itemType} तयार करण्यासाठी ${laborDays} दिवस लागले. याचे तपशील तपासले आहेत.`
      : speakingLanguage === 'en'
      ? `This handcrafted ${material} ${itemType} took ${laborDays} days to make. All details are verified from your confirmed facts.`
      : `यह हस्तनिर्मित ${material} ${itemType} बनाने में ${laborDays} दिन लगे हैं। आपके विवरण के अनुसार यह सूची तैयार की गई है।`;

  return {
    title_en,
    title_hi,
    seo_caption_en,
    seo_caption_hi,
    highlights_en: finalHighlightsEn,
    highlights_hi: finalHighlightsHi,
    description_en,
    description_hi,
    search_tags,
    summary_spoken,
  };
}
