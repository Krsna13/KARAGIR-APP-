/**
 * Configuration for supported languages across the Kaaragir artisan marketplace.
 * Designed for low-literacy artisans with native scripts and TTS audio prompts.
 */

export interface LanguageConfig {
  code: string;           // Language code (e.g. 'hi', 'mr', 'en')
  name: string;           // Display name in English
  nativeName: string;     // Display name in native script
  speechText: string;     // Text to speak via browser SpeechSynthesis
  bcp47: string;          // Primary BCP-47 language tag for TTS voice matching
  fallbackBcp47: string;  // Fallback tag if primary voice is not installed
  accentColor: string;    // Theme accent for the language card
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिंदी',
    speechText: 'हिंदी',
    bcp47: 'hi-IN',
    fallbackBcp47: 'hi-IN',
    accentColor: '#EA580C',
  },
  {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    speechText: 'मराठी',
    bcp47: 'mr-IN',
    fallbackBcp47: 'hi-IN', // Device fallback per specification
    accentColor: '#EAB308',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    speechText: 'English',
    bcp47: 'en-IN',
    fallbackBcp47: 'hi-IN',
    accentColor: '#38BDF8',
  },
];
/**
 * General speech synthesis helper that reads aloud any text in the artisan's speaking language.
 * Supports mr-IN, hi-IN, en-IN, falling back to hi-IN.
 * Guaranteed to NEVER throw errors.
 */
export const speakText = (text: string, langCode: string = 'hi'): void => {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    if (!text || text.trim() === '') {
      return;
    }

    const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === langCode);

    // Cancel any active speech before starting new utterance
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices?.() || [];

    // Find a voice matching the target bcp47, or start of code (e.g. 'mr', 'hi')
    const primaryMatch = voices.find(v => 
      v.lang.toLowerCase() === langConfig?.bcp47.toLowerCase() ||
      v.lang.toLowerCase().startsWith(langCode.toLowerCase())
    );

    // Fall back to hi-IN voice if device lacks the specific language voice
    const fallbackMatch = voices.find(v => 
      v.lang.toLowerCase() === 'hi-in' || 
      v.lang.toLowerCase().startsWith('hi')
    );

    const chosenVoice = primaryMatch || fallbackMatch || voices[0] || null;

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    } else {
      utterance.lang = langConfig?.bcp47 || 'hi-IN';
    }

    utterance.rate = 0.9; // Slightly slower for artisan clarity
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    // Graceful swallow: per specification, audio synthesis must never throw
    console.warn('[SpeechSynthesis] Failed to play speech audio:', err);
  }
};

/**
 * Reads aloud the given text or language name using the browser's SpeechSynthesis API.
 * Safely handles missing browser support, missing voices, and falls back to hi-IN.
 * Guaranteed to NEVER throw errors.
 */
export const speakLanguageName = (langCode: string, textToSpeak?: string): void => {
  const langConfig = SUPPORTED_LANGUAGES.find(l => l.code === langCode);
  const spokenText = textToSpeak || langConfig?.speechText || langCode;
  speakText(spokenText, langCode);
};
