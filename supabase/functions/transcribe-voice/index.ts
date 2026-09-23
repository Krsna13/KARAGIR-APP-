// supabase/functions/transcribe-voice/index.ts
// Stage 6.2: Supabase Edge Function: Multimodal Voice Transcription Engine
// Transcribes an artisan's spoken vernacular answer into a strictly typed field value
// using Google Gemini without leaking GEMINI_API_KEY to the client bundle.

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
  type VoiceFieldSpec,
  validateVoiceResult,
} from './validation.ts';

interface TranscribeVoiceRequestBody {
  audioBase64?: string;
  mimeType?: string;
  speakingLanguage?: string;
  field?: VoiceFieldSpec;
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
    console.error('[transcribe-voice] Missing GEMINI_API_KEY secret.');
    return jsonResponse(
      {
        error:
          'GEMINI_API_KEY is not configured on the Supabase Edge Function. Set it using: supabase secrets set GEMINI_API_KEY=<your-key>',
      },
      500
    );
  }

  // 4. Parse and validate client request payload
  let body: TranscribeVoiceRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { error: 'Invalid request body. Expected JSON with audioBase64 and field specification.' },
      400
    );
  }

  const { audioBase64, mimeType = 'audio/wav', speakingLanguage = 'hi', field } = body;

  if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.trim() === '') {
    return jsonResponse(
      { error: 'Missing or invalid audioBase64. Base64-encoded audio is required.' },
      400
    );
  }

  if (!field || typeof field !== 'object' || !field.key || !field.type) {
    return jsonResponse(
      { error: 'Missing or invalid field specification. Object with key and type is required.' },
      400
    );
  }

  // Sanitize base64 payload
  const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
  const base64CharRegex = /^[A-Za-z0-9+/=]+$/;
  if (!cleanBase64 || !base64CharRegex.test(cleanBase64.replace(/\s/g, ''))) {
    return jsonResponse(
      { error: 'Corrupt or invalid base64 audio data supplied.' },
      400
    );
  }

  // 5. Construct tailored prompt and Gemini responseSchema based on field.type
  const systemPrompt = `You are Kaaragir AI Voice Engine for rural and semi-urban Indian craft artisans.
The artisan is answering the following question in their spoken language (${speakingLanguage || 'Hindi/Marathi/Indian English'}):
Question: "${field.question_en}" (Key: "${field.key}", Expected Type: "${field.type}").

Strict rules:
1. Listen carefully to the audio and extract the answer accurately without hallucinating.
2. If the audio is silent, unintelligible, background noise, or unrelated to the question, set status to 'unclear' or 'off_topic', and value to null.
3. Indian Vernacular Number Rules:
   - Spoken numbers must convert to standard numeric values:
     "dhai" → 2.5
     "saadhe teen" → 3.5
     "paune do" → 1.75
     "ek lakh" → 100000
     "do hazaar paanch sau" → 2500
     "dedh sau" → 150
     "sava do" → 2.25
     "paanch sau" → 500
     "do hazaar" → 2000
4. Dimension Rules:
   - Only ask about / extract these dimensions for this question: ${(field.dimension_keys ?? ['length', 'width', 'height']).join(', ')}.
   - Extract only those, plus unit ('ft' | 'in' | 'cm' | 'm'). Any other dimension key MUST be null.
   - Any dimension not actually spoken in the audio MUST be null, NEVER guessed!
   - If unit was not spoken, unit MUST be null.
   - approximate: set to true ONLY if the artisan hedged the number, e.g. "lagbhag", "around",
     "roughly", "kareeb", "taqreeban", "-ish". Otherwise false.
5. Labor/Time Rules (when unit_hint is 'days'):
   - Convert weeks and months the artisan mentions into days: 1 week = 7 days, 1 month = 30 days.
     E.g. "do hafte" (two weeks) → 14. "ek mahina" (one month) → 30. "dedh mahina" (1.5 months) → 45.
   - The returned number is always in days.
6. Choice Rules:
   - For choice type, value MUST be one of the choice IDs: [${(field.choices || []).map((c) => c.id).join(', ')}].
   - If spoken craft does not match any allowed choice id, set status to 'unclear' and value to null.
7. Display Values:
   - value_display_en: Concise human-readable string in English.
   - value_display_hi: Concise human-readable string in Hindi.
   - value_display_spoken: The value spoken naturally in the artisan's speaking language (${speakingLanguage}), suitable for TTS read-back.`;

  // Build field-specific value schema
  let valueSchema: Record<string, unknown>;
  switch (field.type) {
    case 'text':
    case 'long_text':
      valueSchema = {
        type: 'OBJECT',
        description: 'Original vernacular text and English translation',
        properties: {
          original: { type: 'STRING', description: 'Transcript of spoken answer in native script' },
          en: { type: 'STRING', description: 'English translation of the spoken answer' },
        },
        required: ['original', 'en'],
      };
      break;
    case 'number':
      valueSchema = {
        type: 'NUMBER',
        description: 'Numeric value parsed from speech, or null if unclear',
      };
      break;
    case 'dimensions': {
      // Shape-aware (Stage 6.5): only the requested keys are in the schema, so a
      // dupatta (flat) is never asked for height and a pot (round) is never asked
      // for width. Defaults to length/width/height for older field specs.
      const askedKeys = field.dimension_keys ?? ['length', 'width', 'height'];
      const dimLabels: Record<string, string> = {
        length: 'Length', width: 'Width', height: 'Height', diameter: 'Diameter', thickness: 'Thickness',
      };
      const dimProperties: Record<string, unknown> = {};
      for (const k of askedKeys) {
        dimProperties[k] = { type: 'NUMBER', description: `${dimLabels[k] ?? k} or null if not spoken` };
      }
      dimProperties.unit = {
        type: 'STRING',
        enum: ['ft', 'in', 'cm', 'm'],
        description: "Measurement unit ('ft', 'in', 'cm', 'm') or null if not spoken",
      };
      dimProperties.approximate = {
        type: 'BOOLEAN',
        description: 'True only if the artisan hedged the number (e.g. "lagbhag", "around", "roughly"); otherwise false',
      };
      valueSchema = {
        type: 'OBJECT',
        description: `Craft dimensions (only ${askedKeys.join(', ')} apply to this question). Missing values must be null`,
        properties: dimProperties,
      };
      break;
    }
    case 'choice':
      valueSchema = {
        type: 'STRING',
        enum: (field.choices || []).map((c) => c.id),
        description: 'Selected choice ID from available options',
      };
      break;
    default:
      valueSchema = { type: 'STRING' };
  }

  const geminiEndpoint = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const geminiPayload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/wav',
              data: cleanBase64.replace(/\s/g, ''),
            },
          },
          {
            text: systemPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          status: {
            type: 'STRING',
            enum: ['ok', 'unclear', 'off_topic'],
            description: "Status of understanding: 'ok', 'unclear', or 'off_topic'",
          },
          transcript_original: {
            type: 'STRING',
            description: 'Literal speech transcript in the language spoken',
          },
          value: valueSchema,
          value_display_en: {
            type: 'STRING',
            description: 'Short display text in English',
          },
          value_display_hi: {
            type: 'STRING',
            description: 'Short display text in Hindi',
          },
          value_display_spoken: {
            type: 'STRING',
            description: 'Spoken form in the artisan language for TTS playback',
          },
          confidence: {
            type: 'NUMBER',
            description: 'Confidence score from 0.0 to 1.0',
          },
        },
        required: [
          'status',
          'transcript_original',
          'value_display_en',
          'value_display_hi',
          'value_display_spoken',
          'confidence',
        ],
      },
    },
  };

  // 6. Call Gemini API
  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });
  } catch (networkErr: unknown) {
    const errMessage = networkErr instanceof Error ? networkErr.message : String(networkErr);
    console.error('[transcribe-voice] Network failure connecting to Gemini:', errMessage);
    return jsonResponse(
      { error: `Network failure connecting to Gemini voice service: ${errMessage}` },
      502
    );
  }

  // 7. Handle non-200 HTTP responses from Gemini
  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error(`[transcribe-voice] Gemini returned HTTP ${geminiResponse.status}:`, errorText);

    if (geminiResponse.status === 429) {
      return jsonResponse(
        { error: 'AI voice service rate limit exceeded. Please wait a moment and try speaking again.' },
        429
      );
    }

    if (geminiResponse.status === 400) {
      return jsonResponse(
        { error: 'Invalid audio input. Please check the recording and try again.' },
        422
      );
    }

    return jsonResponse(
      { error: `Gemini API returned an error (HTTP ${geminiResponse.status}): ${errorText}` },
      502
    );
  }

  // 8. Parse JSON from Gemini
  let rawJsonText: string;
  try {
    const geminiData = await geminiResponse.json();
    rawJsonText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawJsonText || typeof rawJsonText !== 'string') {
      return jsonResponse(
        { error: 'Gemini returned an empty response. Audio may be silent or unclear.' },
        422
      );
    }
  } catch (jsonErr: unknown) {
    const errMessage = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
    return jsonResponse(
      { error: `Failed to parse response from Gemini: ${errMessage}` },
      502
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    return jsonResponse(
      { error: 'Gemini returned invalid JSON that could not be parsed.' },
      502
    );
  }

  // 9. Validate parsed output against strict field rules
  const validation = validateVoiceResult(parsed, field);
  if (!validation.ok) {
    console.warn('[transcribe-voice] Validation failure:', validation.error);
    return jsonResponse(
      { error: `Voice response validation error: ${validation.error}` },
      422
    );
  }

  return jsonResponse(validation.value as unknown as Record<string, unknown>, 200);
});
