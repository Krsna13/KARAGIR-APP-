// supabase/functions/estimate-price/index.ts
// Stage 6.7: secondary "similar items online" comparison. Never blocks the wizard.
// Call 1: Gemini + Google Search grounding (free text). Call 2: JSON extraction, no tools.
// Server reads the product + artisan address itself; verified online listings are saved to
// pricing_training_data (source = 'online') with the service role.

import { GEMINI_MODEL, GEMINI_BASE_URL } from '../_shared/geminiConfig.ts';
import { readServiceConfig, getUserId, selectOne, deleteWhere, insertRows, trainingContext } from '../_shared/serviceRest.ts';
import {
  buildSearchPrompt,
  buildExtractionPrompt,
  EXTRACTION_SCHEMA,
  extractSources,
  buildEstimate,
} from './grounding.ts';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function gemini(apiKey: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Gemini API error (HTTP ${res.status}): ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Please use POST.' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey?.trim()) return json({ error: 'GEMINI_API_KEY is not configured on the Supabase Edge Function.' }, 500);
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
    if (!product.item_type || !product.material) return json({ error: 'Item type and material are required.' }, 422);
    const artisan = await selectOne<{ address: string | null }>(cfg, 'artisans', `id=eq.${userId}&select=address`);
    const location = artisan?.address?.trim() || null;

    // Call 1: grounded search (free text; tools cannot be combined with a JSON schema on all models).
    const searchData = await gemini(apiKey, {
      contents: [
        { role: 'user', parts: [{ text: buildSearchPrompt({ item_type: product.item_type, material: product.material, location }) }] },
      ],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0 },
    });
    const candidate = searchData?.candidates?.[0];
    const searchText: string = (candidate?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('\n').trim();
    const sources = extractSources(candidate?.groundingMetadata);

    if (!searchText || sources.length === 0) return json({ status: 'insufficient', listings: [], sources: [] });

    // Call 2: schema-constrained extraction from call 1's text only (no tools).
    const extractData = await gemini(apiKey, {
      contents: [{ role: 'user', parts: [{ text: buildExtractionPrompt(searchText, sources) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: EXTRACTION_SCHEMA },
    });
    const extractText = extractData?.candidates?.[0]?.content?.parts?.[0]?.text;
    let raw: unknown = null;
    try {
      raw = JSON.parse(extractText);
    } catch {
      return json({ status: 'insufficient', listings: [], sources: [] });
    }

    const estimate = buildEstimate(raw, sources, searchText);
    if (estimate.status === 'ok') {
      await deleteWhere(cfg, 'pricing_training_data', `product_id=eq.${productId}&source=eq.online`);
      await insertRows(
        cfg,
        'pricing_training_data',
        estimate.listings.map((l) => ({
          ...trainingContext(product, location),
          source: 'online',
          price_final: l.price,
          source_url: l.source_url,
          source_title: l.source_title,
        }))
      );
    }
    return json(estimate as unknown as Record<string, unknown>);
  } catch (err) {
    console.error('[estimate-price]', err instanceof Error ? err.message : err);
    return json({ error: 'Online comparison is not available right now.' }, 502);
  }
});
