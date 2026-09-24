// supabase/functions/generate-listing/index.ts
// Supabase Edge Function: Multilingual Listing Generator and Reviser (Stage 6.6).
// Produces professional, SEO-friendly listings in English and Hindi with strict
// No-Fabrication enforcement and a retry-once guarantee.

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

import { GEMINI_MODEL, GEMINI_BASE_URL } from '../_shared/geminiConfig.ts';
import {
  validateListingResult,
  type ListingOutput,
  type ProductFactsInput,
  type ArtisanListingProfile,
} from './validation.ts';

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title_en: { type: 'STRING', description: 'English title, max ~70 characters.' },
    title_hi: { type: 'STRING', description: 'Hindi title in Devanagari script, max ~70 characters.' },
    seo_caption_en: { type: 'STRING', description: 'One-line SEO meta caption in English, max ~120 characters.' },
    seo_caption_hi: { type: 'STRING', description: 'One-line SEO meta caption in Hindi, max ~120 characters.' },
    highlights_en: {
      type: 'ARRAY',
      description: '4 to 6 key highlight bullet points in English.',
      items: { type: 'STRING' },
    },
    highlights_hi: {
      type: 'ARRAY',
      description: '4 to 6 key highlight bullet points in Hindi.',
      items: { type: 'STRING' },
    },
    description_en: {
      type: 'STRING',
      description: 'A rich single-paragraph narrative description in English (~80-150 words).',
    },
    description_hi: {
      type: 'STRING',
      description: 'A rich single-paragraph narrative description in natural Hindi (~80-150 words).',
    },
    search_tags: {
      type: 'ARRAY',
      description: '8 to 15 search keywords, including popular Hindi words in English letters (e.g. sheesham jhula).',
      items: { type: 'STRING' },
    },
    summary_spoken: {
      type: 'STRING',
      description: '2 to 3 sentences in the speaking language for audio read-aloud to the artisan.',
    },
  },
  required: [
    'title_en',
    'title_hi',
    'seo_caption_en',
    'seo_caption_hi',
    'highlights_en',
    'highlights_hi',
    'description_en',
    'description_hi',
    'search_tags',
    'summary_spoken',
  ],
};

function buildPrompt(
  facts: ProductFactsInput,
  artisanProfile?: ArtisanListingProfile | null,
  speakingLanguage: string = 'hi',
  mode: string = 'generate',
  revise?: { current_listing: ListingOutput; instruction: string; section?: string },
  retryError?: string
): string {
  const hasExp = typeof artisanProfile?.experience_years === 'number' && artisanProfile.experience_years > 0;

  const factsJson = JSON.stringify(facts, null, 2);
  const artisanJson = JSON.stringify(
    {
      shop_name: artisanProfile?.shop_name || 'Artisan Workshop',
      city: artisanProfile?.city || 'India',
      ...(hasExp ? { experience_years: artisanProfile?.experience_years } : {}),
    },
    null,
    2
  );

  let prompt = `You are a master bilingual cataloger for Kaaragir, an ethical Indian craft marketplace.
Generate a high-converting, professional, SEO-friendly product listing in English AND natural, culturally authentic Hindi.

--- CONFIRMED FACTS ---
${factsJson}

--- ARTISAN PROFILE ---
${artisanJson}

--- ARTISAN SPEAKING LANGUAGE ---
${speakingLanguage}

--- MANDATORY NO-FABRICATION RULES ---
1. EVERY CLAIM MUST COME FROM THE SUPPLIED FACTS. Do not invent features, materials, origins, or capabilities.
2. NUMBERS RULE: Every number in the generated text MUST match a confirmed fact (dimensions, cm conversions, labor days, lead time, quantity, or artisan experience if provided). NEVER mention any other number.
3. ABSOLUTELY NO PRICE OR CURRENCY ANYWHERE. Do not mention ₹, Rs, INR, price, pricing, कीमत, मूल्य, दाम, rupee, rupees. Pricing will be decided in a later step.
4. RISKY PROMOTIONAL CLAIMS PROHIBITED: Do NOT use words such as:
   - antique, vintage, heritage, eco-friendly, organic, sustainable, certified, GI tag, award-winning, generations, centuries, 100%, guaranteed
   - OR their Hindi equivalents (प्राचीन, विंटेज, विरासत, पर्यावरण-अनुकूल, जैविक, टिकाऊ, प्रमाणित, जीआई टैग, पुरस्कार विजेता, पीढ़ियों, सदियों, १००%, गारंटी)
   UNLESS that exact concept was explicitly stated in the artisan's own story or care instructions above.
5. ARTISAN EXPERIENCE:
   ${
     hasExp
       ? `The artisan has ${artisanProfile?.experience_years} years of experience. You may mention this accurately. NEVER mention '0 years'.`
       : 'The artisan did NOT provide experience years. DO NOT mention years of experience at all anywhere in the text.'
   }
6. HINDI QUALITY: Hindi must be natural, fluent, elegant Devanagari Hindi. Never produce literal, robotic word-by-word translations.
7. SEARCH TAGS: Provide 8-15 buyer-focused tags, including common Hindi phrases written in Roman English script (e.g. "sheesham jhula", "mitti diya", "hath ka banaya", "wooden chowki").
8. SUMMARY SPOKEN: 2-3 warm, clear sentences in the artisan's speaking language (${speakingLanguage}) explaining the listing to the artisan for audio playback.`;

  if (mode === 'revise' && revise) {
    prompt += `\n\n--- REVISION INSTRUCTION ---
The artisan requested this specific revision: "${revise.instruction}".
${revise.section ? `Focus revision on section: "${revise.section}".` : ''}
Current Listing:
${JSON.stringify(revise.current_listing, null, 2)}
Revise the listing following the instruction while maintaining strict compliance with all NO-FABRICATION rules.`;
  }

  if (retryError) {
    prompt += `\n\n--- CRITICAL CORRECTION REQUIRED (PREVIOUS ATTEMPT FAILED) ---
Your previous output was rejected by our automated validator with this error:
"${retryError}"
You MUST fix this violation immediately. Remove any unauthorized numbers, unverified claims, or price mentions. Comply strictly with all facts.`;
  }

  return prompt;
}

