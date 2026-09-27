// src/components/voice/VoiceOrTypeInput.tsx
// Stage 6.6b: Universal Voice or Type Input Component.
// Offers a large microphone (primary via VoiceInputButton) plus an "or type / या लिखें" input (secondary).
// - number: numeric keyboard, parsed locally with Devanagari numerals support; no AI call, no confirm step.
// - dimensions: shape-aware numeric boxes (from SHAPE_DIMENSION_KEYS) + unit chips + approx toggle; parsed locally, no confirm step.
// - choice: existing icon cards (typing not needed, renders VoiceInputButton).
// - text / long_text: free text input with lang attribute; typed text goes through transcribe-voice { text } for translation; confirm step for AI translation.

import React, { useState } from 'react';
import {
  Keyboard,
  Check,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type {
  VoiceFieldSpec,
  DimensionKey,
  VoiceTranscriptionResult,
} from '../../types/voice';
import type { ProductShapeProfile } from '../../types/product';
import { VoiceInputButton } from './VoiceInputButton';
import {
  parseLocalNumber,
  parseLocalDimensions,
  type RawDimensionInputs,
} from '../../utils/localParsers';
import { requiredDimensionKeysForShape } from '../../utils/dimensionMerger';
import { transcribeTextForField } from '../../services/voiceTranscriptionService';

export interface VoiceOrTypeInputProps {
  field: VoiceFieldSpec;
  speakingLanguage?: string;
  onValueConfirmed: (value: any) => void;
  className?: string;
  disabled?: boolean;
  maxDurationSeconds?: number;
  shapeProfile?: ProductShapeProfile | null;
  /** Optional prefill / initial value */
  initialValue?: any;
  /** Custom test ID for container */
  containerTestId?: string;
  /** Custom test ID for text/number input */
  inputTestId?: string;
  /** Custom test ID for save button */
  submitTestId?: string;
  /** Custom placeholder override */
  placeholder?: string;
}

const DIMENSION_LABELS: Record<DimensionKey, { en: string; hi: string; mr: string }> = {
  length: { en: 'Length', hi: 'लंबाई', mr: 'लांबी' },
  width: { en: 'Width', hi: 'चौड़ाई', mr: 'रुंदी' },
  height: { en: 'Height', hi: 'ऊंचाई', mr: 'उंची' },
  diameter: { en: 'Diameter', hi: 'व्यास', mr: 'व्यास' },
  thickness: { en: 'Thickness', hi: 'मोटाई', mr: 'जाडी' },
};

export const VoiceOrTypeInput: React.FC<VoiceOrTypeInputProps> = ({
  field,
  speakingLanguage = 'hi',
  onValueConfirmed,
  className = '',
  disabled = false,
  maxDurationSeconds = 60,
  shapeProfile,
  initialValue,
  containerTestId = 'voice-or-type-input',
  inputTestId,
  submitTestId,
  placeholder,
}) => {
  const isMarathi = speakingLanguage === 'mr';

  // --- 1. Number Field State ---
  const [typedNumber, setTypedNumber] = useState<string>(
    initialValue !== undefined && initialValue !== null ? String(initialValue) : ''
  );
  const [numberError, setNumberError] = useState<string | null>(null);

  // --- 2. Dimensions Field State ---
  const requiredDimKeys: DimensionKey[] = React.useMemo(() => {
    if (shapeProfile) {
      return requiredDimensionKeysForShape(shapeProfile);
    }
    if (field.dimension_keys && field.dimension_keys.length > 0) {
      return field.dimension_keys;
    }
    return ['length', 'width', 'height'];
  }, [shapeProfile, field.dimension_keys]);

  const [dimInputs, setDimInputs] = useState<RawDimensionInputs>({});
  const [selectedUnit, setSelectedUnit] = useState<'ft' | 'in' | 'cm' | 'm'>('cm');
  const [isApproximate, setIsApproximate] = useState<boolean>(false);
  const [dimError, setDimError] = useState<string | null>(null);

  // --- 3. Text / Long_Text Field State ---
  const [typedText, setTypedText] = useState<string>(
    typeof initialValue === 'string'
      ? initialValue
      : initialValue?.original || initialValue?.en || ''
  );
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [translationResult, setTranslationResult] = useState<VoiceTranscriptionResult | null>(null);

  // Handlers
  const handleNumberSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setNumberError(null);
    const parsed = parseLocalNumber(typedNumber);
    if (parsed === null) {
      setNumberError(
        isMarathi
          ? 'कृपया योग्य संख्या प्रविष्ट करा / Please enter a valid number'
          : 'कृपया सही संख्या लिखें / Please enter a valid number'
      );
      return;
    }
    onValueConfirmed(parsed);
  };

  const handleDimensionsSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setDimError(null);
    const parsed = parseLocalDimensions(dimInputs, selectedUnit, isApproximate, requiredDimKeys);
    if (!parsed) {
      setDimError(
        isMarathi
          ? 'कृपया सर्व आवश्यक मापे प्रविष्ट करा / Please enter all required dimensions'
          : 'कृपया सभी आवश्यक माप भरें / Please enter all required dimensions'
      );
      return;
    }
    onValueConfirmed(parsed);
  };

  const handleTextSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = typedText.trim();
    if (!clean) return;

    setIsTranslating(true);
    setTextError(null);

    try {
      const result = await transcribeTextForField(clean, field, speakingLanguage);
      if (result.status === 'ok' && result.value) {
        setTranslationResult(result);
      } else {
        setTextError(
          isMarathi
            ? 'मजकूर समजला नाही, कृपया पुन्हा लिहा / Could not understand text'
            : 'टेक्स्ट समझ नहीं आया, कृपया फिर से लिखें / Could not understand text'
        );
      }
    } catch (err) {
      console.warn('[VoiceOrTypeInput] Text translation error:', err);
      setTextError(
        err instanceof Error
          ? err.message
          : isMarathi
          ? 'अनुवाद अयशस्वी झाला / Translation failed'
          : 'अनुवाद विफल रहा / Translation failed'
      );
    } finally {
      setIsTranslating(false);
    }
  };

  const handleConfirmTranslatedValue = () => {
    if (!translationResult) return;
    onValueConfirmed(translationResult.value);
    setTranslationResult(null);
  };

  return (
    <div
      className={`flex flex-col items-center gap-3 w-full ${className}`}
      data-testid={containerTestId}
    >
      {/* 1. Primary: Large Mic Button */}
      <div className="flex items-center justify-center">
        <VoiceInputButton
          field={field}
          speakingLanguage={speakingLanguage}
          onValueConfirmed={onValueConfirmed}
          disabled={disabled || isTranslating}
          maxDurationSeconds={maxDurationSeconds}
        />
      </div>

      {/* 2. Secondary: Typing Input per Field Type (Choice fields do not need typing) */}
      {field.type !== 'choice' && (
        <div className="w-full max-w-md space-y-2 pt-1">
          {/* Secondary Header Label */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 font-medium">
            <Keyboard className="w-3.5 h-3.5 text-amber-500" />
            <span>
              {isMarathi ? 'किंवा टाइप करा / Or type' : 'या लिखें / Or type'}
            </span>
          </div>

          {/* Type: NUMBER */}
          {field.type === 'number' && (
            <form onSubmit={handleNumberSubmit} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={typedNumber}
                  onChange={(e) => {
                    setTypedNumber(e.target.value);
                    if (numberError) setNumberError(null);
                  }}
                  placeholder={
                    placeholder ||
                    (isMarathi
                      ? 'संख्या लिहा (उदा. १२ किंवा 12) / Enter number'
                      : 'संख्या लिखें (उदा. १२ या 12) / Enter number')
                  }
                  className="flex-1 min-h-[48px] px-3.5 rounded-xl bg-[#120B08] border border-[#2A1E17] focus:border-[#EA580C] text-sm text-white placeholder-slate-500 outline-none transition-colors"
                  data-testid={inputTestId || 'voice-or-type-number-input'}
                  disabled={disabled}
                />
                <button
                  type="submit"
                  disabled={disabled || !typedNumber.trim()}
                  className="min-h-[48px] min-w-[48px] px-4 rounded-xl bg-[#EA580C] hover:bg-[#F97316] active:scale-95 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer"
                  data-testid={submitTestId || 'voice-or-type-number-submit'}
                  aria-label="Save number"
                >
                  <Check className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {isMarathi ? 'जतन करा' : 'सहेजें'}
                  </span>
                </button>
              </div>
              {numberError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {numberError}
                </p>
              )}
            </form>
          )}

          {/* Type: DIMENSIONS */}
          {field.type === 'dimensions' && (
            <form onSubmit={handleDimensionsSubmit} className="space-y-3 p-3 rounded-2xl bg-[#140D09] border border-[#2A1E17]">
              {/* Inputs for required dimension keys */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {requiredDimKeys.map((key) => {
                  const label = DIMENSION_LABELS[key] || { en: key, hi: key, mr: key };
                  return (
                    <div key={key} className="space-y-1">
                      <label className="text-[11px] text-slate-300 font-semibold block">
                        {label.en} / {isMarathi ? label.mr : label.hi}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={dimInputs[key] || ''}
                        onChange={(e) => {
                          setDimInputs((prev) => ({ ...prev, [key]: e.target.value }));
                          if (dimError) setDimError(null);
                        }}
                        placeholder="0"
                        className="w-full min-h-[44px] px-2.5 rounded-lg bg-[#1A120E] border border-[#3A2A20] focus:border-[#EA580C] text-sm text-white text-center outline-none"
                        data-testid={`dimension-input-${key}`}
                        disabled={disabled}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Unit Chips & Approx Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#2A1E17]">
                <div className="flex items-center gap-1.5" data-testid="dimension-unit-chips">
                  {(['cm', 'in', 'ft', 'm'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setSelectedUnit(unit)}
                      className={`min-h-[36px] px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedUnit === unit
                          ? 'bg-[#EA580C] text-white'
                          : 'bg-[#1A120E] text-slate-400 hover:text-white border border-[#2A1E17]'
                      }`}
                      data-testid={`dimension-unit-${unit}`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>

                {/* Approximate Toggle */}
                <label className="inline-flex items-center gap-1.5 text-xs text-amber-300/90 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isApproximate}
                    onChange={(e) => setIsApproximate(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-[#EA580C] focus:ring-0 cursor-pointer"
                    data-testid="dimension-approximate-toggle"
                  />
                  <span>
                    {isMarathi ? 'अंदाजे / Approx' : 'लगभग / Approx'}
                  </span>
                </label>
              </div>

              {dimError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {dimError}
                </p>
              )}

              <button
                type="submit"
                disabled={disabled}
                className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-[#EA580C] hover:bg-[#F97316] active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer"
                data-testid={submitTestId || 'dimension-submit-btn'}
              >
                <Check className="w-4 h-4" />
                <span>
                  {isMarathi ? 'माप जतन करा / Save Dimensions' : 'माप सहेजें / Save Dimensions'}
                </span>
              </button>
            </form>
          )}

          {/* Type: TEXT / LONG_TEXT */}
          {(field.type === 'text' || field.type === 'long_text') && (
            <form onSubmit={handleTextSubmit} className="space-y-1.5">
              <div className="flex items-start gap-2">
                {field.type === 'long_text' ? (
                  <textarea
                    lang={speakingLanguage}
                    rows={3}
                    value={typedText}
                    onChange={(e) => {
                      setTypedText(e.target.value);
                      if (textError) setTextError(null);
                    }}
                    placeholder={
                      placeholder ||
                      (isMarathi
                        ? 'येथे लिहा / Type here in your language'
                        : 'यहाँ लिखें / Type here in your language')
                    }
                    className="flex-1 min-h-[72px] p-3 rounded-xl bg-[#120B08] border border-[#2A1E17] focus:border-[#EA580C] text-sm text-white placeholder-slate-500 outline-none resize-none transition-colors"
                    data-testid={inputTestId || 'voice-or-type-text-input'}
                    disabled={disabled || isTranslating}
                  />
                ) : (
                  <input
                    lang={speakingLanguage}
                    type="text"
                    value={typedText}
                    onChange={(e) => {
                      setTypedText(e.target.value);
                      if (textError) setTextError(null);
                    }}
                    placeholder={
                      placeholder ||
                      (isMarathi
                        ? 'येथे लिहा / Type here in your language'
                        : 'यहाँ लिखें / Type here in your language')
                    }
                    className="flex-1 min-h-[48px] px-3.5 rounded-xl bg-[#120B08] border border-[#2A1E17] focus:border-[#EA580C] text-sm text-white placeholder-slate-500 outline-none transition-colors"
                    data-testid={inputTestId || 'voice-or-type-text-input'}
                    disabled={disabled || isTranslating}
                  />
                )}
                <button
                  type="submit"
                  disabled={disabled || isTranslating || !typedText.trim()}
                  className="min-h-[48px] min-w-[48px] px-3.5 rounded-xl bg-[#EA580C] hover:bg-[#F97316] active:scale-95 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer shrink-0"
                  data-testid={submitTestId || 'voice-or-type-text-submit'}
                  aria-label="Submit text"
                >
                  {isTranslating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="hidden sm:inline">
                        {isMarathi ? 'पाठवा' : 'भेजें'}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {textError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {textError}
                </p>
              )}
            </form>
          )}
        </div>
      )}

      {/* 3. Mandatory Confirmation Step ONLY for AI-Interpreted Typed Text */}
      {translationResult && (
        <div
          data-testid="voice-or-type-confirm-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-[#140D09] border-2 border-[#EA580C] rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#EA580C]/20 border border-[#EA580C]/40 mx-auto flex items-center justify-center text-[#EA580C]">
              <Sparkles className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                {isMarathi ? 'आम्ही हे समजलो / We Understood:' : 'हमने यह समझा / We Understood:'}
              </span>
              <div className="text-base font-bold text-white bg-[#1A120E] border border-[#2A1E17] rounded-2xl py-3 px-4 shadow-inner mt-1">
                {translationResult.value_display_en ||
                  translationResult.value_display_hi ||
                  (typeof translationResult.value === 'object' && translationResult.value !== null && 'en' in translationResult.value
                    ? (translationResult.value as { en: string }).en
                    : String(translationResult.value))}
              </div>
              <p className="text-xs text-stone-400 italic">
                "{translationResult.transcript_original || typedText}"
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                data-testid="voice-or-type-confirm-cancel"
                onClick={() => setTranslationResult(null)}
                className="min-h-[48px] py-2.5 px-3 rounded-2xl bg-stone-800 hover:bg-stone-700 active:scale-95 text-stone-200 font-semibold text-xs flex flex-col items-center justify-center gap-0.5 border border-stone-700 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-stone-400" />
                  <span>{isMarathi ? 'बदला' : 'बदलें'}</span>
                </div>
                <span className="text-[10px] text-stone-400 font-normal">Change</span>
              </button>

              <button
                type="button"
                data-testid="voice-or-type-confirm-yes"
                onClick={handleConfirmTranslatedValue}
                className="min-h-[48px] py-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#EA580C] to-[#C2410C] hover:from-[#F97316] hover:to-[#EA580C] active:scale-95 text-white font-semibold text-xs flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-[#EA580C]/25 transition-all border border-[#EA580C]/50 cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>{isMarathi ? 'होय, योग्य आहे' : 'हाँ, सही है'}</span>
                </div>
                <span className="text-[10px] text-orange-200 font-normal">Yes, correct</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
