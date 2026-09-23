// supabase/functions/identify-product/index.ts
// Supabase Edge Function: AI product identifier.
// Used by buyer "Snap & Discover" (single imageBase64, legacy payload) and by
// the Add Item wizard Identify step (image_urls: 1-5 of the product's own
// storage photos, extended schema, optional speakingLanguage).
// Proxies vision identification requests securely to Google Gemini API
// without leaking the GEMINI_API_KEY to the client bundle.
//
// Environment:
//   GEMINI_API_KEY                 required (supabase secrets set GEMINI_API_KEY=...)
//   SUPABASE_URL                   provided by the platform; image_urls must be on
//                                  this origin, in the product-photos-raw bucket
//   IDENTIFY_EXTRA_ALLOWED_ORIGIN  LOCAL DEVELOPMENT ONLY. One extra origin whose
//                                  storage URLs are also accepted, e.g.
//                                  http://127.0.0.1:54321 under `supabase start`
//                                  (where SUPABASE_URL is http://kong:8000).
//                                  NEVER set this in production: it widens the
//                                  set of URLs this function will fetch.
//                                  Ignored entirely when unset (see request.ts).

// Setup type definitions for Deno runtime
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

import { validateGeminiResult } from './validation.ts';
import {
  buildGeminiPayload,
  bytesToBase64,
  parseIdentifyRequest,
  MAX_SINGLE_IMAGE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  type InlineImage,
} from './request.ts';
import {
  GEMINI_MODEL,
  GEMINI_BASE_URL,
} from '../_shared/geminiConfig.ts';

class ImageFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Downloads one already-allowlisted storage image (see isAllowedStorageUrl).
 * redirect: 'error' so an allowlisted URL can never bounce to another host.
 */
