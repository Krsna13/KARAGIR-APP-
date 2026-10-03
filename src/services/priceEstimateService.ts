// src/services/priceEstimateService.ts
/**
 * Stage 6.7: client boundary for the two pricing Edge Functions.
 * - estimate-price: grounded "similar items online" comparison (secondary, never blocks).
 * - record-pricing: stores the confirmed price as training data. The table is service-role
 *   only; the client can only ask the function to record the product it already saved.
 * Both fail soft: callers must never be blocked by an error here.
 */

import { supabase } from '../lib/supabase/client';

export interface OnlineListingResult {
  title: string;
  price: number;
  source_url: string;
  source_title: string;
}

export interface OnlineSource {
  url: string;
  title: string;
}

export type OnlineEstimate =
  | { status: 'ok'; low: number; high: number; listings: OnlineListingResult[]; sources: OnlineSource[] }
  | { status: 'insufficient' }
  | { status: 'unavailable' };

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export async function fetchOnlineEstimate(productId: string): Promise<OnlineEstimate> {
  try {
    const { data, error } = await supabase.functions.invoke('estimate-price', { body: { product_id: productId } });
    if (error || !data) return { status: 'unavailable' };
    if (data.status === 'ok' && isNum(data.low) && isNum(data.high) && Array.isArray(data.listings) && data.listings.length >= 3) {
      return {
        status: 'ok',
        low: data.low,
        high: data.high,
        listings: data.listings,
        sources: Array.isArray(data.sources) ? data.sources : [],
      };
    }
    // Anything that is not a verified result (including < 3 listings) shows no numbers.
    return { status: 'insufficient' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function recordConfirmedPrice(productId: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke('record-pricing', { body: { product_id: productId } });
    if (error) {
      console.warn('[priceEstimateService] record-pricing failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[priceEstimateService] record-pricing error:', err);
    return false;
  }
}
