/**
 * Stage 6.7: priceLogic. REAL LOGIC, nothing mocked.
 * Fixture numbers are arbitrary test inputs (a bed), not values used by production code.
 */
import { describe, it, expect } from 'vitest';
import {
  areCostsComplete,
  calculateSuggestedPrice,
  canProceedPrice,
  compareToOnlineRange,
  isLossPrice,
  isValidMargin,
  lossWarningText,
  onlineNoteText,
  priceSummaryText,
  roundUpToStep,
  sumProductionCost,
  formatRupees,
} from '../steps/priceLogic';

const bedCosts = { cost_material: 12000, cost_labour: 5000, cost_hardware: 1500, cost_finishing: 1500 };

describe('sumProductionCost', () => {
  it('adds material + labour + hardware + finishing', () => {
    expect(sumProductionCost(bedCosts)).toBe(20000);
  });
  it('treats "None" (0) for hardware and finishing as answered', () => {
    expect(sumProductionCost({ ...bedCosts, cost_hardware: 0, cost_finishing: 0 })).toBe(17000);
  });
  it('is null until all four are answered, and for negative or non-finite values', () => {
    expect(sumProductionCost({ ...bedCosts, cost_hardware: null })).toBeNull();
    expect(sumProductionCost({ ...bedCosts, cost_labour: -1 })).toBeNull();
    expect(sumProductionCost({ ...bedCosts, cost_material: Number.NaN })).toBeNull();
    expect(areCostsComplete({ ...bedCosts, cost_finishing: undefined })).toBe(false);
  });
});

describe('calculateSuggestedPrice', () => {
  it('₹20,000 at 15% -> ₹23,530 and profit ₹3,530', () => {
    const r = calculateSuggestedPrice(20000, 0.15);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.suggested_price).toBe(23530);
    expect(r.value.profit).toBe(3530);
    expect(r.value.production_cost).toBe(20000);
  });

  it('0% margin sells at cost (rounded up to ₹10)', () => {
    const r = calculateSuggestedPrice(20000, 0);
    expect(r.ok && r.value.suggested_price).toBe(20000);
    const r2 = calculateSuggestedPrice(20001, 0);
    expect(r2.ok && r2.value.suggested_price).toBe(20010);
    expect(r2.ok && r2.value.profit).toBe(9);
  });

  it('rounds UP, so the real margin never falls below the target', () => {
    for (const [cost, margin] of [[20000, 0.15], [777, 0.1], [1234.5, 0.25], [99999, 0.59], [5, 0.3]] as const) {
      const r = calculateSuggestedPrice(cost, margin);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.suggested_price % 10).toBe(0);
      expect(r.value.suggested_price).toBeGreaterThanOrEqual(cost / (1 - margin) - 1e-6);
      expect(r.value.profit_share).toBeGreaterThanOrEqual(margin - 1e-9);
      expect(r.value.suggested_price - cost / (1 - margin)).toBeLessThan(10); // never rounds up by a whole step too many
    }
  });

  it('does not over-round on exact results (float noise): ₹850 at 15% is exactly ₹1,000', () => {
    const r = calculateSuggestedPrice(850, 0.15);
    expect(r.ok && r.value.suggested_price).toBe(1000);
  });

  it('rejects a margin of 60% or more, negative, or non-numeric', () => {
    for (const m of [0.6, 0.75, 1, -0.01, Number.NaN]) {
      const r = calculateSuggestedPrice(20000, m);
      expect(r).toEqual({ ok: false, error: 'invalid_margin' });
    }
    expect(isValidMargin(0.59)).toBe(true);
    expect(isValidMargin(0.6)).toBe(false);
  });

  it('rejects zero total cost, and negative or non-finite cost', () => {
    expect(calculateSuggestedPrice(0, 0.15)).toEqual({ ok: false, error: 'zero_cost' });
    expect(calculateSuggestedPrice(-5, 0.15)).toEqual({ ok: false, error: 'invalid_cost' });
    expect(calculateSuggestedPrice(Number.NaN, 0.15)).toEqual({ ok: false, error: 'invalid_cost' });
  });

  it('roundUpToStep', () => {
    expect(roundUpToStep(23529.41)).toBe(23530);
    expect(roundUpToStep(23530)).toBe(23530);
    expect(roundUpToStep(1000.0000000000001)).toBe(1000);
  });
});

describe('loss warning', () => {
  it('flags only prices strictly below production cost (warn, never block)', () => {
    expect(isLossPrice(19999, 20000)).toBe(true);
    expect(isLossPrice(20000, 20000)).toBe(false);
    expect(isLossPrice(25000, 20000)).toBe(false);
    expect(isLossPrice(null, 20000)).toBe(false);
    expect(isLossPrice(100, null)).toBe(false);
  });
  it('has the warning text in every language', () => {
    expect(lossWarningText('en').en).toBe('You will lose money on this price.');
    expect(lossWarningText('hi').spoken).toContain('नुकसान');
    expect(lossWarningText('mr').spoken).toContain('तोटा');
  });
});

describe('online range comparison', () => {
  const range = { low: 20000, high: 30000 };
  it('is silent inside (or near) the range and when there is no range', () => {
    expect(compareToOnlineRange(23530, range)).toBeNull();
    expect(compareToOnlineRange(16000, range)).toBeNull(); // within 25% below low
    expect(compareToOnlineRange(23530, null)).toBeNull();
  });
  it('notes when far below or far above', () => {
    expect(compareToOnlineRange(10000, range)).toBe('below');
    expect(compareToOnlineRange(60000, range)).toBe('above');
    expect(onlineNoteText('below', 'en').en).toContain('sell for more');
    expect(onlineNoteText('above', 'en').en).toContain('sell for less');
  });
});

describe('summary + canProceed(4)', () => {
  it('speaks the cost, margin, price and earnings', () => {
    const r = calculateSuggestedPrice(20000, 0.15);
    if (!r.ok) throw new Error('unexpected');
    expect(priceSummaryText(r.value, 'en').en).toBe('Your cost is ₹20,000. With 15% profit, sell at ₹23,530. You earn ₹3,530.');
    expect(priceSummaryText(r.value, 'hi').spoken).toContain('₹23,530');
    expect(formatRupees(3530)).toBe('₹3,530');
  });
  it('canProceed(4) needs price_final > 0', () => {
    expect(canProceedPrice(null)).toBe(false);
    expect(canProceedPrice({})).toBe(false);
    expect(canProceedPrice({ price_final: 0 })).toBe(false);
    expect(canProceedPrice({ price_final: -3 })).toBe(false);
    expect(canProceedPrice({ price_final: 23530 })).toBe(true);
    expect(canProceedPrice({ price: 23530 })).toBe(false);
  });
});
