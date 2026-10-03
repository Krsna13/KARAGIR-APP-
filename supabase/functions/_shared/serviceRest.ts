// supabase/functions/_shared/serviceRest.ts
// Minimal service-role helpers over Supabase's REST endpoints (no SDK dependency).
// The service role key never leaves the Edge Function; clients cannot reach these tables.

declare const Deno: { env: { get(key: string): string | undefined } };

export interface ServiceConfig {
  url: string;
  serviceKey: string;
}

export function readServiceConfig(): ServiceConfig | null {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ''), serviceKey };
}

const serviceHeaders = (cfg: ServiceConfig, extra: Record<string, string> = {}) => ({
  apikey: cfg.serviceKey,
  Authorization: `Bearer ${cfg.serviceKey}`,
  'Content-Type': 'application/json',
  ...extra,
});

/** Resolves the signed-in user id from the caller's JWT, or null. */
export async function getUserId(cfg: ServiceConfig, authorizationHeader: string | null): Promise<string | null> {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const res = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const json = await res.json();
  return typeof json?.id === 'string' ? json.id : null;
}

export async function selectOne<T>(cfg: ServiceConfig, table: string, filter: string): Promise<T | null> {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?${filter}&limit=1`, { headers: serviceHeaders(cfg) });
  if (!res.ok) throw new Error(`select ${table} failed (HTTP ${res.status})`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? (rows[0] as T) : null;
}

export async function deleteWhere(cfg: ServiceConfig, table: string, filter: string): Promise<void> {
  const res = await fetch(`${cfg.url}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: serviceHeaders(cfg) });
  if (!res.ok) throw new Error(`delete ${table} failed (HTTP ${res.status})`);
}

export async function insertRows(cfg: ServiceConfig, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const res = await fetch(`${cfg.url}/rest/v1/${table}`, {
    method: 'POST',
    headers: serviceHeaders(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert ${table} failed (HTTP ${res.status}): ${await res.text()}`);
}

/** Context columns shared by artisan and online training rows, read from the product row. */
export function trainingContext(product: Record<string, any>, locationText: string | null): Record<string, unknown> {
  const nd = product.normalized_dimensions && typeof product.normalized_dimensions === 'object' ? product.normalized_dimensions : {};
  return {
    product_id: product.id,
    category: product.category ?? null,
    item_type: product.item_type ?? null,
    material: product.material ?? null,
    shape_profile: product.shape_profile ?? null,
    volume_cm3: typeof nd.volume_cm3 === 'number' ? nd.volume_cm3 : null,
    area_cm2: typeof nd.area_cm2 === 'number' ? nd.area_cm2 : null,
    technique: product.technique ?? null,
    complexity: product.complexity ?? null,
    finish: product.finish ?? null,
    location_text: locationText,
  };
}
