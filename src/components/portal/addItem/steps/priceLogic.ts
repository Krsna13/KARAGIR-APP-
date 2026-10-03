// src/components/portal/addItem/steps/priceLogic.ts
// Stage 6.7: pure pricing logic for the Price step. No React, no network.
// Every number shown to the artisan is computed here from their own costs.

import type { ProductRecord } from '../../../../types/product';

export const MARGIN_PRESETS = [
  { id: 'low', margin: 0.1 },
  { id: 'fair', margin: 0.15 },
  { id: 'high', margin: 0.25 },
] as const;
export type MarginPresetId = (typeof MARGIN_PRESETS)[number]['id'];

export const DEFAULT_MARGIN = 0.15;
/** Exclusive upper bound: a margin of 60% or more is rejected. */
export const MAX_MARGIN_EXCLUSIVE = 0.6;
export const PRICE_ROUNDING_STEP = 10;
/** A suggested price this far outside the online range earns a gentle note (never an automatic change). */
export const ONLINE_RANGE_TOLERANCE = 0.25;

export interface CostInputs {
  cost_material: number | null | undefined;
  cost_labour: number | null | undefined;
  cost_hardware: number | null | undefined;
  cost_finishing: number | null | undefined;
}

export const isValidCost = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function costInputsFromDraft(draft: Partial<ProductRecord> | null | undefined): CostInputs {
  return {
    cost_material: draft?.cost_material ?? null,
    cost_labour: draft?.cost_labour ?? null,
    cost_hardware: draft?.cost_hardware ?? null,
    cost_finishing: draft?.cost_finishing ?? null,
  };
}

/** Material and labour are required; hardware and finishing may be 0 ("None") but must be answered. */
export function areCostsComplete(c: CostInputs): boolean {
  return isValidCost(c.cost_material) && isValidCost(c.cost_labour) && isValidCost(c.cost_hardware) && isValidCost(c.cost_finishing);
}

/** Total production cost = material + labour + hardware + finishing. Null until all four are answered. */
export function sumProductionCost(c: CostInputs): number | null {
  if (!areCostsComplete(c)) return null;
  return (c.cost_material as number) + (c.cost_labour as number) + (c.cost_hardware as number) + (c.cost_finishing as number);
}

export const isValidMargin = (m: unknown): m is number =>
  typeof m === 'number' && Number.isFinite(m) && m >= 0 && m < MAX_MARGIN_EXCLUSIVE;

export type PriceCalcError = 'zero_cost' | 'invalid_cost' | 'invalid_margin';

export interface PriceCalculation {
  production_cost: number;
  margin: number;
  /** Selling price rounded UP to the nearest ₹10, so the real margin is never below target. */
  suggested_price: number;
  profit: number;
  /** Real profit as a share of the selling price (0..1), always >= margin. */
  profit_share: number;
}

export type PriceCalcResult = { ok: true; value: PriceCalculation } | { ok: false; error: PriceCalcError };

/** Rounds up to the next multiple of `step`, tolerating float noise (e.g. 1000.0000000000001). */
export function roundUpToStep(value: number, step: number = PRICE_ROUNDING_STEP): number {
  return Math.ceil(value / step - 1e-9) * step;
}

/** selling price = production_cost ÷ (1 − margin), rounded up to the nearest ₹10. */
export function calculateSuggestedPrice(productionCost: number, margin: number): PriceCalcResult {
  if (typeof productionCost !== 'number' || !Number.isFinite(productionCost) || productionCost < 0) {
    return { ok: false, error: 'invalid_cost' };
  }
  if (productionCost === 0) return { ok: false, error: 'zero_cost' };
  if (!isValidMargin(margin)) return { ok: false, error: 'invalid_margin' };

  const suggested_price = roundUpToStep(productionCost / (1 - margin));
  const profit = suggested_price - productionCost;
  return {
    ok: true,
    value: { production_cost: productionCost, margin, suggested_price, profit, profit_share: profit / suggested_price },
  };
}

/** Warn (never block) when the chosen price would not cover production cost. */
export function isLossPrice(price: number | null | undefined, productionCost: number | null | undefined): boolean {
  return typeof price === 'number' && typeof productionCost === 'number' && price < productionCost;
}

export interface OnlineRange {
  low: number;
  high: number;
}

/** 'below' / 'above' when the suggested price is well outside the online range; null when inside or no range. */
export function compareToOnlineRange(
  suggested: number,
  range: OnlineRange | null | undefined
): 'below' | 'above' | null {
  if (!range || !(range.low > 0) || !(range.high >= range.low)) return null;
  if (suggested < range.low * (1 - ONLINE_RANGE_TOLERANCE)) return 'below';
  if (suggested > range.high * (1 + ONLINE_RANGE_TOLERANCE)) return 'above';
  return null;
}

