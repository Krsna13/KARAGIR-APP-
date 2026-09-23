// supabase/functions/identify-product/request.ts
// Pure request parsing, storage-URL allowlisting and Gemini payload building.
// No Deno APIs here, so it is shared with the Vitest unit tests.

import {
  ALLOWED_CATEGORIES,
  COMPLEXITY_LEVELS,
  FINISH_TYPES,
  SHAPE_PROFILES,
  STYLE_TYPES,
  MAX_VISIBLE_FEATURES,
} from './validation.ts';

export const MAX_IMAGE_URLS = 5;

/** Only product photos may be fetched by the function (public product-photos-raw bucket). */
export const ALLOWED_STORAGE_PATH_PREFIX = '/storage/v1/object/public/product-photos-raw/';

/** Matches src/config/languages.ts SUPPORTED_LANGUAGES. */
export const SPEAKING_LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi',
  mr: 'Marathi',
  en: 'English',
};

export type IdentifyRequest =
  | {
      /** Original Snap & Discover shape: exactly the legacy prompt + schema. */
      kind: 'legacy';
      imageBase64: string;
      mimeType: string;
    }
  | {
      /** Stage 6.4 wizard shape: one base64 image or 1-5 storage URLs, extended schema. */
      kind: 'extended';
      imageBase64?: string;
      mimeType?: string;
      imageUrls?: string[];
      speakingLanguage?: string;
    };

export type ParseResult =
  | { ok: true; value: IdentifyRequest }
  | { ok: false; status: 400 | 500; error: string };

const BASE64_CHARS = /^[A-Za-z0-9+/=]+$/;

/** Strips a data-URI prefix and whitespace; null if the payload is not base64. */
export function cleanBase64(imageBase64: string): string | null {
  const stripped = (imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64) ?? '';
  const compact = stripped.replace(/\s/g, '');
  if (!compact || !BASE64_CHARS.test(compact)) return null;
  return compact;
}

/**
 * LOCAL DEVELOPMENT ONLY. Inside `supabase start` the function sees
 * SUPABASE_URL as http://kong:8000, while the app's photo URLs use
 * http://127.0.0.1:54321. Setting this env var to that one origin lets the
 * local function accept them. NEVER set it in production.
 */
export const EXTRA_ALLOWED_ORIGIN_ENV = 'IDENTIFY_EXTRA_ALLOWED_ORIGIN';

type EnvGetter = (key: string) => string | undefined;

const denoEnv: EnvGetter = (key) =>
  (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno?.env?.get?.(key);

/**
 * Reads IDENTIFY_EXTRA_ALLOWED_ORIGIN. Returns the normalised origin, or
 * undefined when unset/blank. A value that is not a bare http(s) origin
 * (has a path, query, credentials...) is refused and logged, not guessed at.
 */
export function readExtraAllowedOrigin(getEnv: EnvGetter = denoEnv): string | undefined {
  const raw = getEnv(EXTRA_ALLOWED_ORIGIN_ENV)?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const isBareOrigin =
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      (url.pathname === '/' || url.pathname === '') &&
      !url.search &&
      !url.hash;
    if (isBareOrigin) return url.origin;
  } catch {
    // fall through
  }
  console.error(`[identify-product] Ignoring invalid ${EXTRA_ALLOWED_ORIGIN_ENV}: expected a bare origin like http://127.0.0.1:54321`);
  return undefined;
}

/**
 * True only for http(s) URLs on this project's own Supabase origin (or the
 * optional local-dev extra origin), inside the public product-photos-raw
 * bucket. Prevents the function being used to fetch arbitrary URLs (SSRF).
 * Encoded dot/slash segments are rejected outright.
 */
