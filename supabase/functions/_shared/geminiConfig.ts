// supabase/functions/_shared/geminiConfig.ts
/**
 * Shared Gemini model configuration for Supabase Edge Functions (Stage 6.2).
 *
 * Model Chosen: 'gemini-2.5-flash'
 * Why:
 * 1. Multimodal Latency: Sub-second latency processing audio and vision inputs directly.
 * 2. Structured JSON: Native support for strict responseSchema enforcement without hallucinated JSON wrappers.
 * 3. Vernacular Accuracy: High accuracy transcribing and interpreting regional Indian languages
 *    (Hindi, Marathi, Indian English) and Indian vernacular number idioms ("dhai", "dedh sau", etc.).
 * 4. Cost Efficiency: Optimized token pricing for real-time mobile artisan interactions.
 */
export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
