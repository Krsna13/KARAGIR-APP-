import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUPPORTED_LANGUAGES, speakLanguageName } from '../languages';

describe('Languages Config & SpeechSynthesis (Stage 6.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('provides Hindi, Marathi, and English with correct BCP-47 codes and native names', () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('hi');
    expect(codes).toContain('mr');
    expect(codes).toContain('en');

    const hi = SUPPORTED_LANGUAGES.find((l) => l.code === 'hi');
    expect(hi?.nativeName).toBe('हिंदी');
    expect(hi?.bcp47).toBe('hi-IN');

    const mr = SUPPORTED_LANGUAGES.find((l) => l.code === 'mr');
    expect(mr?.nativeName).toBe('मराठी');
    expect(mr?.fallbackBcp47).toBe('hi-IN');
  });

  it('speakLanguageName never throws if window.speechSynthesis is undefined', () => {
    const originalSpeechSynthesis = window.speechSynthesis;
    // @ts-ignore
    delete window.speechSynthesis;

    expect(() => {
      speakLanguageName('hi', 'हिंदी');
      speakLanguageName('mr', 'मराठी');
      speakLanguageName('unknown', 'test');
    }).not.toThrow();

    window.speechSynthesis = originalSpeechSynthesis;
  });

  it('speakLanguageName falls back to hi-IN when target language voice is missing on device', () => {
    const cancelMock = vi.fn();
    const speakMock = vi.fn();
    const hindiVoice = { lang: 'hi-IN', name: 'Google हिन्दी' };

    // Simulate device with only Hindi voice (no Marathi voice installed)
    const mockSynth = {
      cancel: cancelMock,
      speak: speakMock,
      getVoices: vi.fn().mockReturnValue([hindiVoice]),
    };

    // @ts-ignore
    window.speechSynthesis = mockSynth;
    // @ts-ignore
    window.SpeechSynthesisUtterance = class MockUtterance {
      text: string;
      lang: string = '';
      voice: any = null;
      rate: number = 1;
      pitch: number = 1;
      constructor(text: string) {
        this.text = text;
      }
    };

    expect(() => {
      speakLanguageName('mr', 'मराठी');
    }).not.toThrow();

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(speakMock).toHaveBeenCalledTimes(1);

    const calledUtterance = speakMock.mock.calls[0][0];
    expect(calledUtterance.voice).toEqual(hindiVoice);
    expect(calledUtterance.lang).toBe('hi-IN');
  });

  it('speakLanguageName gracefully catches errors and never throws uncaught exceptions', () => {
    // @ts-ignore
    window.speechSynthesis = {
      cancel: () => {
        throw new Error('Speech synthesis hardware bus error');
      },
      speak: vi.fn(),
      getVoices: () => [],
    };

    expect(() => {
      speakLanguageName('hi', 'हिंदी');
    }).not.toThrow();
  });
});
