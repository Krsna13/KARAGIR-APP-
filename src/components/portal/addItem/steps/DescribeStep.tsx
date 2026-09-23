import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  X,
  Volume2,
  Sparkles,
  Pencil,
  PackageCheck,
  CalendarClock,
  Ruler,
  Mic,
  BookOpen,
  ShieldCheck,
  RefreshCcw,
} from 'lucide-react';
import { VoiceInputButton } from '../../../voice/VoiceInputButton';
import { speakText } from '../../../../config/languages';
import { saveDraft, debouncedSaveDraft } from '../../../../services/draftService';
import { getTechniqueOptions, techniqueVoiceChoices } from '../../../../config/techniqueOptions';
import {
  AVAILABILITY_OPTIONS,
  STYLE_OPTIONS,
  YES_NO_OPTIONS,
  asDescribeLang,
  aiFactsFrom,
  availabilityQuestionText,
  careInstructionsQuestionText,
  customizationQuestionText,
  describeAnswersFromDraft,
  dimensionsQuestionText,
  hasAiDescribeFacts,
  isDescribeStepComplete,
  laborDaysQuestionText,
  leadTimeQuestionText,
  nextRequiredStep,
  quantityQuestionText,
  storyEncouragement,
  storyQuestionText,
  techniqueQuestionText,
  thicknessQuestionText,
  voiceValueToRawDimensions,
  type DescribeAnswers,
  type RequiredStep,
} from './describeLogic';
import { dimensionKeysForShape, requiredDimensionKeysForShape } from '../../../../utils/dimensionMerger';
import type { VoiceFieldSpec, VoiceTextValue } from '../../../../types/voice';
import type { ProductRecord, ProductStyle } from '../../../../types/product';

export interface DescribeStepProps {
  productId: string;
  draft: ProductRecord;
  speakingLanguage: string | null;
  onDraftPatch: (patch: Partial<ProductRecord>) => void;
}

type DraftUpdate = Parameters<typeof saveDraft>[1];
const toUpdate = (patch: Partial<ProductRecord>) => patch as unknown as DraftUpdate;

const voiceText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const v = value as { en?: unknown; original?: unknown };
    if (typeof v.en === 'string' && v.en.trim()) return v.en.trim();
    if (typeof v.original === 'string') return v.original.trim();
  }
  return '';
};

type Phase = 'choice' | 'facts' | RequiredStep | 'customization' | 'story' | 'care' | 'summary';

const STORY_MAX_SECONDS = 90;

/**
 * Stage 6.5: Add Item wizard step 2 — the facts the listing (6.6) and the
 * pricing model (6.7-6.8) need. Collects facts only; does not write the SEO
 * description.
 */
