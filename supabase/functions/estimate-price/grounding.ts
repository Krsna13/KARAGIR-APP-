// supabase/functions/estimate-price/grounding.ts
// Pure helpers (no Deno APIs) shared with the Vitest unit tests.
//
// Two-call design (see index.ts): call 1 = Google Search grounding, free text; call 2 = JSON schema
// extraction with NO tools. Google's structured-output guide says combining structured output with
// built-in tools such as Grounding with Google Search is a Gemini 3 preview feature only
// (https://ai.google.dev/gemini-api/docs/structured-output), so the two-call form works on any model.
//
// Anti-fabrication: sources come ONLY from groundingMetadata.groundingChunks of call 1; a listing
// counts only if it cites a real source index AND its price appears verbatim in call 1's text.

export const MIN_LISTINGS = 3;

export interface GroundedSource {
  url: string;
  title: string;
}

export interface OnlineListing {
  title: string;
  price: number;
  source_url: string;
  source_title: string;
}

export type EstimateResult =
  | { status: 'ok'; low: number; high: number; listings: OnlineListing[]; sources: GroundedSource[] }
  | { status: 'insufficient'; listings: []; sources: GroundedSource[] };

/** Sources only from grounding metadata, de-duplicated by URL, in chunk order. */
export function extractSources(groundingMetadata: any): GroundedSource[] {
  const chunks = Array.isArray(groundingMetadata?.groundingChunks) ? groundingMetadata.groundingChunks : [];
  const seen = new Set<string>();
  const out: GroundedSource[] = [];
  for (const c of chunks) {
    const uri = c?.web?.uri;
    if (typeof uri !== 'string' || !/^https?:\/\//i.test(uri) || seen.has(uri)) continue;
    seen.add(uri);
    out.push({ url: uri, title: typeof c?.web?.title === 'string' && c.web.title.trim() ? c.web.title.trim() : uri });
  }
  return out;
}

export function buildSearchPrompt(facts: { item_type: string; material: string; location: string | null }): string {
  const where = facts.location
    ? ` (the maker is based at: ${facts.location}; prefer Indian marketplaces and sellers)`
    : '';
  return `Search the web for handmade or artisan "${facts.item_type}" products made of ${facts.material} that are currently listed for sale in India${where}.
List up to 8 real, individual product listings you found. For each one give: the product title, the listed price in Indian rupees exactly as shown on the page, and the website name.
Only report prices you actually saw in the search results. If a listing shows no price in rupees, skip it. Do not estimate, average or invent anything. If you found fewer than 3 listings with a rupee price, say so plainly.`;
}

export function buildExtractionPrompt(searchText: string, sources: GroundedSource[]): string {
  const list = sources.map((s, i) => `[${i}] ${s.title} - ${s.url}`).join('\n');
  return `From the research notes below, extract individual product listings that have a price in Indian rupees.
Rules:
- Use ONLY listings and prices that appear in the notes. Never invent, estimate or average.
- price_inr is the number exactly as written in the notes (digits only, no currency symbol, no commas).
- source_index is the index of the source in the numbered list that the listing came from. If you cannot tell which source, omit the listing.
- If there are no valid listings, return an empty array.

SOURCES:
${list || '(none)'}

NOTES:
${searchText}`;
}

export const EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    listings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          price_inr: { type: 'NUMBER' },
          source_index: { type: 'INTEGER' },
        },
        required: ['title', 'price_inr', 'source_index'],
      },
    },
  },
  required: ['listings'],
};

/** True when the price appears as a standalone number in the grounded text (commas ignored). */
export function priceAppearsInText(price: number, text: string): boolean {
  const normalized = text.replace(/(\d),(?=\d)/g, '$1');
  const re = new RegExp(`(?<![\\d.])${String(price).replace('.', '\\.')}(?!\\d)`);
  return re.test(normalized);
}

export function buildEstimate(raw: unknown, sources: GroundedSource[], searchText: string): EstimateResult {
  const arr = Array.isArray((raw as any)?.listings) ? (raw as any).listings : [];
  const listings: OnlineListing[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const price = Number(item?.price_inr);
    const idx = item?.source_index;
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    if (!title || !Number.isFinite(price) || price <= 0) continue;
    if (!Number.isInteger(idx) || idx < 0 || idx >= sources.length) continue;
    if (!priceAppearsInText(price, searchText)) continue;
    const key = `${sources[idx].url}|${title.toLowerCase()}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    listings.push({ title, price, source_url: sources[idx].url, source_title: sources[idx].title });
  }
  if (listings.length < MIN_LISTINGS) return { status: 'insufficient', listings: [], sources };
  const prices = listings.map((l) => l.price);
  const usedUrls = new Set(listings.map((l) => l.source_url));
  return {
    status: 'ok',
    low: Math.min(...prices),
    high: Math.max(...prices),
    listings,
    sources: sources.filter((s) => usedUrls.has(s.url)),
  };
}
