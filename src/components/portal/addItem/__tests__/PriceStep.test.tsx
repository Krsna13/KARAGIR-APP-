/**
 * Stage 6.7: PriceStep (Add Item wizard step 4).
 *
 * REAL LOGIC under test (not mocked): PriceStep, priceLogic, VoiceOrTypeInput's typed-number path,
 * and the real draftService writing to the products row through the Supabase client.
 *
 * MOCKED AT THE BOUNDARY (explicitly):
 *   - Supabase client -> in-memory fake (src/test/fakeSupabase.ts). No Postgres, RLS or triggers.
 *   - priceEstimateService (fetchOnlineEstimate / recordConfirmedPrice): vi.fn. These are the
 *     estimate-price and record-pricing Edge Function invocations; no network, no Gemini.
 *   - speakText: vi.fn, so we can assert what is read aloud (no speech engine under jsdom).
 * Fixture numbers (a bed) are arbitrary test inputs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useCallback, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PriceStep } from '../steps/PriceStep';
import { fakeSupabase } from '../../../../test/fakeSupabase';
import { speakText } from '../../../../config/languages';
import { debouncedSaveDraft } from '../../../../services/draftService';
import { fetchOnlineEstimate, recordConfirmedPrice } from '../../../../services/priceEstimateService';
import { canProceedPrice } from '../steps/priceLogic';
import type { ProductRecord } from '../../../../types/product';

vi.mock('../../../../lib/supabase/client', async () => {
  const { fakeSupabase: fake } = await import('../../../../test/fakeSupabase');
  return { supabase: fake.client };
});
vi.mock('../../../../config/languages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../config/languages')>()),
  speakText: vi.fn(),
}));
vi.mock('../../../../services/priceEstimateService', () => ({
  fetchOnlineEstimate: vi.fn(),
  recordConfirmedPrice: vi.fn(),
}));

const PRODUCT = 'prod-1';

const baseDraft = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
  id: PRODUCT,
  artisan_id: 'artisan-1',
  listing_status: 'draft',
  wizard_step: 4,
  created_at: '2026-10-03T00:00:00Z',
  item_type: 'Bed',
  material: 'Teak',
  ...overrides,
});

const withCosts = (overrides: Partial<ProductRecord> = {}) =>
  baseDraft({ cost_material: 12000, cost_labour: 5000, cost_hardware: 1500, cost_finishing: 1500, production_cost: 20000, ...overrides });

describe('PriceStep (Stage 6.7)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latestDraft: ProductRecord;

  const Harness: React.FC<{ initial: ProductRecord; lang?: string }> = ({ initial, lang = 'en' }) => {
    const [draft, setDraft] = useState(initial);
    latestDraft = draft;
    const onDraftPatch = useCallback((patch: Partial<ProductRecord>) => setDraft((prev) => ({ ...prev, ...patch })), []);
    latestDraft = draft;
    return <PriceStep productId={PRODUCT} draft={draft} speakingLanguage={lang} onDraftPatch={onDraftPatch} />;
  };

  const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const flush = async (rounds = 4) => {
    for (let i = 0; i < rounds; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  };
  const click = async (el: HTMLElement | null) => {
    expect(el).not.toBeNull();
    await act(async () => el!.click());
    await flush();
  };
  const typeNumber = async (scope: HTMLElement, value: string) => {
    const input = scope.querySelector('[data-testid="voice-or-type-number-input"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(scope.querySelector('[data-testid="voice-or-type-number-submit"]') as HTMLElement);
  };
  const render = async (initial: ProductRecord, lang = 'en') => {
    await act(async () => root.render(<Harness initial={initial} lang={lang} />));
    await flush();
  };
  const persisted = async () => {
    await act(async () => void (await debouncedSaveDraft.flush(PRODUCT)));
    return fakeSupabase.rows('products')[0];
  };

  beforeEach(() => {
    fakeSupabase.reset({ products: [baseDraft()] });
    vi.mocked(speakText).mockClear();
    vi.mocked(fetchOnlineEstimate).mockReset();
    vi.mocked(fetchOnlineEstimate).mockResolvedValue({ status: 'insufficient' });
    vi.mocked(recordConfirmedPrice).mockReset();
    vi.mocked(recordConfirmedPrice).mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    debouncedSaveDraft.cancel();
    vi.restoreAllMocks();
  });

  const spoken = () => vi.mocked(speakText).mock.calls.map((c) => c[0]).join(' | ');

  it('shows no price before any cost is entered, and asks material first, spoken aloud', async () => {
    await render(baseDraft());
    expect(q('question-card-cost_material')).not.toBeNull();
    expect(container.textContent).not.toContain('₹');
    expect(spoken()).toContain('Material cost');
  });

  it('asks the four costs in order; hardware and finishing have a None button that sets 0', async () => {
    fakeSupabase.reset({ products: [baseDraft()] });
    await render(baseDraft());

    expect(q('none-cost_material')).toBeNull(); // required, no None
    await typeNumber(q('question-card-cost_material')!, '12000');

    expect(q('question-card-cost_labour')).not.toBeNull();
    expect(q('none-cost_labour')).toBeNull();
    await typeNumber(q('question-card-cost_labour')!, '5000');

    expect(q('question-card-cost_hardware')).not.toBeNull();
    await click(q('none-cost_hardware'));

    expect(q('question-card-cost_finishing')).not.toBeNull();
    await click(q('none-cost_finishing'));

    expect(q('price-profit-card')).not.toBeNull();
    const row = await persisted();
    expect(row).toMatchObject({ cost_material: 12000, cost_labour: 5000, cost_hardware: 0, cost_finishing: 0, production_cost: 17000 });
    expect(q('total-production-cost')!.textContent).toBe('₹17,000');
    expect(q('breakdown-cost_hardware')!.textContent).toContain('₹0');
  });

  it('speaks Hindi questions for a Hindi speaker', async () => {
    await render(baseDraft(), 'hi');
    expect(spoken()).toContain('सामग्री का खर्च');
  });

  it('shows breakdown, defaults to 15% and computes the suggested price from the costs', async () => {
    await render(withCosts());
    expect(q('margin-fair')!.getAttribute('data-selected')).toBe('true');
    expect(q('total-production-cost')!.textContent).toBe('₹20,000');
    expect(q('result-cost')!.textContent).toBe('₹20,000');
    expect(q('result-price')!.textContent).toBe('₹23,530');
    expect(q('result-profit')!.textContent).toBe('₹3,530');
    expect(q('result-share')!.textContent).toContain('15%');
    expect(spoken()).toContain('Your cost is ₹20,000. With 15% profit, sell at ₹23,530. You earn ₹3,530.');
  });

  it('presets change the margin and the suggested price, and persist target_margin + price_deterministic', async () => {
    await render(withCosts());
    await click(q('margin-high'));
    expect(q('result-price')!.textContent).toBe('₹26,670'); // 20000 / 0.75 = 26666.67 -> 26670
    await click(q('margin-low'));
    expect(q('result-price')!.textContent).toBe('₹22,230'); // 20000 / 0.9 = 22222.22 -> 22230
    const row = await persisted();
    expect(row.target_margin).toBe(0.1);
    expect(row.price_deterministic).toBe(22230);
  });

  it('custom margin accepts 0–59% and rejects 60% or more', async () => {
    await render(withCosts());
    await click(q('margin-custom'));
    await typeNumber(q('margin-custom-input')!, '60');
    expect(q('margin-error')).not.toBeNull();
    expect(q('result-price')!.textContent).toBe('₹23,530'); // unchanged

    await typeNumber(q('margin-custom-input')!, '20');
    expect(q('margin-error')).toBeNull();
    expect(q('result-price')!.textContent).toBe('₹25,000'); // 20000 / 0.8 = 25000 exactly
    expect((await persisted()).target_margin).toBeCloseTo(0.2, 10);
  });

  it('zero total cost is rejected: no price, no margin choices', async () => {
    await render(withCosts({ cost_material: 0, cost_labour: 0, cost_hardware: 0, cost_finishing: 0, production_cost: 0 }));
    expect(q('zero-cost-error')).not.toBeNull();
    expect(q('result-price')).toBeNull();
    expect(q('continue-to-final')).toBeNull();
  });

  it('"Use suggested price" saves all cost fields, suggested, final and price, then records training data', async () => {
    await render(withCosts());
    await click(q('continue-to-final'));
    await click(q('use-suggested-price'));

    const row = await persisted();
    expect(row).toMatchObject({
      cost_material: 12000,
      cost_labour: 5000,
      cost_hardware: 1500,
      cost_finishing: 1500,
      production_cost: 20000,
      target_margin: 0.15,
      price_deterministic: 23530,
      price_final: 23530,
      price: 23530,
    });
    expect(recordConfirmedPrice).toHaveBeenCalledWith(PRODUCT);
    expect(canProceedPrice(latestDraft)).toBe(true);
    expect(q('confirmed-price')!.textContent).toBe('₹23,530');
  });

  it('an own price at or above cost is saved straight away', async () => {
    await render(withCosts({ production_cost: 20000, target_margin: 0.15, price_deterministic: 23530 }));
    await click(q('continue-to-final'));
    await typeNumber(q('own-price')!, '25000');
    expect(q('loss-warning')).toBeNull();
    const row = await persisted();
    expect(row).toMatchObject({ price_final: 25000, price: 25000, price_deterministic: 23530 });
  });

  it('a price below production cost warns, speaks, and needs a second confirmation (not blocked)', async () => {
    await render(withCosts());
    await click(q('continue-to-final'));
    await typeNumber(q('own-price')!, '15000');

    expect(q('loss-warning')!.textContent).toContain('You will lose money on this price.');
    expect(spoken()).toContain('You will lose money on this price.');
    expect(recordConfirmedPrice).not.toHaveBeenCalled();
    expect(canProceedPrice(latestDraft)).toBe(false);
    expect((await persisted()).price_final ?? null).toBeNull();

    await click(q('loss-cancel')); // can back out
    expect(q('loss-warning')).toBeNull();

    await typeNumber(q('own-price')!, '15000');
    await click(q('loss-confirm')); // warn, don't block
    const row = await persisted();
    expect(row).toMatchObject({ price_final: 15000, price: 15000 });
    expect(recordConfirmedPrice).toHaveBeenCalledTimes(1);
    expect(canProceedPrice(latestDraft)).toBe(true);
  });

  it('canProceed(4) is false until a final price is confirmed', async () => {
    await render(withCosts());
    expect(canProceedPrice(latestDraft)).toBe(false);
    await click(q('continue-to-final'));
    expect(canProceedPrice(latestDraft)).toBe(false);
  });

  it('changing a cost after confirming clears the confirmed price so it must be confirmed again', async () => {
    await render(withCosts({ price_final: 23530, price: 23530, target_margin: 0.15, price_deterministic: 23530 }));
    expect(q('price-final-card')).not.toBeNull(); // resumes on the final card
    await click(q('edit-cost_labour'));
    await typeNumber(q('question-card-cost_labour')!, '6000');
    const row = await persisted();
    expect(row.cost_labour).toBe(6000);
    expect(row.production_cost).toBe(21000);
    expect(row.price_final ?? null).toBeNull();
    expect(canProceedPrice(latestDraft)).toBe(false);
  });

  describe('online comparison (secondary, never blocks)', () => {
    it('shows the real range and source links only from the function result', async () => {
      vi.mocked(fetchOnlineEstimate).mockResolvedValue({
        status: 'ok',
        low: 20000,
        high: 30000,
        listings: [],
        sources: [{ url: 'https://shop-a.example/bed', title: 'shop-a.example' }],
      });
      await render(withCosts());
      expect(fetchOnlineEstimate).toHaveBeenCalledWith(PRODUCT);
      expect(q('online-ok')!.textContent).toContain('Similar items online: ₹20,000 – ₹30,000');
      const link = q('online-source') as HTMLAnchorElement;
      expect(link.href).toBe('https://shop-a.example/bed');
      expect(q('online-note')).toBeNull(); // 23,530 is inside the range
    });

    it('insufficient data shows "Not enough online data" and no numbers', async () => {
      await render(withCosts());
      expect(q('online-insufficient')!.textContent).toContain('Not enough online data');
      expect(q('online-card')!.textContent).not.toContain('₹');
    });

    it('an unavailable service never blocks pricing', async () => {
      vi.mocked(fetchOnlineEstimate).mockResolvedValue({ status: 'unavailable' });
      await render(withCosts());
      expect(q('online-unavailable')).not.toBeNull();
      await click(q('continue-to-final'));
      await click(q('use-suggested-price'));
      expect((await persisted()).price_final).toBe(23530);
    });

    it('a suggested price far outside the online range gets a gentle spoken note and no automatic change', async () => {
      vi.mocked(fetchOnlineEstimate).mockResolvedValue({
        status: 'ok',
        low: 60000,
        high: 80000,
        listings: [],
        sources: [{ url: 'https://shop-b.example/bed', title: 'shop-b.example' }],
      });
      await render(withCosts());
      expect(q('online-note')!.textContent).toContain('Similar items online sell for more');
      expect(spoken()).toContain('Similar items online sell for more');
      expect(q('result-price')!.textContent).toBe('₹23,530'); // never changed automatically
      expect((await persisted()).price_final ?? null).toBeNull();
    });
  });
});
