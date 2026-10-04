// src/services/__tests__/voiceTranscriptionService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transcribeForField, transcribeTextForField } from '../voiceTranscriptionService';
import { supabase } from '../../lib/supabase/client';
import type { VoiceFieldSpec } from '../../types/voice';

vi.mock('../../lib/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('voiceTranscriptionService demo mode gating', () => {
  const itemTypeField: VoiceFieldSpec = {
    key: 'item_type',
    type: 'text',
    question_en: 'What is this item?',
    question_hi: 'यह क्या चीज़ है?',
  };

  const sampleBlob = new Blob(['mock-pcm-audio-content'], { type: 'audio/wav' });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('When VITE_DEMO_MODE is OFF (default / unset / false)', () => {
    it('transcribeForField calls the real Supabase Edge Function and never returns the hardcoded Bed script', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: {
          status: 'ok',
          transcript_original: 'कुर्सी',
          value: { original: 'कुर्सी', en: 'Chair' },
          value_display_en: 'Chair',
          value_display_hi: 'कुर्सी',
          value_display_spoken: 'कुर्सी',
          confidence: 0.94,
        },
        error: null,
      });

      const result = await transcribeForField(sampleBlob, itemTypeField, 'hi');

      // Must call the real Edge function
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith(
        'transcribe-voice',
        expect.objectContaining({
          body: expect.objectContaining({
            mimeType: 'audio/wav',
            speakingLanguage: 'hi',
            field: itemTypeField,
          }),
        })
      );

      // Must return real result, not the hardcoded Bed script
      expect(result.value_display_en).toBe('Chair');
      expect(result.value_display_en).not.toBe('Bed');
      expect(result.confidence).toBe(0.94);
    });

    it('transcribeTextForField calls the real Supabase Edge Function and never returns the hardcoded Bed script', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'false');

      const mockInvoke = vi.mocked(supabase.functions.invoke);
      mockInvoke.mockResolvedValueOnce({
        data: {
          status: 'ok',
          transcript_original: 'मेज',
          value: { original: 'मेज', en: 'Table' },
          value_display_en: 'Table',
          value_display_hi: 'मेज',
          value_display_spoken: 'मेज',
          confidence: 0.98,
        },
        error: null,
      });

      const result = await transcribeTextForField('मेज', itemTypeField, 'hi');

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(result.value_display_en).toBe('Table');
      expect(result.value_display_en).not.toBe('Bed');
    });
  });

  describe('When VITE_DEMO_MODE is ON ("true")', () => {
    it('transcribeForField returns the Bed script with confidence 1.0 without calling Edge Function', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');

      const mockInvoke = vi.mocked(supabase.functions.invoke);

      const result = await transcribeForField(sampleBlob, itemTypeField, 'hi');

      // Edge Function must NOT be called
      expect(mockInvoke).not.toHaveBeenCalled();

      // Returns the Bed script
      expect(result.status).toBe('ok');
      expect(result.value).toEqual({ original: 'पलंग', en: 'Bed' });
      expect(result.value_display_en).toBe('Bed');
      expect(result.value_display_hi).toBe('पलंग / बेड');
      expect(result.value_display_spoken).toBe('पलंग');
      expect(result.confidence).toBe(1.0);
    });

    it('transcribeForField in Marathi returns Marathi spoken value for Bed', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');

      const result = await transcribeForField(sampleBlob, itemTypeField, 'mr');

      expect(result.status).toBe('ok');
      expect(result.value).toEqual({ original: 'बेड', en: 'Bed' });
      expect(result.value_display_spoken).toBe('बेड');
      expect(result.confidence).toBe(1.0);
    });

    it('transcribeTextForField returns the Bed script without calling Edge Function', async () => {
      vi.stubEnv('VITE_DEMO_MODE', 'true');

      const mockInvoke = vi.mocked(supabase.functions.invoke);

      const result = await transcribeTextForField('anything', itemTypeField, 'hi');

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(result.status).toBe('ok');
      expect(result.value_display_en).toBe('Bed');
      expect(result.confidence).toBe(1.0);
    });
  });
});