export function isAllowedStorageUrl(
  candidate: unknown,
  supabaseUrl: string,
  extraAllowedOrigin?: string
): boolean {
  if (typeof candidate !== 'string' || candidate.trim() === '') return false;

  let url: URL;
  let allowed: URL;
  try {
    url = new URL(candidate);
    allowed = new URL(supabaseUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const allowedOrigins = extraAllowedOrigin ? [allowed.origin, extraAllowedOrigin] : [allowed.origin];
  if (!allowedOrigins.includes(url.origin)) return false; // scheme + host + port must match exactly
  if (url.username || url.password) return false;

  // Check the raw string (before URL normalisation) for traversal tricks.
  const afterScheme = candidate.slice(candidate.indexOf('//') + 2);
  if (/%2e|%2f|%5c|\.\.|\\/i.test(afterScheme)) return false;

  return url.pathname.startsWith(ALLOWED_STORAGE_PATH_PREFIX) && url.pathname.length > ALLOWED_STORAGE_PATH_PREFIX.length;
}

/**
 * Validates the request body. Exactly one of imageBase64 / image_urls.
 * A body with only imageBase64 (+ optional mimeType) is the legacy request.
 */
export function parseIdentifyRequest(
  body: unknown,
  supabaseUrl: string | undefined,
  extraAllowedOrigin: string | undefined = readExtraAllowedOrigin()
): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Invalid request body. Expected a JSON object.' };
  }
  const record = body as Record<string, unknown>;
  const hasBase64 = record.imageBase64 !== undefined;
  const hasUrls = record.image_urls !== undefined;

  if (hasBase64 && hasUrls) {
    return { ok: false, status: 400, error: 'Send either imageBase64 or image_urls, not both.' };
  }
  if (!hasBase64 && !hasUrls) {
    return {
      ok: false,
      status: 400,
      error: 'Missing or invalid imageBase64. A base64-encoded image string is required.',
    };
  }

  let speakingLanguage: string | undefined;
  if (record.speakingLanguage !== undefined && record.speakingLanguage !== null) {
    if (typeof record.speakingLanguage !== 'string' || !SPEAKING_LANGUAGE_NAMES[record.speakingLanguage]) {
      return {
        ok: false,
        status: 400,
        error: `Unsupported speakingLanguage '${String(record.speakingLanguage)}'. Supported: ${Object.keys(
          SPEAKING_LANGUAGE_NAMES
        ).join(', ')}`,
      };
    }
    speakingLanguage = record.speakingLanguage;
  }

  if (hasBase64) {
    if (typeof record.imageBase64 !== 'string' || record.imageBase64.trim() === '') {
      return {
        ok: false,
        status: 400,
        error: 'Missing or invalid imageBase64. A base64-encoded image string is required.',
      };
    }
    const data = cleanBase64(record.imageBase64);
    if (!data) return { ok: false, status: 400, error: 'Corrupt or invalid base64 image data supplied.' };
    const mimeType =
      typeof record.mimeType === 'string' && record.mimeType ? record.mimeType : 'image/jpeg';

    return speakingLanguage
      ? { ok: true, value: { kind: 'extended', imageBase64: data, mimeType, speakingLanguage } }
      : { ok: true, value: { kind: 'legacy', imageBase64: data, mimeType } };
  }

  const urls = record.image_urls;
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > MAX_IMAGE_URLS) {
    return {
      ok: false,
      status: 400,
      error: `image_urls must be an array of 1 to ${MAX_IMAGE_URLS} storage URLs.`,
    };
  }
  if (!supabaseUrl) {
    return { ok: false, status: 500, error: 'SUPABASE_URL is not configured; cannot verify image_urls.' };
  }
  const rejected = urls.find((u) => !isAllowedStorageUrl(u, supabaseUrl, extraAllowedOrigin));
  if (rejected !== undefined) {
    return {
      ok: false,
      status: 400,
      error: 'image_urls may only point to product photos in this project’s Supabase storage.',
    };
  }
  if (new Set(urls).size !== urls.length) {
    return { ok: false, status: 400, error: 'image_urls contains duplicate URLs.' };
  }

  return { ok: true, value: { kind: 'extended', imageUrls: urls as string[], speakingLanguage } };
}

export interface InlineImage {
  mimeType: string;
  data: string; // base64
}

export const LEGACY_PROMPT =
  'Analyze this image of an artisan handcrafted product. Identify the item name, primary craft material, category, your confidence (0.0 to 1.0), and provide a concise 1-2 sentence description highlighting its craftsmanship and design style.';

const BASE_PROPERTIES = {
  item_name: {
    type: 'STRING',
    description: 'Name or title of the handcrafted product',
  },
  material: {
    type: 'STRING',
    description: 'Primary material used (e.g. Teak Wood, Terracotta Clay, Brass, Cotton, Sheesham)',
  },
  category: {
    type: 'STRING',
    enum: ALLOWED_CATEGORIES,
    description: 'Artisan craft category',
  },
  confidence: {
    type: 'NUMBER',
    description: 'Identification confidence score from 0.0 to 1.0',
  },
  short_description: {
    type: 'STRING',
    description: 'Concise 1-2 sentence description of the item and its artisan craft style',
  },
};

const BASE_REQUIRED = ['item_name', 'material', 'category', 'confidence', 'short_description'];

