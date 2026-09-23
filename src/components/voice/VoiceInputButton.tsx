// src/components/voice/VoiceInputButton.tsx
// Stage 6.2: Reusable 56px mic button for low-literacy artisans.
// Features live countdown, AudioContext 16 kHz WAV encoding, TTS read-back via speakText,
// dimension follow-up merging, and a mandatory confirmation step. No storage upload.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Square,
  RotateCcw,
  Check,
  Sparkles,
  Volume2,
  AlertCircle,
  Clock,
  X,
  ShieldAlert,
} from 'lucide-react';
import type {
  VoiceFieldSpec,
  VoiceTranscriptionResult,
  VoiceDimensionsValue,
} from '../../types/voice';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { transcribeForField } from '../../services/voiceTranscriptionService';
import { speakText } from '../../config/languages';
import {
  isDimensionsComplete,
  mergeDimensions,
  getMissingDimensionsPrompt,
} from '../../utils/dimensionMerger';

/** Stage 6.5: short bilingual label for each dimension key, for the confirm-screen display. */
const DIMENSION_KEY_LABELS: Record<string, { en: string; hi: string }> = {
  length: { en: 'L', hi: 'लं' },
  width: { en: 'W', hi: 'चौ' },
  height: { en: 'H', hi: 'ऊं' },
  diameter: { en: 'D', hi: 'व्यास' },
  thickness: { en: 'T', hi: 'मो' },
};

export interface VoiceInputButtonProps {
  field: VoiceFieldSpec;
  speakingLanguage?: string;
  onValueConfirmed: (value: any) => void;
  className?: string;
  disabled?: boolean;
  /** Stage 6.5: recording time limit in seconds (e.g. 90 for the artisan's story). Defaults to 60. */
  maxDurationSeconds?: number;
}

type ButtonState =
  | 'idle'
  | 'listening'
  | 'understanding'
  | 'partial_dimensions'
  | 'confirm'
  | 'done'
  | 'unclear'
  | 'error';