export const formatRupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const formatPercent = (fraction: number): string => `${Math.round(fraction * 1000) / 10}%`;

/** canProceed(4): the artisan has confirmed a final price above zero. */
export function canProceedPrice(draft: Partial<ProductRecord> | null | undefined): boolean {
  const p = draft?.price_final;
  return typeof p === 'number' && Number.isFinite(p) && p > 0;
}

// ---------------------------------------------------------------------------
// Bilingual copy (en / hi / mr). `en` is always shown; `spoken` is in the artisan's language.
// ---------------------------------------------------------------------------

export type PriceLang = 'hi' | 'mr' | 'en';
export interface PriceText {
  en: string;
  spoken: string;
}

const pick = (lang: PriceLang, en: string, hi: string, mr: string): PriceText => ({
  en,
  spoken: lang === 'en' ? en : lang === 'mr' ? mr : hi,
});

export type CostKey = 'cost_material' | 'cost_labour' | 'cost_hardware' | 'cost_finishing';

export function costQuestionText(key: CostKey, lang: PriceLang): PriceText {
  switch (key) {
    case 'cost_material':
      return pick(lang, 'Material cost', 'सामग्री का खर्च', 'सामग्रीचा खर्च');
    case 'cost_labour':
      return pick(lang, 'Labour cost', 'मज़दूरी', 'मजुरी');
    case 'cost_hardware':
      return pick(lang, 'Hardware cost (screws, hinges, fittings)', 'हार्डवेयर (स्क्रू, कब्ज़े, फिटिंग) का खर्च', 'हार्डवेअर (स्क्रू, बिजागरी, फिटिंग) खर्च');
    case 'cost_finishing':
      return pick(lang, 'Finishing cost (polish, paint)', 'फिनिशिंग (पॉलिश, रंग) का खर्च', 'फिनिशिंग (पॉलिश, रंग) खर्च');
  }
}

export const noneLabel = (lang: PriceLang): PriceText => pick(lang, 'None', 'कोई नहीं', 'काहीही नाही');

export function marginPresetText(id: 'low' | 'fair' | 'high', lang: PriceLang): PriceText {
  switch (id) {
    case 'low':
      return pick(lang, 'Low profit, sells faster', 'कम मुनाफ़ा', 'कमी नफा');
    case 'fair':
      return pick(lang, 'Fair profit', 'सही मुनाफ़ा', 'योग्य नफा');
    case 'high':
      return pick(lang, 'High profit', 'ज़्यादा मुनाफ़ा', 'जास्त नफा');
  }
}

/** e.g. "Your cost is ₹X. With P% profit, sell at ₹S. You earn ₹G." */
export function priceSummaryText(calc: PriceCalculation, lang: PriceLang): PriceText {
  const cost = formatRupees(calc.production_cost);
  const pct = formatPercent(calc.margin);
  const price = formatRupees(calc.suggested_price);
  const profit = formatRupees(calc.profit);
  return pick(
    lang,
    `Your cost is ${cost}. With ${pct} profit, sell at ${price}. You earn ${profit}.`,
    `आपकी लागत ${cost} है। ${pct} मुनाफ़े के साथ ${price} में बेचें। आपकी कमाई ${profit} है।`,
    `तुमचा खर्च ${cost} आहे. ${pct} नफ्यासह ${price} ला विका. तुमची कमाई ${profit} आहे.`
  );
}

export const lossWarningText = (lang: PriceLang): PriceText =>
  pick(lang, 'You will lose money on this price.', 'इस कीमत पर आपको नुकसान होगा।', 'या किमतीत तुम्हाला तोटा होईल.');

export function onlineNoteText(position: 'below' | 'above', lang: PriceLang): PriceText {
  return position === 'below'
    ? pick(
        lang,
        'Similar items online sell for more. You could consider a higher price, but the choice is yours.',
        'ऑनलाइन मिलती-जुलती चीज़ें ज़्यादा में बिकती हैं। आप चाहें तो ज़्यादा कीमत सोच सकते हैं, फ़ैसला आपका है।',
        'ऑनलाइन मिळत्याजुळत्या वस्तू जास्त किमतीला विकल्या जातात. हवे तर जास्त किंमत विचारात घ्या, निर्णय तुमचा आहे.'
      )
    : pick(
        lang,
        'Similar items online sell for less. Your price is higher, which is fine if your work is special.',
        'ऑनलाइन मिलती-जुलती चीज़ें कम में बिकती हैं। आपकी कीमत ज़्यादा है, अगर आपका काम खास है तो ठीक है।',
        'ऑनलाइन मिळत्याजुळत्या वस्तू कमी किमतीला विकल्या जातात. तुमची किंमत जास्त आहे, तुमचे काम खास असेल तर ठीक आहे.'
      );
}
