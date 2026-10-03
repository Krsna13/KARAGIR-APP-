/**
 * Stage 6.7: priceEstimateService.
 * MOCKED AT THE BOUNDARY: supabase.functions.invoke (no network, no Edge Function runs).
 * REAL: the service's response handling (fail-soft, < 3 listings never shows numbers).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../../lib/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { fetchOnlineEstimate, recordConfirmedPrice } from '../priceEstimateService';

const L = (price: number) => ({ title: `bed ${price}`, price, source_url: 'https://s.example', source_title: 's.example' });

beforeEach(() => {
  invoke.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('fetchOnlineEstimate', () => {
  it('invokes estimate-price with only the product id (the server reads the facts)', async () => {
    invoke.mockResolvedValue({ data: { status: 'insufficient' }, error: null });
    await fetchOnlineEstimate('p-1');
    expect(invoke).toHaveBeenCalledWith('estimate-price', { body: { product_id: 'p-1' } });
  });

  it('passes through an ok result with >= 3 listings', async () => {
    invoke.mockResolvedValue({
      data: { status: 'ok', low: 100, high: 300, listings: [L(100), L(200), L(300)], sources: [{ url: 'https://s.example', title: 's' }] },
      error: null,
    });
    const r = await fetchOnlineEstimate('p-1');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect([r.low, r.high]).toEqual([100, 300]);
  });

  it('treats an "ok" with fewer than 3 listings as insufficient (no numbers)', async () => {
    invoke.mockResolvedValue({ data: { status: 'ok', low: 100, high: 200, listings: [L(100), L(200)], sources: [] }, error: null });
    expect(await fetchOnlineEstimate('p-1')).toEqual({ status: 'insufficient' });
  });

  it('is unavailable (never throws) on function error, empty data or exceptions', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('502') });
    expect(await fetchOnlineEstimate('p-1')).toEqual({ status: 'unavailable' });
    invoke.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchOnlineEstimate('p-1')).toEqual({ status: 'unavailable' });
    invoke.mockRejectedValueOnce(new Error('network'));
    expect(await fetchOnlineEstimate('p-1')).toEqual({ status: 'unavailable' });
  });
});

describe('recordConfirmedPrice', () => {
  it('asks record-pricing to record the product, and reports success', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await recordConfirmedPrice('p-1')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('record-pricing', { body: { product_id: 'p-1' } });
  });
  it('fails soft', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('403') });
    expect(await recordConfirmedPrice('p-1')).toBe(false);
    invoke.mockRejectedValueOnce(new Error('network'));
    expect(await recordConfirmedPrice('p-1')).toBe(false);
  });
});