async function fetchStorageImage(url: string): Promise<{ image: InlineImage; bytes: number }> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'error' });
  } catch (err: unknown) {
    throw new ImageFetchError(
      `Could not download product photo: ${err instanceof Error ? err.message : String(err)}`,
      502
    );
  }
  if (!res.ok) {
    throw new ImageFetchError(
      `Could not download product photo (HTTP ${res.status}).`,
      res.status === 404 ? 400 : 502
    );
  }
  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new ImageFetchError(`Product photo URL did not return an image (got '${mimeType || 'none'}').`, 400);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength === 0) throw new ImageFetchError('Product photo is empty.', 400);
  if (buffer.byteLength > MAX_SINGLE_IMAGE_BYTES) {
    throw new ImageFetchError('A product photo is too large to identify.', 413);
  }
  return { image: { mimeType, data: bytesToBase64(buffer) }, bytes: buffer.byteLength };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Enforce POST method
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Please use POST.' }, 405);
  }

  // 3. Verify Server API Key secret exists
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey || apiKey.trim() === '') {
    console.error('[identify-product] Missing GEMINI_API_KEY secret.');
    return jsonResponse(
      {
        error:
          'GEMINI_API_KEY is not configured on the Supabase Edge Function. Set it using: supabase secrets set GEMINI_API_KEY=<your-key>',
      },
      500
    );
  }

  // 4. Parse and validate client request payload
  //    - { imageBase64, mimeType? }              -> legacy Snap & Discover (unchanged payload)
  //    - { imageBase64, speakingLanguage }        -> extended schema
  //    - { image_urls: string[1..5], speakingLanguage? } -> extended schema, fetched server-side
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { error: 'Invalid request body. Expected JSON with imageBase64 payload.' },
      400
    );
  }

  const parsed = parseIdentifyRequest(body, Deno.env.get('SUPABASE_URL'));
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error }, parsed.status);
  }
  const request = parsed.value;

  // 5. Collect images (only allowlisted storage URLs are ever fetched)
  let images: InlineImage[];
  if (request.kind === 'extended' && request.imageUrls) {
    try {
      const fetched = await Promise.all(request.imageUrls.map(fetchStorageImage));
      const totalBytes = fetched.reduce((sum: number, f: { bytes: number }) => sum + f.bytes, 0);
      if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
        return jsonResponse({ error: 'The product photos are too large to identify together.' }, 413);
      }
      images = fetched.map((f: { image: InlineImage }) => f.image);
    } catch (err: unknown) {
      if (err instanceof ImageFetchError) {
        console.error('[identify-product] Image fetch failed:', err.message);
        return jsonResponse({ error: err.message }, err.status);
      }
      throw err;
    }
  } else {
    images = [{ mimeType: request.mimeType ?? 'image/jpeg', data: request.imageBase64 ?? '' }];
  }

  // 6. Build structured Gemini prompt payload
  const geminiEndpoint = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const geminiPayload = buildGeminiPayload(request, images);

  // 7. Call Gemini API with error handling for network failure, rate limiting, safety filters, corrupt image
  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });
  } catch (networkErr: unknown) {
    const errMessage = networkErr instanceof Error ? networkErr.message : String(networkErr);
    console.error('[identify-product] Network failure connecting to Gemini:', errMessage);
    return jsonResponse(
      { error: `Network failure connecting to Gemini vision service: ${errMessage}` },
      502
    );
  }

  // Handle rate limiting (429)
  if (geminiResponse.status === 429) {
    console.warn('[identify-product] Gemini API rate limit hit.');
    return jsonResponse(
      { error: 'Gemini API rate limit exceeded. Please wait a moment and try again.' },
      429
    );
  }

  // Handle other upstream HTTP errors
  if (!geminiResponse.ok) {
    let errorDetail = `Gemini API returned status ${geminiResponse.status}`;
    try {
      const errorJson = await geminiResponse.json();
      if (errorJson?.error?.message) {
        errorDetail = errorJson.error.message;
      }
    } catch {
      // ignore json parse failure for error response
    }

    const isImageDecodeError =
      errorDetail.toLowerCase().includes('image') ||
      errorDetail.toLowerCase().includes('decode') ||
      errorDetail.toLowerCase().includes('invalid image');

    const status = isImageDecodeError ? 400 : geminiResponse.status >= 400 && geminiResponse.status < 500 ? geminiResponse.status : 502;
    console.error('[identify-product] Upstream error from Gemini:', errorDetail);
    return jsonResponse(
      {
        error: isImageDecodeError
          ? `Corrupt or unreadable image: ${errorDetail}`
          : `Gemini API error: ${errorDetail}`,
      },
      status
    );
  }

  // Parse Gemini response body
  let geminiData: any;
  try {
    geminiData = await geminiResponse.json();
  } catch {
    return jsonResponse({ error: 'Failed to parse response from Gemini vision service.' }, 502);
  }

  // Handle Gemini safety filter rejection
  const blockReason = geminiData.promptFeedback?.blockReason;
  const finishReason = geminiData.candidates?.[0]?.finishReason;
  if (blockReason || finishReason === 'SAFETY') {
    const reasonText = blockReason || finishReason || 'SAFETY';
    console.warn(`[identify-product] Image flagged by safety filter: ${reasonText}`);
    return jsonResponse(
      {
        error: `The uploaded image could not be processed due to content safety policies (${reasonText}). Please upload a clear photo of an artisan craft item.`,
      },
      422
    );
  }

  // Extract structured candidate text
  const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText || typeof candidateText !== 'string') {
    console.error('[identify-product] No candidate text returned in response:', JSON.stringify(geminiData));
    return jsonResponse(
      { error: 'No identification data returned by Gemini for this image.' },
      502
    );
  }

  // Parse structured JSON returned by Gemini responseSchema
  let parsedResult: any;
  try {
    parsedResult = JSON.parse(candidateText.trim());
  } catch (parseErr) {
    console.error('[identify-product] Malformed JSON from Gemini structured output:', candidateText);
    return jsonResponse(
      { error: 'Gemini returned malformed structured JSON output.' },
      502
    );
  }

  // Validate parsed result without fabricating default values
  const validation = validateGeminiResult(parsedResult);
  if (!validation.ok) {
    console.error(
      '[identify-product] Gemini output validation failed:',
      validation.error,
      'Raw candidate text was:',
      candidateText
    );
    return jsonResponse({ error: validation.error }, 502);
  }

  return jsonResponse(validation.value as unknown as Record<string, unknown>, 200);
});