export const DescribeStep: React.FC<DescribeStepProps> = ({ productId, draft, speakingLanguage, onDraftPatch }) => {
  const lang = asDescribeLang(speakingLanguage);
  const shape = draft.shape_profile ?? null;
  const category = draft.category ?? null;
  const ai = draft.ai_identification ?? null;

  const [phase, setPhase] = useState<Phase>('choice');
  const [answers, setAnswers] = useState<DescribeAnswers>(() => describeAnswersFromDraft(draft));
  const [visibleFeatures, setVisibleFeatures] = useState<string[]>(draft.visible_features ?? []);
  const [colors, setColors] = useState<string[]>(draft.colors ?? []);
  const [style, setStyle] = useState<ProductStyle | null>(draft.style ?? null);
  const [suggestedUse, setSuggestedUse] = useState<string[]>(draft.suggested_use ?? []);
  const [accepts, setAccepts] = useState<boolean | null>(draft.accepts_customization ?? null);

  const mountedRef = useRef(true);
  const stateRef = useRef({ answers, visibleFeatures, colors, style, suggestedUse, accepts });
  stateRef.current = { answers, visibleFeatures, colors, style, suggestedUse, accepts };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      debouncedSaveDraft.flush(productId).catch((err) => console.error('[DescribeStep] Flush failed:', err));
    };
  }, [productId]);

  // On entering: resume mid-flow if a mode was already chosen; otherwise ask.
  useEffect(() => {
    if (draft.description_mode) {
      setPhase(nextRequiredStep(describeAnswersFromDraft(draft), shape));
    } else {
      setPhase('choice');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(
    (patch: Partial<ProductRecord>) => {
      onDraftPatch(patch);
      debouncedSaveDraft(productId, toUpdate(patch)).catch((err) => console.error('[DescribeStep] Save failed:', err));
    },
    [onDraftPatch, productId]
  );

  const persistNow = useCallback(
    (patch: Partial<ProductRecord>) => {
      onDraftPatch(patch);
      saveDraft(productId, toUpdate(patch)).catch((err) => console.error('[DescribeStep] Save failed:', err));
    },
    [onDraftPatch, productId]
  );

  /**
   * Explicit forward order for the required cards (used once each card is
   * answered/skipped in THIS session). nextRequiredStep() is only used to
   * position the step on mount when resuming a draft: it cannot tell "the
   * optional thickness question was already shown and skipped" from "never
   * shown", so relying on it after every answer would re-offer thickness
   * forever on a flat shape. Explicit transitions avoid that ambiguity.
   */
  const advanceFrom = (step: RequiredStep): Phase => {
    switch (step) {
      case 'dimensions':
        return shape === 'flat' ? 'dimensions_thickness' : 'technique';
      case 'dimensions_thickness':
        return 'technique';
      case 'technique':
        return 'labor_days';
      case 'labor_days':
        return 'availability';
      case 'availability':
        return 'availability_followup';
      default:
        return 'summary';
    }
  };

  // ---- Opening choice -------------------------------------------------
  const choiceSpoken = {
    hi: 'क्या AI आपकी मदद करे, या आप खुद बताना चाहेंगे?',
    mr: 'AI ने मदत करावी, की तुम्ही स्वतः सांगाल?',
    en: 'Should AI help, or would you like to describe it yourself?',
  }[lang];

  useEffect(() => {
    if (phase === 'choice') speakText(choiceSpoken, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const chooseMode = (mode: 'ai_assisted' | 'manual') => {
    persistNow({ description_mode: mode });
    if (mode === 'ai_assisted' && hasAiDescribeFacts(ai)) {
      const facts = aiFactsFrom(ai);
      setVisibleFeatures(facts.visible_features);
      setColors(facts.colors);
      setStyle(facts.style);
      setSuggestedUse(facts.suggested_use);
    }
    setPhase('facts');
  };

  // ---- Facts: visible_features / colors / style / suggested_use -------
  const saveFacts = () => {
    const s = stateRef.current;
    persist({
      visible_features: s.visibleFeatures,
      colors: s.colors,
      style: s.style,
      suggested_use: s.suggestedUse,
    });
    setPhase('dimensions');
  };

  // ---- Required: dimensions -------------------------------------------
  const dimensionField: VoiceFieldSpec | null = shape
    ? {
        key: 'dimensions',
        type: 'dimensions',
        question_en: dimensionsQuestionText(shape, lang).en,
        dimension_keys: requiredDimensionKeysForShape(shape),
      }
    : null;

  const saveDimensions = (value: unknown) => {
    if (!shape) return;
    const raw = voiceValueToRawDimensions(value as any, shape);
    if (!raw) return;
    const nextAnswers = { ...stateRef.current.answers, dimensions: raw };
    setAnswers(nextAnswers);
    persist({ dimensions: raw as unknown as ProductRecord['dimensions'] });
    setPhase(advanceFrom('dimensions'));
  };

  const thicknessField: VoiceFieldSpec | null =
    shape === 'flat' ? { key: 'thickness', type: 'dimensions', question_en: thicknessQuestionText(lang).en, dimension_keys: ['thickness'] } : null;

  const saveThickness = (value: unknown) => {
    if (!shape) return;
    const v = value as { thickness: number | null; unit: string | null };
    const current = stateRef.current.answers.dimensions;
    if (!current || v.thickness === null) {
      skipThickness();
      return;
    }
    const raw = { ...current, values: { ...current.values, thickness: v.thickness } };
    const nextAnswers = { ...stateRef.current.answers, dimensions: raw };
    setAnswers(nextAnswers);
    persist({ dimensions: raw as unknown as ProductRecord['dimensions'] });
    setPhase(advanceFrom('dimensions_thickness'));
  };

  const skipThickness = () => setPhase(advanceFrom('dimensions_thickness'));

  // ---- Required: technique ----------------------------------------------
  const techniqueOptions = useMemo(() => getTechniqueOptions(category), [category]);
  const techniqueField: VoiceFieldSpec = {
    key: 'technique',
    type: 'choice',
    question_en: techniqueQuestionText(lang).en,
    choices: techniqueVoiceChoices(category),
  };

  const saveTechnique = (technique: string) => {
    const nextAnswers = { ...stateRef.current.answers, technique };
    setAnswers(nextAnswers);
    persist({ technique });
    setPhase(advanceFrom('technique'));
  };

  // ---- Required: labor_days ---------------------------------------------
  const laborDaysField: VoiceFieldSpec = {
    key: 'labor_days',
    type: 'number',
    question_en: laborDaysQuestionText(lang).en,
    unit_hint: 'days',
  };

  const saveLaborDays = (value: unknown) => {
    const days = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(days) || days < 0) return;
    const nextAnswers = { ...stateRef.current.answers, labor_days: days };
    setAnswers(nextAnswers);
    persist({ labor_days: days });
    setPhase(advanceFrom('labor_days'));
  };

  // ---- Required: availability + follow-up -------------------------------
  const saveAvailability = (availability: 'ready' | 'made_to_order') => {
    const nextAnswers: DescribeAnswers = { ...stateRef.current.answers, availability };
    setAnswers(nextAnswers);
    persist({ availability });
    setPhase(advanceFrom('availability'));
  };

  const quantityField: VoiceFieldSpec = { key: 'quantity_available', type: 'number', question_en: quantityQuestionText(lang).en };
  const leadTimeField: VoiceFieldSpec = { key: 'lead_time_days', type: 'number', question_en: leadTimeQuestionText(lang).en, unit_hint: 'days' };

  const saveFollowup = (value: unknown) => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    const key = stateRef.current.answers.availability === 'ready' ? 'quantity_available' : 'lead_time_days';
    const nextAnswers = { ...stateRef.current.answers, [key]: n } as DescribeAnswers;
    setAnswers(nextAnswers);
    persist({ [key]: n });
    setPhase(advanceFrom('availability_followup'));
  };

  // ---- Optional: customization / story / care ---------------------------
  const saveCustomization = (yes: boolean) => {
    setAccepts(yes);
    persist({ accepts_customization: yes });
    setPhase('story');
  };
  const skipCustomization = () => setPhase('story');

  const storyField: VoiceFieldSpec = { key: 'story', type: 'long_text', question_en: storyQuestionText(lang).en };
  const saveStory = (value: unknown) => {
    const v = value as VoiceTextValue;
    persist({ story_original: v.original, story_en: v.en });
    setPhase('care');
  };
  const skipStory = () => setPhase('care');

  const careField: VoiceFieldSpec = { key: 'care_instructions', type: 'text', question_en: careInstructionsQuestionText(lang).en };
  const saveCare = (value: unknown) => {
    persist({ care_instructions: voiceText(value) });
    setPhase('summary');
  };
  const skipCare = () => setPhase('summary');

  // ---- Speak the active card's question once ----------------------------
  const spokenForPhase: string | null = (() => {
    switch (phase) {
      case 'dimensions':
        return shape ? dimensionsQuestionText(shape, lang).spoken : null;
      case 'dimensions_thickness':
        return thicknessQuestionText(lang).spoken;
      case 'technique':
        return techniqueQuestionText(lang).spoken;
      case 'labor_days':
        return laborDaysQuestionText(lang).spoken;
      case 'availability':
        return availabilityQuestionText(lang).spoken;
      case 'availability_followup':
        return answers.availability === 'ready' ? quantityQuestionText(lang).spoken : leadTimeQuestionText(lang).spoken;
      case 'customization':
        return customizationQuestionText(lang).spoken;
      case 'story':
        return `${storyQuestionText(lang).spoken} ${storyEncouragement(lang)}`;
      case 'care':
        return careInstructionsQuestionText(lang).spoken;
      default:
        return null;
    }
  })();

  useEffect(() => {
    if (spokenForPhase) speakText(spokenForPhase, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Re-speak on demand
  const speakAgain = () => spokenForPhase && speakText(spokenForPhase, lang);

  // Once every required answer is present, persist completion snapshot (idempotent).
  useEffect(() => {
    if (phase === 'summary' && isDescribeStepComplete(stateRef.current.answers, shape)) {
      onDraftPatch({}); // no-op patch keeps parent in sync if needed
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // -------------------------------------------------------------- render

  const skipLabel = { hi: 'छोड़ें', mr: 'वगळा', en: 'Skip' }[lang];
  const questionHeader = (title: { en: string; spoken: string }, extra?: React.ReactNode) => (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#120B08] border border-[#EA580C]/40">
      <div className="flex-1 space-y-1" data-testid="describe-question-text">
        <p className="text-base font-extrabold text-white leading-snug">{title.en}</p>
        {title.spoken !== title.en && <p className="text-sm text-amber-300 leading-snug">{title.spoken}</p>}
        {extra}
      </div>
      <button
        type="button"
        onClick={speakAgain}
        className="w-12 h-12 rounded-xl bg-[#1A120E] border border-[#2A1E17] text-[#EA580C] flex items-center justify-center shrink-0"
        aria-label="Listen again"
        data-testid="describe-speak-again"
      >
        <Volume2 className="w-5 h-5" />
      </button>
    </div>
  );

  const skipButton = (onSkip: () => void, testId: string) => (
    <button
      type="button"
      onClick={onSkip}
      className="w-full min-h-[48px] rounded-2xl bg-[#120B08] border border-[#2A1E17] text-slate-300 text-xs font-bold"
      data-testid={testId}
    >
      {skipLabel} / Skip
    </button>
  );

  if (phase === 'choice') {
    return (
      <div key={phase} className="space-y-4" data-testid="describe-choice">
        {questionHeader({ en: 'How would you like to describe this item?', spoken: choiceSpoken })}
        <button
          type="button"
          onClick={() => chooseMode('ai_assisted')}
          className="w-full min-h-[64px] rounded-2xl bg-gradient-to-r from-[#EA580C] to-amber-600 text-white font-extrabold flex items-center justify-center gap-2 active:scale-95"
          data-testid="choose-ai-assisted"
        >
          <Sparkles className="w-5 h-5" /> Let AI help / AI से मदद लें
        </button>
        <button
          type="button"
          onClick={() => chooseMode('manual')}
          className="w-full min-h-[52px] rounded-2xl bg-[#120B08] border border-[#2A1E17] text-slate-200 font-bold active:scale-95"
          data-testid="choose-manual"
        >
          I'll describe it myself / मैं खुद बताऊंगा
        </button>
      </div>
    );
  }

  if (phase === 'facts') {
    const usingAi = draft.description_mode === 'ai_assisted' && hasAiDescribeFacts(ai);
    const removeChip = (list: string[], setList: (v: string[]) => void, idx: number) =>
      setList(list.filter((_, i) => i !== idx));

    return (
      <div key={phase} className="space-y-4" data-testid="describe-facts">
        {!usingAi && (
          <p className="text-xs text-amber-300" data-testid="facts-manual-notice">
            {draft.description_mode === 'ai_assisted'
              ? 'AI could not tell these from your photos; add them yourself.'
              : 'Tell us a bit more (optional).'}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-300">Features / खासियतें</p>
          <div className="flex flex-wrap gap-2" data-testid="features-chips">
            {visibleFeatures.map((f, i) => (
              <span key={`${f}-${i}`} className="inline-flex items-center gap-1 pl-3 rounded-full bg-[#1A120E] border border-[#3A2A20] text-xs text-white" data-testid={`feature-chip-${i}`}>
                {f}
                <button type="button" onClick={() => removeChip(visibleFeatures, setVisibleFeatures, i)} className="w-10 h-10 -my-3 flex items-center justify-center text-slate-400" aria-label={`Remove ${f}`} data-testid={`remove-feature-${i}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div data-testid="add-feature-voice" className="inline-flex">
            <VoiceInputButton
              field={{ key: 'feature', type: 'text', question_en: 'What else is special about it?' }}
              speakingLanguage={lang}
              onValueConfirmed={(v) => {
                const t = voiceText(v);
                if (t && !visibleFeatures.some((f) => f.toLowerCase() === t.toLowerCase())) setVisibleFeatures([...visibleFeatures, t]);
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-300">Colors / रंग</p>
          <div className="flex flex-wrap gap-2" data-testid="colors-chips">
            {colors.map((c, i) => (
              <span key={`${c}-${i}`} className="inline-flex items-center gap-1 pl-3 rounded-full bg-[#1A120E] border border-[#3A2A20] text-xs text-white" data-testid={`color-chip-${i}`}>
                {c}
                <button type="button" onClick={() => removeChip(colors, setColors, i)} className="w-10 h-10 -my-3 flex items-center justify-center text-slate-400" aria-label={`Remove ${c}`} data-testid={`remove-color-${i}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div data-testid="add-color-voice" className="inline-flex">
            <VoiceInputButton
              field={{ key: 'color', type: 'text', question_en: 'What color is it?' }}
              speakingLanguage={lang}
              onValueConfirmed={(v) => {
                const t = voiceText(v);
                if (t && !colors.some((c) => c.toLowerCase() === t.toLowerCase())) setColors([...colors, t]);
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-300">Style / शैली</p>
          <div className="grid grid-cols-4 gap-2">
            {STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStyle(opt.id === style ? null : opt.id)}
                aria-pressed={style === opt.id}
                data-testid={`style-tile-${opt.id}`}
                data-selected={style === opt.id}
                className={`min-h-[56px] rounded-xl border text-[10px] font-bold flex items-center justify-center text-center px-1 ${style === opt.id ? 'bg-[#EA580C]/20 border-[#EA580C] text-white' : 'bg-[#120B08] border-[#2A1E17] text-slate-300'}`}
              >
                {opt.en}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-300">Suggested use / कहाँ इस्तेमाल हो</p>
          <div className="flex flex-wrap gap-2" data-testid="uses-chips">
            {suggestedUse.map((u, i) => (
              <span key={`${u}-${i}`} className="inline-flex items-center gap-1 pl-3 rounded-full bg-[#1A120E] border border-[#3A2A20] text-xs text-white" data-testid={`use-chip-${i}`}>
                {u}
                <button type="button" onClick={() => removeChip(suggestedUse, setSuggestedUse, i)} className="w-10 h-10 -my-3 flex items-center justify-center text-slate-400" aria-label={`Remove ${u}`} data-testid={`remove-use-${i}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div data-testid="add-use-voice" className="inline-flex">
            <VoiceInputButton
              field={{ key: 'use', type: 'text', question_en: 'Where would someone use it?' }}
              speakingLanguage={lang}
              onValueConfirmed={(v) => {
                const t = voiceText(v);
                if (t && !suggestedUse.some((u) => u.toLowerCase() === t.toLowerCase())) setSuggestedUse([...suggestedUse, t]);
              }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={saveFacts}
          className="w-full min-h-[52px] rounded-2xl bg-[#EA580C] text-white font-extrabold flex items-center justify-center gap-2 active:scale-95"
          data-testid="facts-continue"
        >
          <Check className="w-5 h-5" /> Continue / आगे बढ़ें
        </button>
      </div>
    );
  }

  if (phase === 'dimensions' && dimensionField) {
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-dimensions">
        {questionHeader(dimensionsQuestionText(shape!, lang), <Ruler className="w-3.5 h-3.5 text-slate-500" />)}
        <div className="flex items-center gap-3">
          <VoiceInputButton field={dimensionField} speakingLanguage={lang} onValueConfirmed={saveDimensions} />
          <span className="text-xs text-slate-300">Tap and say it / दबाकर बोलिए</span>
        </div>
      </div>
    );
  }

  if (phase === 'dimensions_thickness' && thicknessField) {
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-thickness">
        {questionHeader(thicknessQuestionText(lang))}
        <div className="flex items-center gap-3">
          <VoiceInputButton field={thicknessField} speakingLanguage={lang} onValueConfirmed={saveThickness} />
          <span className="text-xs text-slate-300">Tap and say it / दबाकर बोलिए</span>
        </div>
        {skipButton(skipThickness, 'skip-thickness')}
      </div>
    );
  }

  if (phase === 'technique') {
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-technique">
        {questionHeader(techniqueQuestionText(lang))}
        <div className="grid grid-cols-2 gap-2">
          {techniqueOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => saveTechnique(opt.id)}
                data-testid={`technique-tile-${opt.id}`}
                className="min-h-[72px] p-2 rounded-2xl border border-[#2A1E17] bg-[#120B08] flex flex-col items-center justify-center gap-1 active:scale-95"
              >
                <Icon className="w-6 h-6 text-[#EA580C]" />
                <span className="text-[11px] font-bold text-white text-center leading-tight">{opt.en}</span>
                <span className="text-[10px] text-slate-400 text-center leading-tight">{lang === 'mr' ? opt.mr : opt.hi}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <VoiceInputButton field={techniqueField} speakingLanguage={lang} onValueConfirmed={(v) => saveTechnique(String(v))} />
          <span className="text-xs text-slate-300">Or say it / या बोलिए</span>
        </div>
      </div>
    );
  }

  if (phase === 'labor_days') {
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-labor_days">
        {questionHeader(laborDaysQuestionText(lang))}
        <div className="flex items-center gap-3">
          <VoiceInputButton field={laborDaysField} speakingLanguage={lang} onValueConfirmed={saveLaborDays} />
          <span className="text-xs text-slate-300">Tap and say it / दबाकर बोलिए</span>
        </div>
      </div>
    );
  }

  if (phase === 'availability') {
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-availability">
        {questionHeader(availabilityQuestionText(lang))}
        <div className="grid grid-cols-2 gap-3">
          {AVAILABILITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => saveAvailability(opt.id)}
              data-testid={`availability-tile-${opt.id}`}
              className="min-h-[72px] rounded-2xl border border-[#2A1E17] bg-[#120B08] flex flex-col items-center justify-center gap-1 active:scale-95"
            >
              {opt.id === 'ready' ? <PackageCheck className="w-6 h-6 text-emerald-400" /> : <CalendarClock className="w-6 h-6 text-amber-400" />}
              <span className="text-xs font-bold text-white text-center">{opt.en}</span>
              <span className="text-[10px] text-slate-400 text-center">{lang === 'mr' ? opt.mr : opt.hi}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'availability_followup') {
    const isReady = answers.availability === 'ready';
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-availability_followup">
        {questionHeader(isReady ? quantityQuestionText(lang) : leadTimeQuestionText(lang))}
        <div className="flex items-center gap-3">
          <VoiceInputButton field={isReady ? quantityField : leadTimeField} speakingLanguage={lang} onValueConfirmed={saveFollowup} />
          <span className="text-xs text-slate-300">Tap and say it / दबाकर बोलिए</span>
        </div>
      </div>
    );
  }

  if (phase === 'customization') {
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-customization">
        {questionHeader(customizationQuestionText(lang))}
        <div className="grid grid-cols-2 gap-3">
          {YES_NO_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => saveCustomization(opt.id === 'yes')}
              data-testid={`customization-${opt.id}`}
              className={`min-h-[64px] rounded-2xl border flex items-center justify-center font-extrabold ${opt.id === 'yes' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-[#1A120E] border-red-500/50 text-white'}`}
            >
              {opt.en} / {lang === 'mr' ? opt.mr : opt.hi}
            </button>
          ))}
        </div>
        {accepts !== null && (
          <p className="text-[11px] text-slate-400" data-testid="customization-current">{accepts ? 'Yes' : 'No'}</p>
        )}
        {skipButton(skipCustomization, 'skip-customization')}
      </div>
    );
  }

  if (phase === 'story') {
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-story">
        {questionHeader(storyQuestionText(lang), <p className="text-[11px] text-amber-300 flex items-center gap-1"><BookOpen className="w-3 h-3" />{storyEncouragement(lang)}</p>)}
        <div className="flex items-center gap-3">
          <VoiceInputButton field={storyField} speakingLanguage={lang} maxDurationSeconds={STORY_MAX_SECONDS} onValueConfirmed={saveStory} />
          <span className="text-xs text-slate-300 flex items-center gap-1"><Mic className="w-3.5 h-3.5" /> Up to 90 seconds</span>
        </div>
        {skipButton(skipStory, 'skip-story')}
      </div>
    );
  }

  if (phase === 'care') {
    return (
      <div key={phase} className="space-y-4" data-testid="question-card-care">
        {questionHeader(careInstructionsQuestionText(lang), <p className="text-[11px] text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3" />Optional</p>)}
        <div className="flex items-center gap-3">
          <VoiceInputButton field={careField} speakingLanguage={lang} onValueConfirmed={saveCare} />
          <span className="text-xs text-slate-300">Tap and say it / दबाकर बोलिए</span>
        </div>
        {skipButton(skipCare, 'skip-care')}
      </div>
    );
  }

  // ---- Summary ------------------------------------------------------------
  if (phase === 'summary') {
    const rows: Array<{ key: string; en: string; value: string; onEdit: () => void }> = [
      {
        key: 'dimensions',
        en: 'Size',
        value: answers.dimensions ? `${dimensionKeysForShape(shape ?? 'box').map((k) => answers.dimensions!.values[k]).filter((v) => v !== undefined).join(' × ')} ${answers.dimensions.unit}${answers.dimensions.approximate ? ' (approx)' : ''}` : '',
        onEdit: () => setPhase('dimensions'),
      },
      { key: 'technique', en: 'Made by', value: answers.technique ?? '', onEdit: () => setPhase('technique') },
      { key: 'labor_days', en: 'Days to make', value: answers.labor_days !== null ? `${answers.labor_days}` : '', onEdit: () => setPhase('labor_days') },
      {
        key: 'availability',
        en: 'Availability',
        value: answers.availability === 'ready' ? `Ready now — ${answers.quantity_available} available` : answers.availability === 'made_to_order' ? `Made to order — ${answers.lead_time_days} days` : '',
        onEdit: () => setPhase('availability'),
      },
    ];

    return (
      <div key={phase} className="space-y-4" data-testid="describe-summary">
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-3 p-2.5 pl-3.5 rounded-2xl bg-[#120B08] border border-[#2A1E17]" data-testid={`summary-row-${row.key}`}>
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-400">{row.en}</p>
                <p className="text-sm font-bold text-white truncate">{row.value}</p>
              </div>
              <button type="button" onClick={row.onEdit} className="w-12 h-12 rounded-xl bg-[#1A120E] border border-[#2A1E17] text-slate-300 flex items-center justify-center" aria-label={`Change ${row.en}`} data-testid={`edit-${row.key}`}>
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPhase('customization')}
            className="w-full flex items-center gap-3 p-2.5 pl-3.5 rounded-2xl bg-[#120B08] border border-[#2A1E17] border-dashed text-slate-300"
            data-testid="edit-optional-facts"
          >
            <RefreshCcw className="w-4 h-4" />
            <span className="text-xs">Custom orders, story, care instructions</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
};
