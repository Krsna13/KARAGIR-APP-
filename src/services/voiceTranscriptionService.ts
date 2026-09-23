// src/services/voiceTranscriptionService.ts
// Stage 6.2: Client service for spoken artisan field transcription via Supabase Edge Function.
// Converts audio to 16 kHz mono 16-bit PCM WAV on the client and enforces a 20-second timeout.

import { supabase } from '../lib/supabase/client';
import type { VoiceFieldSpec, VoiceTranscriptionResult } from '../types/voice';
import { convertAudioBlobTo16kHzWav } from '../utils/audioConverter';

export class VoiceTranscriptionError extends Error {
  readonly status?: number;
  readonly cause?: unknown;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = 'VoiceTranscriptionError';
    this.status = options?.status;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, VoiceTranscriptionError.prototype);
  }
}

/**
 * Converts a browser/DOM Blob into a base64-encoded string using chunked reading.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const CLIENT_TIMEOUT_MS = 20000; // 20-second client timeout per specification

/**
 * Transcribes an artisan's spoken audio for a specific field.
 *
 * 1. Converts input audio to 16 kHz mono 16-bit PCM WAV on the client.
 * 2. Encodes to base64 and invokes Supabase Edge Function 'transcribe-voice'.
 * 3. Enforces 20-second timeout with friendly bilingual error on timeout.
 * 4. Audio is sent in-memory for transcription only and never uploaded to storage.
 */
export async function transcribeForField(
  audioBlob: Blob,
  field: VoiceFieldSpec,
  speakingLanguage: string = 'hi'
): Promise<VoiceTranscriptionResult> {
  if (!audioBlob || audioBlob.size === 0) {
    throw new VoiceTranscriptionError(
      'No audio recorded. Please tap the microphone and speak again / कोई आवाज़ रिकॉर्ड नहीं हुई।'
    );
  }

  // 1. Convert to 16 kHz mono 16-bit PCM WAV
  let wavBlob: Blob;
  try {
    wavBlob = await convertAudioBlobTo16kHzWav(audioBlob);
  } catch (convErr) {
    console.warn('[VoiceTranscriptionService] WAV conversion fallback to raw blob:', convErr);
    wavBlob = audioBlob;
  }

  // 2. Base64 encode
  let audioBase64: string;
  try {
    audioBase64 = await blobToBase64(wavBlob);
  } catch (encodeErr) {
    throw new VoiceTranscriptionError(
      'Failed to process audio recording. Please try again / ऑडियो प्रोसेस नहीं हो सका।',
      { cause: encodeErr }
    );
  }

  // 3. Create timeout promise for 20-second limit
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(
        new VoiceTranscriptionError(
          'Request timed out. Please try again / अनुरोध समय समाप्त। कृपया पुनः प्रयास करें।',
          { status: 408 }
        )
      );
    }, CLIENT_TIMEOUT_MS);
  });

  // 4. Invoke Edge Function with timeout race
  try {
    const invokePromise = supabase.functions.invoke('transcribe-voice', {
      body: {
        audioBase64,
        mimeType: 'audio/wav',
        speakingLanguage,
        field,
      },
    });

    const response = await Promise.race([invokePromise, timeoutPromise]);

    if (timerId) clearTimeout(timerId);

    const { data, error } = response;

    if (error) {
      let errorMessage = error.message || 'Voice transcription failed.';
      let status: number | undefined;

      if (typeof error === 'object' && error !== null && 'context' in error) {
        const ctx = (error as { context?: { status?: number; json?: () => Promise<any> } }).context;
        if (ctx?.status) {
          status = ctx.status;
        }
        if (typeof ctx?.json === 'function') {
          try {
            const body = await ctx.json();
            if (body?.error && typeof body.error === 'string') {
              errorMessage = body.error;
            }
          } catch {
            // ignore JSON parse fallback
          }
        }
      }

      throw new VoiceTranscriptionError(errorMessage, { status, cause: error });
    }

    if (!data) {
      throw new VoiceTranscriptionError(
        'No transcription data returned from the voice service / आवाज़ सेवा से कोई डेटा प्राप्त नहीं हुआ।'
      );
    }

    return data as VoiceTranscriptionResult;
  } catch (err: unknown) {
    if (timerId) clearTimeout(timerId);
    if (err instanceof VoiceTranscriptionError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new VoiceTranscriptionError(
      `Voice transcription error: ${message}`,
      { cause: err }
    );
  }
}