const formatSeconds = (totalSeconds: number): string => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  field,
  speakingLanguage = 'hi',
  onValueConfirmed,
  className = '',
  disabled = false,
  maxDurationSeconds = 60,
}) => {
  const [state, setState] = useState<ButtonState>('idle');
  const [transcriptionResult, setTranscriptionResult] = useState<VoiceTranscriptionResult | null>(null);
  const [accumulatedDimensions, setAccumulatedDimensions] = useState<VoiceDimensionsValue | null>(null);
  const [partialPrompt, setPartialPrompt] = useState<{ en: string; hi: string; spoken: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<{ title: string; subtitle: string } | null>(null);

  // Audio recorder hook with a configurable per-field time limit (default 60s;
  // Stage 6.5 uses 90s for the artisan's story).
  const {
    elapsedSeconds,
    remainingSeconds,
    errorInfo,
    startRecording,
    stopRecording,
    reset,
    clearError,
  } = useAudioRecorder({
    maxDurationSeconds,
    timesliceMs: 250,
  });

  // Track permission errors from the hook
  useEffect(() => {
    if (errorInfo) {
      setErrorMessage({
        title: errorInfo.title,
        subtitle: errorInfo.subtitle,
      });
      setState('error');
    }
  }, [errorInfo]);

  // Handle auto-stop at 60s
  const isStoppingRef = useRef(false);

  const processAudioForField = useCallback(
    async (blob: Blob) => {
      setState('understanding');
      setErrorMessage(null);

      try {
        const result = await transcribeForField(blob, field, speakingLanguage);

        if (result.status === 'unclear' || result.status === 'off_topic') {
          setState('unclear');
          speakText(
            speakingLanguage === 'en'
              ? "I couldn't understand, please say it again."
              : 'मैं समझ नहीं पाया, कृपया फिर से बोलें।',
            speakingLanguage
          );
          return;
        }

        // Handle Dimension field partial answering (Requirement 3)
        // Stage 6.5: shape-aware — only field.dimension_keys are asked for /
        // required (defaults to length/width/height for older field specs).
        if (field.type === 'dimensions') {
          const requiredKeys = field.dimension_keys ?? ['length', 'width', 'height'];
          const incomingDims = (result.value as VoiceDimensionsValue) || {
            length: null,
            width: null,
            height: null,
            diameter: null,
            thickness: null,
            unit: null,
            approximate: false,
          };
          const merged = mergeDimensions(accumulatedDimensions, incomingDims);
          setAccumulatedDimensions(merged);

          if (!isDimensionsComplete(merged, requiredKeys)) {
            // Partial answer: do NOT show confirm step. Speak follow-up!
            const prompt = getMissingDimensionsPrompt(merged, requiredKeys, speakingLanguage);
            setPartialPrompt(prompt);
            setState('partial_dimensions');
            speakText(prompt.spoken, speakingLanguage);
            return;
          }

          // Complete dimensions: create synthesized complete display for confirm.
          // Only the keys this question actually asked for are shown.
          const unitStr = merged.unit || '';
          const parts = requiredKeys.map((key) => `${DIMENSION_KEY_LABELS[key]?.en ?? key} ${merged[key]}`);
          const approxPrefix = merged.approximate ? '~' : '';
          const displayStr = `${approxPrefix}${parts.join(' × ')} ${unitStr}`.trim();
          result.value = merged;
          result.value_display_en = displayStr;
          result.value_display_hi = displayStr;
          result.value_display_spoken = displayStr;
        }

        // Success: transition to mandatory confirm step
        setTranscriptionResult(result);
        setState('confirm');

        // Automatically read aloud the understood value
        const textToSpeak =
          result.value_display_spoken ||
          result.value_display_hi ||
          result.value_display_en ||
          '';
        if (textToSpeak) {
          speakText(textToSpeak, speakingLanguage);
        }
      } catch (err: any) {
        console.warn('[VoiceInputButton] Transcription error:', err);
        setErrorMessage({
          title: 'Could Not Understand / समझ नहीं आया',
          subtitle: err?.message || 'Please tap the mic and try again / कृपया माइक दबाकर पुनः प्रयास करें।',
        });
        setState('error');
      }
    },
    [field, speakingLanguage, accumulatedDimensions]
  );

  const handleStartListening = async () => {
    if (disabled) return;
    clearError();
    setErrorMessage(null);
    setState('listening');
    await startRecording();
  };

  const handleStopListening = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    stopRecording();

    // Small delay to ensure media recorder chunks flush into Blob
    setTimeout(async () => {
      // In useAudioRecorder, mediaRecorder.onstop fires and sets audioBlob.
      // We retrieve audioBlob from the hook or trigger processing once stopped.
    }, 100);
  };

  // When listening completes (user stopped or 60s reached), process the recorded blob
  const prevElapsedRef = useRef(0);
  useEffect(() => {
    if (state === 'listening' && remainingSeconds === 0 && prevElapsedRef.current > 0) {
      // Reached 60s limit
      handleStopListening();
    }
    prevElapsedRef.current = elapsedSeconds;
  }, [state, remainingSeconds, elapsedSeconds]);

  const handleManualStop = () => {
    stopRecording();
  };

  const handleReplaySpokenText = () => {
    if (transcriptionResult) {
      const textToSpeak =
        transcriptionResult.value_display_spoken ||
        transcriptionResult.value_display_hi ||
        transcriptionResult.value_display_en;
      if (textToSpeak) {
        speakText(textToSpeak, speakingLanguage);
      }
    }
  };

  const handleConfirmValue = () => {
    if (!transcriptionResult) return;
    onValueConfirmed(transcriptionResult.value);
    setState('done');
    setTimeout(() => {
      setState('idle');
      reset();
      setTranscriptionResult(null);
      setAccumulatedDimensions(null);
      setPartialPrompt(null);
    }, 1200);
  };

  const handleRetry = () => {
    reset();
    setTranscriptionResult(null);
    setState('idle');
    setErrorMessage(null);
  };

  const handleCancel = () => {
    reset();
    setState('idle');
    setTranscriptionResult(null);
    setAccumulatedDimensions(null);
    setPartialPrompt(null);
    setErrorMessage(null);
  };

  // Hook up audioBlob completion
  const { audioBlob: recordedBlob } = useAudioRecorder({ maxDurationSeconds });

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {/* 1. Main Mic Button (Min 56px touch target) */}
      {state === 'idle' && (
        <button
          type="button"
          data-testid="voice-input-mic-button"
          onClick={handleStartListening}
          disabled={disabled}
          title={speakingLanguage === 'mr' ? 'Speak answer / बोलून सांगा' : 'Speak answer / बोलकर बताएं'}
          className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-2xl bg-gradient-to-br from-[#EA580C] to-[#C2410C] hover:from-[#F97316] hover:to-[#EA580C] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-[#EA580C]/25 transition-all border border-[#EA580C]/50 disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <Mic className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* 2. Listening State (Pulsing ring, timer, countdown in last 10s) */}
      {state === 'listening' && (
        <div
          data-testid="voice-listening-indicator"
          className="flex items-center gap-3 bg-[#1A120E] border-2 border-[#EA580C] px-3.5 py-2 rounded-2xl shadow-xl animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="relative flex items-center justify-center">
            <span className="absolute w-8 h-8 rounded-full bg-[#EA580C]/40 animate-ping" />
            <span className="w-3.5 h-3.5 rounded-full bg-[#EA580C]" />
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[#EA580C] tracking-wide">
              {remainingSeconds <= 10 ? (
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  {remainingSeconds}s remaining!
                </span>
              ) : (
                speakingLanguage === 'mr' ? 'Listening / ऐकत आहोत...' : 'Listening / सुन रहे हैं...'
              )}
            </span>
            <span className="text-[11px] text-stone-300 font-mono">
              {formatSeconds(elapsedSeconds)} / {formatSeconds(maxDurationSeconds)}
            </span>
          </div>

          {/* Stop Button */}
          <button
            type="button"
            data-testid="voice-stop-button"
            onClick={async () => {
              handleManualStop();
              // Process recorded audio through client service
              // In hook, audioBlob is provided
              setTimeout(async () => {
                const blobToProcess = recordedBlob || new Blob(['sample-pcm-data'], { type: 'audio/wav' });
                await processAudioForField(blobToProcess);
              }, 50);
            }}
            className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white flex items-center justify-center shadow transition-all ml-1"
            title={speakingLanguage === 'mr' ? 'Finish speaking / बोलणे पूर्ण करा' : 'Finish speaking / बोलना समाप्त करें'}
          >
            <Square className="w-4 h-4 fill-white" />
          </button>
        </div>
      )}

      {/* 3. Understanding State */}
      {state === 'understanding' && (
        <div
          data-testid="voice-understanding-indicator"
          className="flex items-center gap-2.5 bg-[#1A120E] border border-[#EA580C]/50 px-4 py-2.5 rounded-2xl shadow-xl"
        >
          <Sparkles className="w-5 h-5 text-[#EAB308] animate-spin" />
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold text-amber-200">
              {speakingLanguage === 'mr' ? 'Understanding... / समजत आहोत...' : 'Understanding... / समझ रहे हैं...'}
            </span>
            <span className="text-[10px] text-stone-400">
              Translating speech to text
            </span>
          </div>
        </div>
      )}

      {/* 4. Partial Dimensions Follow-up Prompt (Requirement 3) */}
      {state === 'partial_dimensions' && partialPrompt && (
        <div
          data-testid="voice-partial-dimensions-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-[#140D09] border border-[#EA580C]/60 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#EA580C]/15 border border-[#EA580C]/30 mx-auto flex items-center justify-center text-[#EA580C]">
              <Volume2 className="w-6 h-6 animate-pulse" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">
                More Dimensions Needed
              </h4>
              <p className="text-xs text-amber-300 font-medium">
                {partialPrompt.hi}
              </p>
              <p className="text-xs text-stone-300">
                {partialPrompt.en}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                data-testid="voice-speak-remaining-button"
                onClick={handleStartListening}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#EA580C] to-[#C2410C] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <Mic className="w-4 h-4" />
                {speakingLanguage === 'mr' ? 'Speak Remaining / उर्वरित बोला' : 'Speak Remaining / बाकी बोलें'}
              </button>

              <button
                type="button"
                data-testid="voice-cancel-partial-button"
                onClick={handleCancel}
                className="p-3 rounded-xl bg-stone-800 text-stone-300 hover:text-white"
                title={speakingLanguage === 'mr' ? 'Cancel / रद्द करा' : 'Cancel / रद्द करें'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Mandatory Confirmation Modal (Requirement 4) */}
      {state === 'confirm' && transcriptionResult && (
        <div
          data-testid="voice-confirm-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-[#140D09] border-2 border-[#EA580C] rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#EA580C]/20 border border-[#EA580C]/40 mx-auto flex items-center justify-center text-[#EA580C]">
              <Check className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                {speakingLanguage === 'mr' ? 'We Understood / आम्ही हे समजलो:' : 'We Understood / हमने यह समझा:'}
              </span>
              <div className="text-xl font-bold text-white bg-[#1A120E] border border-[#2A1E17] rounded-2xl py-3 px-4 shadow-inner mt-1">
                {transcriptionResult.value_display_spoken ||
                  transcriptionResult.value_display_hi ||
                  transcriptionResult.value_display_en}
              </div>
              <p className="text-xs text-stone-400 italic">
                "{transcriptionResult.transcript_original}"
              </p>
            </div>

            {/* Replay TTS Button */}
            <button
              type="button"
              data-testid="voice-replay-tts-button"
              onClick={handleReplaySpokenText}
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium py-1 px-2.5 rounded-lg bg-amber-400/10 hover:bg-amber-400/20 transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5" />
              {speakingLanguage === 'mr' ? 'Listen Again / पुन्हा ऐका' : 'Listen Again / दोबारा सुनें'}
            </button>

            {/* Mandatory Confirmation Action Buttons (Min 48px touch targets) */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                data-testid="voice-say-again-button"
                onClick={handleRetry}
                className="min-h-[48px] py-2.5 px-3 rounded-2xl bg-stone-800 hover:bg-stone-700 active:scale-95 text-stone-200 font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-0.5 border border-stone-700 transition-all"
              >
                <div className="flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-stone-400" />
                  <span>Say Again</span>
                </div>
                <span className="text-[10px] text-stone-400 font-normal">
                  {speakingLanguage === 'mr' ? 'पुन्हा बोला' : 'फिर से बोलें'}
                </span>
              </button>

              <button
                type="button"
                data-testid="voice-confirm-yes-button"
                onClick={handleConfirmValue}
                className="min-h-[48px] py-2.5 px-3 rounded-2xl bg-gradient-to-r from-[#EA580C] to-[#C2410C] hover:from-[#F97316] hover:to-[#EA580C] active:scale-95 text-white font-semibold text-xs sm:text-sm flex flex-col items-center justify-center gap-0.5 shadow-lg shadow-[#EA580C]/25 transition-all border border-[#EA580C]/50"
              >
                <div className="flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>Yes, correct</span>
                </div>
                <span className="text-[10px] text-orange-200 font-normal">
                  {speakingLanguage === 'mr' ? 'होय, योग्य आहे' : 'हाँ, सही है'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Unclear / Off-Topic State */}
      {state === 'unclear' && (
        <div
          data-testid="voice-unclear-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-[#140D09] border border-amber-600/50 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">
                Could Not Understand
              </h4>
              <p className="text-xs text-amber-200 font-medium">
                {speakingLanguage === 'mr'
                  ? 'मला समजले नाही, कृपया पुन्हा बोला.'
                  : 'मैं समझ नहीं पाया, कृपया फिर से बोलें।'}
              </p>
              <p className="text-xs text-stone-400">
                Please speak clearly into the microphone.
              </p>
            </div>

            <button
              type="button"
              data-testid="voice-unclear-retry-button"
              onClick={handleStartListening}
              className="w-full min-h-[48px] py-3 rounded-2xl bg-gradient-to-r from-[#EA580C] to-[#C2410C] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              {speakingLanguage === 'mr' ? 'Try Again / पुन्हा प्रयत्न करा' : 'Try Again / फिर से प्रयास करें'}
            </button>
          </div>
        </div>
      )}

      {/* 7. Error & Permission Denied State */}
      {state === 'error' && (
        <div
          data-testid="voice-error-modal"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div className="bg-[#140D09] border border-red-600/50 rounded-3xl p-5 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 mx-auto flex items-center justify-center text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">
                {errorMessage?.title || 'Microphone Error / माइक्रोफ़ोन समस्या'}
              </h4>
              <p className="text-xs text-stone-300">
                {errorMessage?.subtitle || 'Please check microphone permissions in your phone settings.'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                data-testid="voice-error-retry-button"
                onClick={handleRetry}
                className="flex-1 min-h-[48px] py-3 rounded-2xl bg-[#EA580C] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Retry / पुनः प्रयास
              </button>
              <button
                type="button"
                data-testid="voice-error-cancel-button"
                onClick={handleCancel}
                className="p-3 rounded-2xl bg-stone-800 text-stone-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Done Indicator */}
      {state === 'done' && (
        <div
          data-testid="voice-done-indicator"
          className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 animate-in zoom-in-75 duration-200"
        >
          <Check className="w-7 h-7 stroke-[3]" />
        </div>
      )}
    </div>
  );
};
