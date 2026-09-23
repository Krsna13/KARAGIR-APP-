// src/services/__tests__/identifyProductRequest.test.ts
/**
 * Stage 6.4: identify-product request handling — REAL LOGIC, no mocks.
 * Exercises supabase/functions/identify-product/request.ts directly:
 * request parsing, the storage-URL allowlist (SSRF guard), and the Gemini
 * payload builder. Gemini, Supabase storage and the Deno runtime are not
 * involved; index.ts itself (Deno.serve + fetch) is not executed here.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildGeminiPayload,
  bytesToBase64,
  isAllowedStorageUrl,
  parseIdentifyRequest,
  readExtraAllowedOrigin,
  EXTRA_ALLOWED_ORIGIN_ENV,
  LEGACY_PROMPT,
} from '../../../supabase/functions/identify-product/request.ts';

const SUPABASE_URL = 'https://abcxyz.supabase.co';
const photo = (name: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/product-photos-raw/artisan-1/prod-1/${name}/raw.jpg`;

describe('isAllowedStorageUrl (SSRF guard)', () => {
  it('accepts product photos on this project storage host', () => {
    expect(isAllowedStorageUrl(photo('img-1'), SUPABASE_URL)).toBe(true);
    expect(
      isAllowedStorageUrl(
        `${SUPABASE_URL}/storage/v1/object/public/product-photos-raw/a/p/i/enhanced.png`,
        SUPABASE_URL
      )
    ).toBe(true);
  });

  it.each([
    ['another host', 'https://evil.example.com/storage/v1/object/public/product-photos-raw/a/p/i/raw.jpg'],
    ['look-alike subdomain', 'https://abcxyz.supabase.co.evil.com/storage/v1/object/public/product-photos-raw/a.jpg'],
    ['another Supabase project', 'https://otherproj.supabase.co/storage/v1/object/public/product-photos-raw/a.jpg'],
    ['http downgrade', 'http://abcxyz.supabase.co/storage/v1/object/public/product-photos-raw/a.jpg'],
    ['different port', 'https://abcxyz.supabase.co:8443/storage/v1/object/public/product-photos-raw/a.jpg'],
    ['credentials in URL', 'https://user:pw@abcxyz.supabase.co/storage/v1/object/public/product-photos-raw/a.jpg'],
    ['same host, not storage', `${SUPABASE_URL}/rest/v1/products?select=*`],
    ['same host, another bucket', `${SUPABASE_URL}/storage/v1/object/public/product-voice-notes/a/p/n.webm`],
    ['private object endpoint', `${SUPABASE_URL}/storage/v1/object/product-photos-raw/a/p/i/raw.jpg`],
    ['dot-dot traversal', `${SUPABASE_URL}/storage/v1/object/public/product-photos-raw/../../../rest/v1/x`],
    ['encoded traversal', `${SUPABASE_URL}/storage/v1/object/public/product-photos-raw/%2e%2e/%2E%2E/rest/v1/x`],
    ['encoded slash', `${SUPABASE_URL}/storage/v1/object/public/product-photos-raw%2f..%2fother/a.jpg`],
    ['bucket root only', `${SUPABASE_URL}/storage/v1/object/public/product-photos-raw/`],
    ['file scheme', 'file:///etc/passwd'],
    ['not a URL', 'not a url'],
  ])('rejects %s', (_label, url) => {
    expect(isAllowedStorageUrl(url, SUPABASE_URL)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isAllowedStorageUrl(42, SUPABASE_URL)).toBe(false);
    expect(isAllowedStorageUrl(null, SUPABASE_URL)).toBe(false);
  });

  it('treats host case-insensitively (URL normalisation), still requiring the exact origin', () => {
    expect(
      isAllowedStorageUrl(
        'https://ABCXYZ.supabase.co/storage/v1/object/public/product-photos-raw/a/p/i/raw.jpg',
        SUPABASE_URL
      )
    ).toBe(true);
  });
});

describe('parseIdentifyRequest', () => {
  it('Snap & Discover shape { imageBase64, mimeType } stays the legacy request', () => {
    const r = parseIdentifyRequest({ imageBase64: 'data:image/png;base64,QUJD\nREVG', mimeType: 'image/png' }, SUPABASE_URL);
    expect(r).toEqual({ ok: true, value: { kind: 'legacy', imageBase64: 'QUJDREVG', mimeType: 'image/png' } });
  });

  it('legacy request defaults mimeType to image/jpeg', () => {
    const r = parseIdentifyRequest({ imageBase64: 'QUJD' }, SUPABASE_URL);
    expect(r.ok && r.value).toEqual({ kind: 'legacy', imageBase64: 'QUJD', mimeType: 'image/jpeg' });
  });

  it('keeps the legacy 400 messages for missing / corrupt base64', () => {
    expect(parseIdentifyRequest({}, SUPABASE_URL)).toEqual({
      ok: false,
      status: 400,
      error: 'Missing or invalid imageBase64. A base64-encoded image string is required.',
    });
    expect(parseIdentifyRequest({ imageBase64: '   ' }, SUPABASE_URL)).toMatchObject({ ok: false, status: 400 });
    expect(parseIdentifyRequest({ imageBase64: 'not*base64!' }, SUPABASE_URL)).toEqual({
      ok: false,
      status: 400,
      error: 'Corrupt or invalid base64 image data supplied.',
    });
  });

  it('imageBase64 + speakingLanguage opts into the extended request', () => {
    const r = parseIdentifyRequest({ imageBase64: 'QUJD', speakingLanguage: 'hi' }, SUPABASE_URL);
    expect(r.ok && r.value).toEqual({
      kind: 'extended',
      imageBase64: 'QUJD',
      mimeType: 'image/jpeg',
      speakingLanguage: 'hi',
    });
  });

  it('accepts 1 to 5 allowlisted image_urls with an optional speakingLanguage', () => {
    const urls = [1, 2, 3, 4, 5].map((n) => photo(`img-${n}`));
    const r = parseIdentifyRequest({ image_urls: urls, speakingLanguage: 'mr' }, SUPABASE_URL);
    expect(r.ok && r.value).toEqual({ kind: 'extended', imageUrls: urls, speakingLanguage: 'mr' });

    const one = parseIdentifyRequest({ image_urls: [photo('a')] }, SUPABASE_URL);
    expect(one.ok && one.value).toEqual({ kind: 'extended', imageUrls: [photo('a')], speakingLanguage: undefined });
  });

  it('rejects 0 or more than 5 URLs, non-arrays and duplicates with 400', () => {
    for (const image_urls of [[], [1, 2, 3, 4, 5, 6].map((n) => photo(`i${n}`)), photo('a'), [photo('a'), photo('a')]]) {
      expect(parseIdentifyRequest({ image_urls }, SUPABASE_URL)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it('rejects the whole request with 400 if ANY URL is off the project storage host', () => {
    const r = parseIdentifyRequest(
      { image_urls: [photo('a'), 'https://evil.example.com/steal.jpg'] },
      SUPABASE_URL
    );
    expect(r).toEqual({
      ok: false,
      status: 400,
      error: 'image_urls may only point to product photos in this project’s Supabase storage.',
    });
  });

  it('refuses image_urls (500) when SUPABASE_URL is not configured, rather than skipping the check', () => {
    expect(parseIdentifyRequest({ image_urls: [photo('a')] }, undefined)).toMatchObject({ ok: false, status: 500 });
  });

  it('rejects sending both imageBase64 and image_urls', () => {
    expect(parseIdentifyRequest({ imageBase64: 'QUJD', image_urls: [photo('a')] }, SUPABASE_URL)).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('rejects an unsupported speakingLanguage instead of guessing a language', () => {
    for (const speakingLanguage of ['fr', 'hindi', 7]) {
      const r = parseIdentifyRequest({ image_urls: [photo('a')], speakingLanguage }, SUPABASE_URL);
      expect(r).toMatchObject({ ok: false, status: 400 });
    }
  });

  it('rejects non-object bodies', () => {
    for (const body of [null, [], 'x']) {
      expect(parseIdentifyRequest(body, SUPABASE_URL)).toMatchObject({ ok: false, status: 400 });
    }
  });
});

describe('buildGeminiPayload', () => {
  it('legacy request produces the ORIGINAL Snap & Discover payload, unchanged', () => {
    // Literal copy of the payload identify-product/index.ts built before Stage 6.4.
    const original = {
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'image/png', data: 'QUJD' } },
            {
              text:
                'Analyze this image of an artisan handcrafted product. Identify the item name, primary craft material, category, your confidence (0.0 to 1.0), and provide a concise 1-2 sentence description highlighting its craftsmanship and design style.',
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            item_name: { type: 'STRING', description: 'Name or title of the handcrafted product' },
            material: {
              type: 'STRING',
              description: 'Primary material used (e.g. Teak Wood, Terracotta Clay, Brass, Cotton, Sheesham)',
            },
            category: {
              type: 'STRING',
              enum: ['Woodwork', 'Pottery', 'Brasscraft', 'Textile', 'Furniture', 'Metal'],
              description: 'Artisan craft category',
            },
            confidence: { type: 'NUMBER', description: 'Identification confidence score from 0.0 to 1.0' },
            short_description: {
              type: 'STRING',
              description: 'Concise 1-2 sentence description of the item and its artisan craft style',
            },
          },
          required: ['item_name', 'material', 'category', 'confidence', 'short_description'],
        },
      },
    };

    const payload = buildGeminiPayload(
      { kind: 'legacy', imageBase64: 'QUJD', mimeType: 'image/png' },
      [{ mimeType: 'image/png', data: 'QUJD' }]
    );
    expect(JSON.stringify(payload)).toBe(JSON.stringify(original));
    expect(LEGACY_PROMPT).toBe(original.contents[0].parts[1].text);
  });

  it('extended request sends every image, then one instruction, with the extended schema', () => {
    const images = [1, 2, 3].map((n) => ({ mimeType: 'image/jpeg', data: `IMG${n}` }));
    const payload = buildGeminiPayload({ kind: 'extended', imageUrls: ['a', 'b', 'c'] }, images) as any;

    const parts = payload.contents[0].parts;
    expect(parts.slice(0, 3)).toEqual(images.map((img) => ({ inlineData: img })));
    expect(parts[3].text).toContain('These 3 photos all show the SAME');
    expect(parts[3].text).toContain("Use 'unknown'");
    expect(parts[3].text).toContain('Never guess');

    const schema = payload.generationConfig.responseSchema;
    expect(schema.properties.finish.enum).toEqual(['natural', 'polished', 'painted', 'lacquered', 'unknown']);
    expect(schema.properties.complexity.enum).toEqual(['simple', 'medium', 'intricate']);
    expect(schema.properties.shape_profile.enum).toEqual(['box', 'flat', 'round']);
    expect(schema.properties.secondary_materials).toMatchObject({ type: 'ARRAY', items: { type: 'STRING' } });
    // finish/secondary_materials/visible_features/colors/style/suggested_use all have
    // honest "don't know" values (empty list or 'unknown'), so they are required;
    // complexity and shape_profile have none, so the model may omit them rather than guess.
    expect(schema.required).toEqual([
      'item_name', 'material', 'category', 'confidence', 'short_description',
      'secondary_materials', 'finish', 'visible_features', 'colors', 'style', 'suggested_use',
    ]);
    expect(schema.properties.visible_features).toMatchObject({ type: 'ARRAY', items: { type: 'STRING' } });
    expect(schema.properties.colors).toMatchObject({ type: 'ARRAY', items: { type: 'STRING' } });
    expect(schema.properties.style.enum).toEqual(['traditional', 'modern', 'rustic', 'fusion', 'unknown']);
    expect(schema.properties.suggested_use).toMatchObject({ type: 'ARRAY', items: { type: 'STRING' } });
    expect(schema.properties).not.toHaveProperty('item_name_spoken');
    expect(schema.properties).not.toHaveProperty('complexity_reason_spoken');
  });

  it('adds spoken-name fields only when a speaking language is given', () => {
    const payload = buildGeminiPayload(
      { kind: 'extended', imageUrls: ['a'], speakingLanguage: 'hi' },
      [{ mimeType: 'image/jpeg', data: 'X' }]
    ) as any;
    const schema = payload.generationConfig.responseSchema;
    expect(schema.properties.item_name_spoken.description).toContain('Hindi');
    expect(schema.required).toContain('item_name_spoken');
    expect(schema.required).toContain('material_spoken');
    expect(payload.contents[0].parts[1].text).toContain('in Hindi');
    expect(payload.contents[0].parts[1].text).toContain('This photo shows');
  });
});

describe('IDENTIFY_EXTRA_ALLOWED_ORIGIN (local development only)', () => {
  const LOCAL = 'http://127.0.0.1:54321';
  const localPhoto = `${LOCAL}/storage/v1/object/public/product-photos-raw/a/p/i/raw.jpg`;
  // Inside `supabase start`, the function sees this as SUPABASE_URL.
  const KONG = 'http://kong:8000';

  it('is ignored when unset: a local storage URL is rejected', () => {
    expect(readExtraAllowedOrigin(() => undefined)).toBeUndefined();
    expect(readExtraAllowedOrigin(() => '   ')).toBeUndefined();
    expect(isAllowedStorageUrl(localPhoto, KONG)).toBe(false);
    expect(isAllowedStorageUrl(localPhoto, KONG, undefined)).toBe(false);
  });

  it('parseIdentifyRequest reads the real environment by default; with no Deno env it is unset', () => {
    // Vitest has no Deno global, exactly like an environment where the var is not set.
    expect((globalThis as { Deno?: unknown }).Deno).toBeUndefined();
    expect(readExtraAllowedOrigin()).toBeUndefined();
    expect(parseIdentifyRequest({ image_urls: [localPhoto] }, KONG)).toMatchObject({ ok: false, status: 400 });
  });

  it('reads the value from the Deno environment when present', () => {
    const g = globalThis as { Deno?: unknown };
    g.Deno = { env: { get: (k: string) => (k === EXTRA_ALLOWED_ORIGIN_ENV ? LOCAL : undefined) } };
    try {
      expect(readExtraAllowedOrigin()).toBe(LOCAL);
      expect(parseIdentifyRequest({ image_urls: [localPhoto] }, KONG).ok).toBe(true);
    } finally {
      delete g.Deno;
    }
  });

  it('when set, accepts that one origin (same bucket/path rules) and nothing else', () => {
    const extra = readExtraAllowedOrigin((k) => (k === 'IDENTIFY_EXTRA_ALLOWED_ORIGIN' ? LOCAL : undefined));
    expect(extra).toBe(LOCAL);

    expect(isAllowedStorageUrl(localPhoto, KONG, extra)).toBe(true);
    expect(isAllowedStorageUrl(`${KONG}/storage/v1/object/public/product-photos-raw/a.jpg`, KONG, extra)).toBe(true);
    // Different port / scheme / bucket / traversal are still rejected
    expect(isAllowedStorageUrl('http://127.0.0.1:9999/storage/v1/object/public/product-photos-raw/a.jpg', KONG, extra)).toBe(false);
    expect(isAllowedStorageUrl('https://127.0.0.1:54321/storage/v1/object/public/product-photos-raw/a.jpg', KONG, extra)).toBe(false);
    expect(isAllowedStorageUrl(`${LOCAL}/storage/v1/object/public/other-bucket/a.jpg`, KONG, extra)).toBe(false);
    expect(isAllowedStorageUrl(`${LOCAL}/storage/v1/object/public/product-photos-raw/../../x`, KONG, extra)).toBe(false);
    expect(isAllowedStorageUrl('https://evil.example.com/storage/v1/object/public/product-photos-raw/a.jpg', KONG, extra)).toBe(false);

    expect(parseIdentifyRequest({ image_urls: [localPhoto] }, KONG, extra).ok).toBe(true);
  });

  it('normalises a trailing slash and refuses values that are not a bare origin', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(readExtraAllowedOrigin(() => `${LOCAL}/`)).toBe(LOCAL);
    for (const bad of [`${LOCAL}/storage/v1`, `${LOCAL}?x=1`, 'ftp://127.0.0.1', 'not a url', 'http://u:p@127.0.0.1:54321']) {
      expect(readExtraAllowedOrigin(() => bad)).toBeUndefined();
    }
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('bytesToBase64', () => {
  it('matches btoa for small and multi-chunk inputs', () => {
    const small = new TextEncoder().encode('hello');
    expect(bytesToBase64(small)).toBe(btoa('hello'));

    const big = new Uint8Array(20_000).map((_, i) => i % 256);
    let binary = '';
    big.forEach((b) => (binary += String.fromCharCode(b)));
    expect(bytesToBase64(big)).toBe(btoa(binary));
  });
});
