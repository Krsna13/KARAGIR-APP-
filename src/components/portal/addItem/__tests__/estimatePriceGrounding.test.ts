/**
 * Stage 6.7: estimate-price grounding rules. REAL LOGIC (supabase/functions/estimate-price/grounding.ts).
 * The Gemini calls themselves are not exercised here; these tests cover what we do with their output.
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_LISTINGS,
  buildEstimate,
  extractSources,
  priceAppearsInText,
} from '../../../../../supabase/functions/estimate-price/grounding';

const sources = [
  { url: 'https://shop-a.example/bed', title: 'shop-a.example' },
  { url: 'https://shop-b.example/bed', title: 'shop-b.example' },
];
const text = 'Teak bed at Shop A for ₹24,500. Sheesham bed at Shop B for Rs 31000. Another bed ₹ 18,900 at Shop A.';

describe('extractSources', () => {
  it('uses only http(s) grounding chunks, de-duplicated', () => {
    const out = extractSources({
      groundingChunks: [
        { web: { uri: 'https://a.example/x', title: 'A' } },
        { web: { uri: 'https://a.example/x', title: 'A again' } },
        { web: { uri: 'javascript:alert(1)', title: 'bad' } },
        { retrievedContext: { uri: 'https://nope.example' } },
        { web: { uri: 'https://b.example/y' } },
      ],
    });
    expect(out).toEqual([
      { url: 'https://a.example/x', title: 'A' },
      { url: 'https://b.example/y', title: 'https://b.example/y' },
    ]);
  });
  it('returns nothing without grounding metadata', () => {
    expect(extractSources(undefined)).toEqual([]);
    expect(extractSources({})).toEqual([]);
  });
});

describe('priceAppearsInText', () => {
  it('matches the number regardless of comma formatting, never a substring of a bigger number', () => {
    expect(priceAppearsInText(24500, text)).toBe(true);
    expect(priceAppearsInText(31000, text)).toBe(true);
    expect(priceAppearsInText(2450, text)).toBe(false);
    expect(priceAppearsInText(4500, text)).toBe(false);
    expect(priceAppearsInText(99999, text)).toBe(false);
  });
});

describe('buildEstimate', () => {
  const listing = (title: string, price: number, idx: number) => ({ title, price_inr: price, source_index: idx });

  it('returns the real min–max with sources when there are at least 3 verified listings', () => {
    expect(MIN_LISTINGS).toBe(3);
    const r = buildEstimate(
      { listings: [listing('Teak bed', 24500, 0), listing('Sheesham bed', 31000, 1), listing('Plain bed', 18900, 0)] },
      sources,
      text
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.low).toBe(18900);
    expect(r.high).toBe(31000);
    expect(r.listings).toHaveLength(3);
    expect(r.sources.map((s) => s.url).sort()).toEqual(sources.map((s) => s.url).sort());
  });

  it('fewer than 3 real listings -> insufficient, no numbers', () => {
    const r = buildEstimate({ listings: [listing('Teak bed', 24500, 0), listing('Sheesham bed', 31000, 1)] }, sources, text);
    expect(r).toEqual({ status: 'insufficient', listings: [], sources });
    expect('low' in r).toBe(false);
  });

  it('drops invented prices (not in the grounded text), bad source indexes, non-positive prices and duplicates', () => {
    const r = buildEstimate(
      {
        listings: [
          listing('Teak bed', 24500, 0),
          listing('Teak bed', 24500, 0), // duplicate
          listing('Made-up bed', 12345, 0), // price never seen in text
          listing('Ghost source', 31000, 7), // source index out of range
          listing('Negative', -5, 0),
          listing('Fractional index', 18900, 0.5 as unknown as number),
        ],
      },
      sources,
      text
    );
    expect(r.status).toBe('insufficient');
  });

  it('is insufficient for malformed model output', () => {
    expect(buildEstimate(null, sources, text).status).toBe('insufficient');
    expect(buildEstimate({ listings: 'x' }, sources, text).status).toBe('insufficient');
  });
});
