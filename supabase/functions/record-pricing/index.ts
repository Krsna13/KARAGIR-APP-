// supabase/functions/record-pricing/index.ts
// Stage 6.7: records one confirmed artisan price as training data for Stage 6.8.
// Reads the product row server-side (authoritative, saved by the wizard just before),
// verifies the caller owns it, and inserts with the service role. Clients never write this table.

import { readServiceConfig, getUserId, selectOne, deleteWhere, insertRows, trainingContext } from '../_shared/serviceRest.ts';

declare const Deno: { serve(handler: (req: Request) => Promise<Response> | Response): void };

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Please use POST.' }, 405);

  const cfg = readServiceConfig();
  if (!cfg) return json({ error: 'Service role is not configured.' }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON request body.' }, 400);
  }
  const productId = typeof body?.product_id === 'string' ? body.product_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return json({ error: 'product_id is required.' }, 400);

  try {
    const userId = await getUserId(cfg, req.headers.get('Authorization'));
    if (!userId) return json({ error: 'Sign in required.' }, 401);

    const product = await selectOne<Record<string, any>>(cfg, 'products', `id=eq.${productId}&select=*`);
    if (!product) return json({ error: 'Product not found.' }, 404);
    if (product.artisan_id !== userId) return json({ error: 'Not your product.' }, 403);

    const price = Number(product.price_final);
    if (!Number.isFinite(price) || price <= 0) return json({ error: 'No confirmed final price on this product.' }, 422);

    const artisan = await selectOne<{ address: string | null }>(cfg, 'artisans', `id=eq.${userId}&select=address`);

    // One artisan row per product: re-confirming replaces it.
    await deleteWhere(cfg, 'pricing_training_data', `product_id=eq.${productId}&source=eq.artisan`);
    await insertRows(cfg, 'pricing_training_data', [
      {
        ...trainingContext(product, artisan?.address ?? null),
        source: 'artisan',
        cost_material: product.cost_material,
        cost_labour: product.cost_labour,
        cost_hardware: product.cost_hardware,
        cost_finishing: product.cost_finishing,
        production_cost: product.production_cost,
        target_margin: product.target_margin,
        price_final: price,
      },
    ]);
    return json({ ok: true });
  } catch (err) {
    console.error('[record-pricing]', err instanceof Error ? err.message : err);
    return json({ error: 'Could not record pricing data.' }, 500);
  }
});