async function callGemini(apiKey: string, promptText: string): Promise<string> {
  const endpoint = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: promptText }],
      },
    ],
    generationConfig: {
      temperature: 0.2, // Low temperature for high factual accuracy
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('Gemini returned an empty candidate text.');
  }

  return text.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Please use POST.' }, 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey || apiKey.trim() === '') {
    console.error('[generate-listing] Missing GEMINI_API_KEY secret.');
    return jsonResponse(
      { error: 'GEMINI_API_KEY is not configured on the Supabase Edge Function.' },
      500
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
  }

  const facts: ProductFactsInput = body?.facts || {};
  const artisanProfile: ArtisanListingProfile | null = body?.artisanProfile || null;
  const speakingLanguage: string = body?.speakingLanguage || 'hi';
  const mode: string = body?.mode === 'revise' ? 'revise' : 'generate';
  const revise = body?.revise;

  // Attempt 1: Call Gemini
  let candidateText1 = '';
  try {
    const prompt1 = buildPrompt(facts, artisanProfile, speakingLanguage, mode, revise);
    candidateText1 = await callGemini(apiKey, prompt1);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-listing] Attempt 1 Gemini API call error:', msg);
    return jsonResponse({ error: `AI listing generation failed: ${msg}` }, 502);
  }

  let parsed1: unknown;
  try {
    parsed1 = JSON.parse(candidateText1);
  } catch (err) {
    console.error('[generate-listing] Malformed JSON from Gemini attempt 1:', candidateText1);
  }

  const validation1 = parsed1
    ? validateListingResult(parsed1, facts, artisanProfile)
    : { ok: false, error: 'Malformed JSON output' };

  if (validation1.ok && validation1.value) {
    return jsonResponse(validation1.value as unknown as Record<string, unknown>, 200);
  }

  // Validation failed on attempt 1: Log server-side and RETRY ONCE with feedback
  console.warn(
    '[generate-listing] Validation attempt 1 failed:',
    validation1.error,
    'Raw output:',
    candidateText1
  );

  let candidateText2 = '';
  try {
    const prompt2 = buildPrompt(facts, artisanProfile, speakingLanguage, mode, revise, validation1.error);
    candidateText2 = await callGemini(apiKey, prompt2);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-listing] Attempt 2 retry call error:', msg);
    return jsonResponse({ error: `AI listing retry failed: ${msg}` }, 502);
  }

  let parsed2: unknown;
  try {
    parsed2 = JSON.parse(candidateText2);
  } catch (err) {
    console.error('[generate-listing] Malformed JSON from Gemini attempt 2:', candidateText2);
  }

  const validation2 = parsed2
    ? validateListingResult(parsed2, facts, artisanProfile)
    : { ok: false, error: 'Malformed JSON output on retry' };

  if (validation2.ok && validation2.value) {
    return jsonResponse(validation2.value as unknown as Record<string, unknown>, 200);
  }

  // Failed second attempt: Log raw output server-side and return 502 with honest reason
  console.error(
    '[generate-listing] Validation attempt 2 failed. Raw output:',
    candidateText2,
    'Reason:',
    validation2.error
  );

  return jsonResponse(
    {
      error: `Listing validation failed: ${validation2.error}`,
      failedRule: validation2.failedRule,
    },
    502
  );
});