function extendedPrompt(imageCount: number, languageName: string | undefined): string {
  const lines = [
    imageCount > 1
      ? `These ${imageCount} photos all show the SAME artisan handcrafted product from different angles. Use every photo together.`
      : 'This photo shows an artisan handcrafted product.',
    'Identify the item name, primary craft material, category, your confidence (0.0 to 1.0), and a concise 1-2 sentence description of its craftsmanship and design style.',
    'Only report what is actually visible. Never guess:',
    '- secondary_materials: other materials clearly visible (e.g. brass inlay, cane). Use an empty list if none are clearly visible.',
    "- finish: the surface finish. Use 'unknown' if it cannot be told from the photos.",
    '- complexity and complexity_reason: include only if the level of detail is clearly visible; the reason is one short sentence about what you see. Omit both otherwise.',
    "- shape_profile: 'box' if it has length, width and height (e.g. furniture); 'flat' if it is mainly length and width (e.g. textiles, wall panels); 'round' if it is height and diameter (e.g. pots, vases). Omit it if unclear.",
    '- visible_features: short phrases for things clearly visible in the photos (e.g. "carved floral motif", "brass handles", "cushioned seat"). At most 8. Use an empty list if none stand out.',
    '- colors: the main colors actually visible. Use an empty list if unclear (e.g. poor lighting, monochrome photo).',
    "- style: 'traditional', 'modern', 'rustic', or 'fusion' only if visibly clear from the design; otherwise 'unknown'.",
    '- suggested_use: where/how it could be used, only if visually obvious (e.g. "living room", "puja room", "gifting"). Use an empty list if unclear.',
    '- Never infer size, technique, time taken, age, origin, or heritage claims from the photos. Those are asked separately.',
  ];
  if (languageName) {
    lines.push(
      `- item_name_spoken and material_spoken: the item name and primary material in ${languageName}, in simple everyday words an artisan would say aloud${
        languageName === 'English' ? '' : ' (written in the native script)'
      }.`,
      `- complexity_reason_spoken: if you gave a complexity_reason, also say it in ${languageName} for read-aloud. Omit if you did not give a complexity_reason.`
    );
  }
  return lines.join('\n');
}

/**
 * Builds the Gemini generateContent payload.
 * - legacy: byte-for-byte the original Snap & Discover payload.
 * - extended: all images + extended schema (new fields; see validation.ts).
 */
export function buildGeminiPayload(request: IdentifyRequest, images: InlineImage[]) {
  const imageParts = images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }));

  if (request.kind === 'legacy') {
    return {
      contents: [{ parts: [...imageParts, { text: LEGACY_PROMPT }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: BASE_PROPERTIES,
          required: BASE_REQUIRED,
        },
      },
    };
  }

  const languageName = request.speakingLanguage ? SPEAKING_LANGUAGE_NAMES[request.speakingLanguage] : undefined;
  const properties: Record<string, unknown> = {
    ...BASE_PROPERTIES,
    secondary_materials: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Other clearly visible materials, e.g. brass inlay, cane. Empty if none.',
    },
    finish: {
      type: 'STRING',
      enum: FINISH_TYPES,
      description: "Surface finish; 'unknown' if it cannot be told from the photos",
    },
    complexity: {
      type: 'STRING',
      enum: COMPLEXITY_LEVELS,
      description: 'Level of handwork detail; omit if unclear',
    },
    complexity_reason: {
      type: 'STRING',
      description: 'One short sentence explaining the complexity; omit if complexity is omitted',
    },
    shape_profile: {
      type: 'STRING',
      enum: SHAPE_PROFILES,
      description: 'box = length/width/height, flat = length/width, round = height/diameter; omit if unclear',
    },
    visible_features: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: `Short phrases for things clearly visible in the photos (e.g. carved floral motif, brass handles). At most ${MAX_VISIBLE_FEATURES}. Empty if none.`,
    },
    colors: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Main visible colors. Empty if unclear.',
    },
    style: {
      type: 'STRING',
      enum: STYLE_TYPES,
      description: "Visible design style, or 'unknown' if not clear",
    },
    suggested_use: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Where/how it could be used, only if visually obvious (e.g. living room, puja room, gifting). Empty if unclear.',
    },
  };
  const required = [...BASE_REQUIRED, 'secondary_materials', 'finish', 'visible_features', 'colors', 'style', 'suggested_use'];

  if (languageName) {
    properties.item_name_spoken = { type: 'STRING', description: `item_name in ${languageName}` };
    properties.material_spoken = { type: 'STRING', description: `material in ${languageName}` };
    properties.complexity_reason_spoken = {
      type: 'STRING',
      description: `complexity_reason in ${languageName}, for read-aloud; omit if no complexity_reason was given`,
    };
    required.push('item_name_spoken', 'material_spoken');
  }

  return {
    contents: [{ parts: [...imageParts, { text: extendedPrompt(images.length, languageName) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties, required },
    },
  };
}

/** Chunked Uint8Array -> base64 (avoids call-stack limits on large images). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Gemini inline requests are capped at ~20 MB total, and base64 adds ~33%.
 * Keep raw image bytes under this so the request is not rejected upstream.
 */
export const MAX_TOTAL_IMAGE_BYTES = 14 * 1024 * 1024;
export const MAX_SINGLE_IMAGE_BYTES = 10 * 1024 * 1024;
