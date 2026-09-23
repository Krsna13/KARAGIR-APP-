import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  X,
  Volume2,
  Pencil,
  RefreshCw,
  ScanSearch,
  AlertCircle,
  Plus,
  Undo2,
  TreePine,
  Amphora,
  Bell,
  Shirt,
  Armchair,
  Hammer,
  Square,
  LayoutGrid,
  Flower2,
} from 'lucide-react';
import { VoiceInputButton } from '../../../voice/VoiceInputButton';
import { speakText } from '../../../../config/languages';
import { saveDraft, debouncedSaveDraft } from '../../../../services/draftService';
import { listProductImages } from '../../../../services/productImageService';
import { identifyProductPhotos } from '../../../../services/productIdentificationService';
import { getProductImageDisplayUrl } from '../../../../services/imageEnhancementService';
import { validateGeminiResult } from '../../../../../supabase/functions/identify-product/validation';
import type {
  IdentifiedProductCategory,
  ProductAiIdentification,
  ProductFinish,
  ProductImage,
  ProductRecord,
} from '../../../../types/product';
import type { VoiceFieldSpec } from '../../../../types/voice';
import {
  COMPLEXITY_OPTIONS,
  FINISH_OPTIONS,
  IDENTIFY_CATEGORIES,
  MATERIAL_CHIPS,
  QUESTION_ORDER,
  SHAPE_OPTIONS,
  answersFromDraft,
  buildCorrectionPrompt,
  buildIdentificationPhotos,
  buildQuestionText,
  computeIdentificationSource,
  havePhotosChanged,
  isIdentifyStepComplete,
  type IdentifyAnswers,
  type QuestionKey,
} from './identifyLogic';

export interface IdentifyStepProps {
  productId: string;
  /** Latest known draft (kept in sync through onDraftPatch). */
  draft: ProductRecord;
  speakingLanguage: string | null;
  /** Mirrors every saved patch into the wizard's draft state (drives canProceed(1)). */
  onDraftPatch: (patch: Partial<ProductRecord>) => void;
}

type Phase = 'loading' | 'questions' | 'summary';

const CATEGORY_ICONS: Record<IdentifiedProductCategory, React.FC<{ className?: string }>> = {
  Woodwork: TreePine,
  Pottery: Amphora,
  Brasscraft: Bell,
  Textile: Shirt,
  Furniture: Armchair,
  Metal: Hammer,
};

const COMPLEXITY_ICONS = { simple: Square, medium: LayoutGrid, intricate: Flower2 } as const;

/** Simple line drawings for the three shape profiles. */
const ShapeDrawing: React.FC<{ shape: 'box' | 'flat' | 'round' }> = ({ shape }) => (
  <svg viewBox="0 0 64 64" className="w-14 h-14" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
    {shape === 'box' && (
      <>
        <path d="M12 22 L32 12 L52 22 L52 46 L32 56 L12 46 Z" />
        <path d="M12 22 L32 32 L52 22 M32 32 L32 56" />
      </>
    )}
    {shape === 'flat' && <rect x="8" y="24" width="48" height="16" rx="2" />}
    {shape === 'round' && <path d="M24 10 H40 V16 C52 22 54 44 44 54 H20 C10 44 12 22 24 16 Z" />}
  </svg>
);

const TEXT_FIELDS: Record<'item_type' | 'material' | 'secondary', VoiceFieldSpec> = {
  item_type: {
    key: 'item_type',
    type: 'text',
    question_en: 'What is this item called?',
    question_hi: 'यह चीज़ क्या कहलाती है?',
  },
  material: {
    key: 'material',
    type: 'text',
    question_en: 'What is it made of?',
    question_hi: 'यह किस चीज़ से बना है?',
  },
  secondary: {
    key: 'secondary_material',
    type: 'text',
    question_en: 'What other material is used?',
    question_hi: 'और कौन सी चीज़ लगी है?',
  },
};

const FINISH_FIELD: VoiceFieldSpec = {
  key: 'finish',
  type: 'choice',
  question_en: 'What is the surface finish?',
  question_hi: 'ऊपर की फिनिश कैसी है?',
  choices: FINISH_OPTIONS.map((f) => ({ id: f.id, label_en: f.en, label_hi: f.hi })),
};

/** Voice text answers arrive as { original, en }; the English form is saved. */
const voiceText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const v = value as { en?: unknown; original?: unknown };
    if (typeof v.en === 'string' && v.en.trim()) return v.en.trim();
    if (typeof v.original === 'string') return v.original.trim();
  }
  return '';
};

/** Restores a previously stored AI guess (only if it is still a valid response). */
const restoreAi = (stored: unknown): ProductAiIdentification | null => {
  if (!stored) return null;
  const result = validateGeminiResult(stored);
  return result.ok ? (result.value as ProductAiIdentification) : null;
};

/** ProductRecord types its JSON columns precisely; the generated Update type says Json. */
type DraftUpdate = Parameters<typeof saveDraft>[1];
const toUpdate = (patch: Partial<ProductRecord>) => patch as unknown as DraftUpdate;

const finishLabel = (finish: ProductFinish | null) => FINISH_OPTIONS.find((f) => f.id === finish) ?? null;

/**
 * Stage 6.4: Add Item wizard step 1. The AI looks at the product's photos and
 * guesses what it is; the artisan confirms or corrects each guess by tap or voice.
 */
export const IdentifyStep: React.FC<IdentifyStepProps> = ({ productId, draft, speakingLanguage, onDraftPatch }) => {
  const lang = speakingLanguage || 'hi';

  const [phase, setPhase] = useState<Phase>('loading');
  const [images, setImages] = useState<ProductImage[]>([]);
  const [ai, setAi] = useState<ProductAiIdentification | null>(() => restoreAi(draft.ai_identification));
  const [failed, setFailed] = useState(false);
  const [answers, setAnswers] = useState<IdentifyAnswers>(() => answersFromDraft(draft));
  const [secondary, setSecondary] = useState<string[] | null>(draft.secondary_materials ?? null);
  const [finish, setFinish] = useState<ProductFinish | null>(draft.finish ?? null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [editingKey, setEditingKey] = useState<QuestionKey | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [photosChanged, setPhotosChanged] = useState(false);
  const [runId, setRunId] = useState(0);

  const mountedRef = useRef(true);
  const runSeqRef = useRef(0);
  const stateRef = useRef({ answers, secondary, finish, ai });
  stateRef.current = { answers, secondary, finish, ai };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Leaving the step: never lose a pending confirmed answer.
      debouncedSaveDraft.flush(productId).catch((err) => console.error('[IdentifyStep] Flush failed:', err));
    };
  }, [productId]);

  /** Mirror into wizard state + debounced save. Never contains ai_identification. */
  const persist = useCallback(
    (patch: Partial<ProductRecord>) => {
      onDraftPatch(patch);
      debouncedSaveDraft(productId, toUpdate(patch)).catch((err) => console.error('[IdentifyStep] Save failed:', err));
    },
    [onDraftPatch, productId]
  );

  const firstUnanswered = (a: IdentifyAnswers) => {
    const idx = QUESTION_ORDER.findIndex((key) => a[key] === null);
    return idx === -1 ? 0 : idx;
  };

  /** Runs identify-product. Failure never blocks: it switches to manual answers. */
  const runIdentification = useCallback(
    async (currentImages: ProductImage[]) => {
      const seq = ++runSeqRef.current;
      setPhase('loading');
      setFailed(false);
      setPhotosChanged(false);
      setCorrecting(false);
      setEditingKey(null);

      try {
        const result = await identifyProductPhotos(currentImages, speakingLanguage);
        if (!mountedRef.current || seq !== runSeqRef.current) return;

        // The AI's untouched response: written exactly once per run, immediately.
        const runPatch: Partial<ProductRecord> = {
          ai_identification: result.raw as unknown as ProductRecord['ai_identification'],
          identification_photos: buildIdentificationPhotos(result.usedImageIds, result.coverImageId, currentImages),
        };
        onDraftPatch(runPatch);
        saveDraft(productId, toUpdate(runPatch)).catch((err) => console.error('[IdentifyStep] Could not save AI guess:', err));

        const guess = result.identification;
        setAi(guess);
        // Optional extras: prefill from the AI only where nothing was confirmed before.
        setSecondary((prev) => prev ?? guess.secondary_materials ?? null);
        setFinish((prev) => prev ?? guess.finish ?? null);
        setQuestionIndex(0);
        setPhase('questions');
      } catch (err) {
        // Logged for developers only; the artisan sees a friendly message.
        console.error('[IdentifyStep] Identification failed; switching to manual answers:', err);
        if (!mountedRef.current || seq !== runSeqRef.current) return;
        setAi(null);
        setFailed(true);
        setQuestionIndex(firstUnanswered(stateRef.current.answers));
        setPhase(isIdentifyStepComplete(stateRef.current.answers) ? 'summary' : 'questions');
      } finally {
        if (mountedRef.current && seq === runSeqRef.current) setRunId((n) => n + 1);
      }
    },
    [onDraftPatch, productId, speakingLanguage]
  );

  // On entering the step
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let current: ProductImage[] = [];
      try {
        current = await listProductImages(productId);
      } catch (err) {
        console.error('[IdentifyStep] Could not load photos:', err);
      }
      if (cancelled) return;
      setImages(current);

      const initial = answersFromDraft(draft);
      if (draft.identification_photos) {
        // Already identified before: never re-run silently; offer it if photos changed.
        setPhotosChanged(havePhotosChanged(draft.identification_photos, current));
        setQuestionIndex(firstUnanswered(initial));
        setPhase(isIdentifyStepComplete(initial) ? 'summary' : 'questions');
      } else if (isIdentifyStepComplete(initial)) {
        setPhase('summary');
      } else {
        await runIdentification(current);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Entry only: draft changes while on the step come from this component itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const currentKey: QuestionKey | null =
    phase === 'questions' ? editingKey ?? QUESTION_ORDER[questionIndex] ?? null : null;

  /** The AI's guess for a question, only if the AI actually returned it. */
  const guessFor = (key: QuestionKey): string | null => {
    if (!ai) return null;
    switch (key) {
      case 'item_type':
        return ai.item_name;
      case 'material':
        return ai.material;
      case 'category':
        return ai.category;
      case 'complexity':
        return ai.complexity ?? null;
      case 'shape_profile':
        return ai.shape_profile ?? null;
    }
  };

  const questionText = currentKey
    ? buildQuestionText(currentKey, guessFor(currentKey) !== null ? ai : null, lang)
    : null;

  // Speak each question card (and the correction prompt) aloud once when shown.
  const spokenPrompt = !currentKey
    ? null
    : correcting && (currentKey === 'item_type' || currentKey === 'material')
    ? buildCorrectionPrompt(currentKey, lang)
    : questionText?.spoken ?? null;

  useEffect(() => {
    if (spokenPrompt) speakText(spokenPrompt, lang);
    // Keyed on the card identity, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, correcting, runId, phase]);

  const advance = (nextAnswers: IdentifyAnswers) => {
    setCorrecting(false);
    setTypedAnswer('');
    if (editingKey) {
      setEditingKey(null);
      setPhase(isIdentifyStepComplete(nextAnswers) ? 'summary' : 'questions');
      setQuestionIndex(firstUnanswered(nextAnswers));
      return;
    }
    const next = questionIndex + 1;
    if (next >= QUESTION_ORDER.length) {
      setPhase(isIdentifyStepComplete(nextAnswers) ? 'summary' : 'questions');
      setQuestionIndex(firstUnanswered(nextAnswers));
    } else {
      setQuestionIndex(next);
    }
  };

  const completionPatch = (
    nextAnswers: IdentifyAnswers,
    nextSecondary: string[] | null,
    nextFinish: ProductFinish | null
  ): Partial<ProductRecord> =>
    isIdentifyStepComplete(nextAnswers)
      ? {
          secondary_materials: nextSecondary,
          finish: nextFinish,
          identification_source: computeIdentificationSource(stateRef.current.ai, {
            ...nextAnswers,
            secondary_materials: nextSecondary,
            finish: nextFinish,
          }),
        }
      : {};

  /** The artisan confirmed a value for one question. */
  const confirmAnswer = <K extends QuestionKey>(key: K, value: IdentifyAnswers[K]) => {
    if (value === null || (typeof value === 'string' && value.trim() === '')) return;
    const nextAnswers = { ...stateRef.current.answers, [key]: value } as IdentifyAnswers;
    setAnswers(nextAnswers);
    persist({
      [key]: value,
      ...completionPatch(nextAnswers, stateRef.current.secondary, stateRef.current.finish),
    } as Partial<ProductRecord>);
    advance(nextAnswers);
  };

  /** Keep the artisan's existing answer unchanged (re-identify / edit). */
  const keepAnswer = () => advance(stateRef.current.answers);

  const updateExtras = (nextSecondary: string[] | null, nextFinish: ProductFinish | null) => {
    setSecondary(nextSecondary);
    setFinish(nextFinish);
    const nextAnswers = stateRef.current.answers;
    persist({
      secondary_materials: nextSecondary,
      finish: nextFinish,
      ...completionPatch(nextAnswers, nextSecondary, nextFinish),
    });
  };

  // When the last question is answered, the summary shows the (AI-prefilled)
  // extras; make sure they and identification_source are persisted.
  const summarySavedForRun = useRef(-1);
  useEffect(() => {
    if (phase !== 'summary' || summarySavedForRun.current === runId) return;
    summarySavedForRun.current = runId;
    const { answers: a, secondary: s, finish: f } = stateRef.current;
    if (!isIdentifyStepComplete(a)) return;
    const patch = completionPatch(a, s, f);
    const unchanged =
      JSON.stringify(patch.secondary_materials ?? null) === JSON.stringify(draft.secondary_materials ?? null) &&
      (patch.finish ?? null) === (draft.finish ?? null) &&
      patch.identification_source === draft.identification_source;
    if (!unchanged) persist(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runId]);

  const cover = useMemo(() => images.find((img) => img.is_cover) ?? images[0] ?? null, [images]);

  // ---------------------------------------------------------------- render

  if (phase === 'loading') {
    return (
      <div className="space-y-4 text-center" data-testid="identify-loading">
        <style>{`@keyframes identify-scan { 0% { top: 0% } 50% { top: 96% } 100% { top: 0% } }`}</style>
        <div className="relative mx-auto w-full max-w-xs aspect-square rounded-3xl overflow-hidden bg-[#120B08] border border-[#2A1E17]">
          {cover ? (
            <img
              src={getProductImageDisplayUrl(cover)}
              alt=""
              className="w-full h-full object-cover opacity-80"
              data-testid="identify-cover-image"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#EA580C]">
              <ScanSearch className="w-16 h-16" />
            </div>
          )}
          <div
            className="absolute inset-x-0 h-1.5 bg-[#EA580C] shadow-[0_0_24px_6px_rgba(234,88,12,0.6)]"
            style={{ animation: 'identify-scan 2.4s ease-in-out infinite' }}
          />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-white">Looking at your photos...</p>
          <p className="text-sm text-amber-300">
            {lang === 'mr' ? 'तुमचे फोटो पाहत आहोत...' : 'आपकी फोटो देख रहे हैं...'}
          </p>
        </div>
      </div>
    );
  }

  const failureBanner = failed && (
    <div
      className="p-3 rounded-2xl bg-amber-950/40 border border-amber-600/50 text-amber-100 text-xs flex items-start gap-2.5"
      data-testid="identify-failure-banner"
      role="status"
    >
      <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
      <div className="flex-1 space-y-0.5">
        <p className="font-bold">We could not recognise it automatically. Please tell us yourself.</p>
        <p>
          {lang === 'mr'
            ? 'आपोआप ओळख पटू शकली नाही. कृपया स्वतः सांगा.'
            : 'अपने आप पहचान नहीं हो सकी। कृपया खुद बताइए।'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => runIdentification(images)}
        className="min-w-[48px] min-h-[48px] -my-2 -mr-1 rounded-xl flex items-center justify-center text-amber-300 hover:text-white"
        aria-label={lang === 'mr' ? 'Try again / पुन्हा प्रयत्न करा' : 'Try again / फिर से कोशिश करें'}
        data-testid="retry-identify"
      >
        <RefreshCw className="w-5 h-5" />
      </button>
    </div>
  );

  const photosChangedBanner = photosChanged && (
    <div
      className="p-3 rounded-2xl bg-sky-950/40 border border-sky-600/50 text-sky-100 text-xs space-y-2.5"
      data-testid="photos-changed-banner"
      role="status"
    >
      <p className="font-bold text-sm">
        {lang === 'mr'
          ? 'Photos changed. Check again? / फोटो बदलले आहेत. पुन्हा तपासायचे?'
          : 'Photos changed. Check again? / फोटो बदली हैं। फिर से जांचें?'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => runIdentification(images)}
          className="min-h-[48px] rounded-xl bg-[#EA580C] text-white font-bold flex items-center justify-center gap-1.5 active:scale-95"
          data-testid="recheck-button"
        >
          <RefreshCw className="w-4 h-4" /> {lang === 'mr' ? 'Check again / पुन्हा तपासा' : 'Check again / फिर जांचें'}
        </button>
        <button
          type="button"
          onClick={() => setPhotosChanged(false)}
          className="min-h-[48px] rounded-xl bg-[#120B08] border border-[#2A1E17] text-slate-200 font-bold active:scale-95"
          data-testid="keep-answers-button"
        >
          {lang === 'mr' ? 'Keep answers / उत्तरे ठेवा' : 'Keep answers / जवाब रखें'}
        </button>
      </div>
    </div>
  );

  if (phase === 'summary') {
    const suggestedSecondary = (ai?.secondary_materials ?? []).filter(
      (m) => !(secondary ?? []).some((s) => s.toLowerCase() === m.toLowerCase())
    );
    const finishInfo = finishLabel(finish);
    const suggestedFinish =
      ai?.finish && ai.finish !== 'unknown' && ai.finish !== finish ? finishLabel(ai.finish) : null;

    const rows: Array<{ key: QuestionKey; en: string; hi: string; value: string }> = [
      { key: 'item_type', en: 'Item', hi: lang === 'mr' ? 'वस्तू' : 'चीज़', value: answers.item_type ?? '' },
      { key: 'material', en: 'Material', hi: lang === 'mr' ? 'साहित्य' : 'सामग्री', value: answers.material ?? '' },
      {
        key: 'category',
        en: 'Craft',
        hi: lang === 'mr' ? 'शिल्प / कला' : 'शिल्प',
        value: answers.category
          ? `${answers.category} / ${(() => {
              const c = IDENTIFY_CATEGORIES.find((cat) => cat.id === answers.category);
              return lang === 'mr' ? c?.mr ?? '' : c?.hi ?? '';
            })()}`
          : '',
      },
      {
        key: 'complexity',
        en: 'Detail',
        hi: lang === 'mr' ? 'बारीक काम' : 'बारीकी',
        value: (() => {
          const o = COMPLEXITY_OPTIONS.find((c) => c.id === answers.complexity);
          return o ? `${o.en} / ${lang === 'mr' ? o.mr : o.hi}` : '';
        })(),
      },
      {
        key: 'shape_profile',
        en: 'Shape',
        hi: 'आकार',
        value: (() => {
          const o = SHAPE_OPTIONS.find((s) => s.id === answers.shape_profile);
          return o ? `${o.en} / ${lang === 'mr' ? o.mr : o.hi}` : '';
        })(),
      },
    ];

    return (
      <div className="space-y-4" data-testid="identify-summary">
        {failureBanner}
        {photosChangedBanner}

        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-3 p-2.5 pl-3.5 rounded-2xl bg-[#120B08] border border-[#2A1E17]"
              data-testid={`summary-row-${row.key}`}
            >
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-400">
                  {row.en} / {row.hi}
                </p>
                <p className="text-sm font-bold text-white truncate">{row.value}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingKey(row.key);
                  setCorrecting(false);
                  setPhase('questions');
                }}
                className="w-12 h-12 rounded-xl bg-[#1A120E] border border-[#2A1E17] text-slate-300 hover:text-white flex items-center justify-center"
                aria-label={`Change ${row.en} / ${lang === 'mr' ? 'बदला' : 'बदलें'}`}
                data-testid={`edit-${row.key}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Optional extras: secondary materials + finish */}
        <div className="p-3 rounded-2xl bg-[#120B08] border border-[#2A1E17] space-y-2.5" data-testid="identify-extras">
          <p className="text-xs font-bold text-slate-300">
            {lang === 'mr'
              ? 'Also used (optional) / इतर वापरलेले साहित्य (ऐच्छिक)'
              : 'Also used (optional) / और क्या लगा है (वैकल्पिक)'}
          </p>
          <div className="flex flex-wrap gap-2">
            {(secondary ?? []).map((material, i) => (
              <span
                key={`${material}-${i}`}
                className="inline-flex items-center gap-1 pl-3 rounded-full bg-[#1A120E] border border-[#3A2A20] text-xs text-white"
                data-testid={`secondary-chip-${i}`}
              >
                {material}
                <button
                  type="button"
                  onClick={() => updateExtras((secondary ?? []).filter((_, j) => j !== i), finish)}
                  className="w-12 h-12 -my-3 flex items-center justify-center text-slate-400 hover:text-white"
                  aria-label={`Remove ${material} / ${lang === 'mr' ? 'काढून टाका' : 'हटाएं'}`}
                  data-testid={`remove-secondary-${i}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            ))}
            {suggestedSecondary.map((material) => (
              <button
                key={`suggest-${material}`}
                type="button"
                onClick={() => updateExtras([...(secondary ?? []), material], finish)}
                className="min-h-[48px] inline-flex items-center gap-1 px-3 rounded-full border border-dashed border-[#EA580C]/60 text-xs text-amber-200"
                data-testid={`suggested-secondary-${material}`}
              >
                <Plus className="w-3.5 h-3.5" /> {material}
              </button>
            ))}
            {finishInfo && (
              <span
                className="inline-flex items-center gap-1 pl-3 rounded-full bg-[#1A120E] border border-[#3A2A20] text-xs text-white"
                data-testid="finish-chip"
              >
                {finishInfo.en} / {lang === 'mr' ? finishInfo.mr : finishInfo.hi}
                <button
                  type="button"
                  // Removing a finish means "not that"; with an AI run that is an honest 'unknown'.
                  onClick={() => updateExtras(secondary, ai ? 'unknown' : null)}
                  className="w-12 h-12 -my-3 flex items-center justify-center text-slate-400 hover:text-white"
                  aria-label={lang === 'mr' ? 'Remove finish / काढून टाका' : 'Remove finish / हटाएं'}
                  data-testid="remove-finish"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            )}
            {suggestedFinish && (
              <button
                type="button"
                onClick={() => updateExtras(secondary, suggestedFinish.id)}
                className="min-h-[48px] inline-flex items-center gap-1 px-3 rounded-full border border-dashed border-[#EA580C]/60 text-xs text-amber-200"
                data-testid="suggested-finish"
              >
                <Plus className="w-3.5 h-3.5" /> {suggestedFinish.en} / {lang === 'mr' ? suggestedFinish.mr : suggestedFinish.hi}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-2" data-testid="add-secondary-voice">
              <VoiceInputButton
                field={TEXT_FIELDS.secondary}
                speakingLanguage={lang}
                onValueConfirmed={(value) => {
                  const material = voiceText(value);
                  if (!material) return;
                  const list = secondary ?? [];
                  if (list.some((m) => m.toLowerCase() === material.toLowerCase())) return;
                  updateExtras([...list, material], finish);
                }}
              />
              <span className="text-[11px] text-slate-400">
                {lang === 'mr' ? 'Add material / साहित्य जोडा' : 'Add material / सामग्री जोड़ें'}
              </span>
            </div>
            {!finishInfo && (
              <div className="flex items-center gap-2" data-testid="add-finish-voice">
                <VoiceInputButton
                  field={FINISH_FIELD}
                  speakingLanguage={lang}
                  onValueConfirmed={(value) => {
                    const id = typeof value === 'string' ? value : '';
                    if (FINISH_OPTIONS.some((f) => f.id === id)) updateExtras(secondary, id as ProductFinish);
                  }}
                />
                <span className="text-[11px] text-slate-400">
                  {lang === 'mr' ? 'Add finish / पॉलिश सांगा' : 'Add finish / फिनिश बताएं'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------ question cards
  if (!currentKey || !questionText) return null;

  const guess = guessFor(currentKey);
  const existing = answers[currentKey];
  // A "keep" option whenever the artisan already has a (different) confirmed answer:
  // re-identification and edits never overwrite it without an explicit tap.
  const canKeep = existing !== null && existing !== guess;
  const stepNumber = QUESTION_ORDER.indexOf(currentKey) + 1;

  const speakAgainButton = (
    <button
      type="button"
      onClick={() => spokenPrompt && speakText(spokenPrompt, lang)}
      className="w-12 h-12 rounded-xl bg-[#1A120E] border border-[#2A1E17] text-[#EA580C] flex items-center justify-center shrink-0"
      aria-label={lang === 'mr' ? 'Listen again / पुन्हा ऐका' : 'Listen again / फिर से सुनें'}
      data-testid="speak-again"
    >
      <Volume2 className="w-5 h-5" />
    </button>
  );

  const keepButton = canKeep && (
    <button
      type="button"
      onClick={keepAnswer}
      className="w-full min-h-[48px] rounded-2xl bg-[#120B08] border border-[#2A1E17] text-slate-200 text-xs font-bold flex items-center justify-center gap-2 active:scale-95"
      data-testid="keep-answer"
    >
      <Undo2 className="w-4 h-4" /> {lang === 'mr' ? `Keep my answer: ${existing} / माझे उत्तर ठेवा` : `Keep my answer: ${existing} / मेरा जवाब रखें`}
    </button>
  );

  const isTextQuestion = currentKey === 'item_type' || currentKey === 'material';
  // Name/material: Yes/No when there is a guess (unless editing an answer the guess already matches).
  const askYesNo = isTextQuestion && guess !== null && !correcting && !(editingKey && guess === existing);

  const correctionPanel = isTextQuestion && !askYesNo && (
    <div className="space-y-3" data-testid="correction-panel">
      <div className="flex items-center gap-3">
        <VoiceInputButton
          field={TEXT_FIELDS[currentKey as 'item_type' | 'material']}
          speakingLanguage={lang}
          onValueConfirmed={(value) => confirmAnswer(currentKey as 'item_type' | 'material', voiceText(value) || null)}
        />
        <span className="text-xs text-slate-300">
          {lang === 'mr' ? 'Tap and say it / टॅप करून बोला' : 'Tap and say it / दबाकर बोलिए'}
        </span>
      </div>
      {currentKey === 'material' && (
        <div className="flex flex-wrap gap-2" data-testid="material-chips">
          {MATERIAL_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => confirmAnswer('material', chip.value)}
              className="min-h-[48px] px-3.5 rounded-full bg-[#1A120E] border border-[#3A2A20] hover:border-[#EA580C] text-xs text-white active:scale-95"
              data-testid={`material-chip-${chip.value}`}
            >
              {chip.en} / {lang === 'mr' ? chip.mr : chip.hi}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          confirmAnswer(currentKey as 'item_type' | 'material', typedAnswer.trim() || null);
        }}
      >
        <input
          value={typedAnswer}
          onChange={(e) => setTypedAnswer(e.target.value)}
          placeholder={lang === 'mr' ? 'Or type / किंवा टाइप करा' : 'Or type / या लिखें'}
          className="flex-1 min-h-[48px] px-3 rounded-xl bg-[#120B08] border border-[#2A1E17] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#EA580C]"
          data-testid="correction-text-input"
        />
        <button
          type="submit"
          disabled={!typedAnswer.trim()}
          className="w-12 h-12 rounded-xl bg-[#EA580C] text-white flex items-center justify-center disabled:opacity-40"
          aria-label={lang === 'mr' ? 'Save / जतन करा' : 'Save / सहेजें'}
          data-testid="correction-text-save"
        >
          <Check className="w-5 h-5" />
        </button>
      </form>
    </div>
  );

  const renderTiles = () => {
    if (currentKey === 'category') {
      return (
        <div className="grid grid-cols-3 gap-2">
          {IDENTIFY_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id];
            const selected = guess === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => confirmAnswer('category', cat.id)}
                aria-pressed={selected}
                data-testid={`category-tile-${cat.id}`}
                data-selected={selected}
                className={`min-h-[88px] p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 active:scale-95 ${
                  selected ? 'bg-[#EA580C]/20 border-[#EA580C] ring-2 ring-[#EA580C]/50' : 'bg-[#120B08] border-[#2A1E17]'
                }`}
              >
                <Icon className="w-8 h-8 text-[#EA580C]" />
                <span className="text-[11px] font-bold text-white leading-tight">{cat.id}</span>
                <span className="text-[10px] text-slate-400 leading-tight">
                  {lang === 'mr' ? cat.mr : cat.hi}
                </span>
              </button>
            );
          })}
        </div>
      );
    }
    if (currentKey === 'complexity') {
      return (
        <div className="grid grid-cols-3 gap-2">
          {COMPLEXITY_OPTIONS.map((opt) => {
            const Icon = COMPLEXITY_ICONS[opt.id];
            const selected = guess === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => confirmAnswer('complexity', opt.id)}
                aria-pressed={selected}
                data-testid={`complexity-card-${opt.id}`}
                data-selected={selected}
                className={`min-h-[120px] p-2 rounded-2xl border flex flex-col items-center justify-center gap-1.5 active:scale-95 ${
                  selected ? 'bg-[#EA580C]/20 border-[#EA580C] ring-2 ring-[#EA580C]/50' : 'bg-[#120B08] border-[#2A1E17]'
                }`}
              >
                <Icon className="w-10 h-10 text-[#EAB308]" />
                <span className="text-xs font-bold text-white">{opt.en}</span>
                <span className="text-[11px] text-slate-400">
                  {lang === 'mr' ? opt.mr : opt.hi}
                </span>
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-3 gap-2">
        {SHAPE_OPTIONS.map((opt) => {
          const selected = guess === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => confirmAnswer('shape_profile', opt.id)}
              aria-pressed={selected}
              data-testid={`shape-card-${opt.id}`}
              data-selected={selected}
              className={`min-h-[140px] p-2 rounded-2xl border flex flex-col items-center justify-center gap-1 text-[#EA580C] active:scale-95 ${
                selected ? 'bg-[#EA580C]/20 border-[#EA580C] ring-2 ring-[#EA580C]/50' : 'bg-[#120B08] border-[#2A1E17]'
              }`}
            >
              <ShapeDrawing shape={opt.id} />
              <span className="text-xs font-bold text-white">
                {opt.en} / {lang === 'mr' ? opt.mr : opt.hi}
              </span>
              <span className="text-[10px] text-slate-400 leading-tight">{opt.examplesEn}</span>
              <span className="text-[10px] text-slate-500 leading-tight">
                {lang === 'mr' ? opt.examplesMr : opt.examplesHi}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    // key={currentKey}: without it, consecutive cards (same element shape) would
    // reconcile as the same DOM node, letting a VoiceInputButton used for one
    // question (e.g. item_type correction) carry its 'done'/'confirm' state
    // into the next question's VoiceInputButton (e.g. material correction).
    <div key={currentKey} className="space-y-4" data-testid={`question-card-${currentKey}`}>
      {failureBanner}
      {photosChangedBanner}

      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>
          Question {stepNumber} of {QUESTION_ORDER.length} / {lang === 'mr' ? 'प्रश्न' : 'सवाल'} {stepNumber}/{QUESTION_ORDER.length}
        </span>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#120B08] border border-[#EA580C]/40">
        <div className="flex-1 space-y-1" data-testid="question-text">
          <p className="text-base font-extrabold text-white leading-snug">{questionText.en}</p>
          {questionText.spoken !== questionText.en && (
            <p className="text-sm text-amber-300 leading-snug">{questionText.spoken}</p>
          )}
          {currentKey === 'complexity' && ai?.complexity && ai.complexity_reason && (
            <p className="text-xs text-slate-400 italic" data-testid="complexity-reason">
              {ai.complexity_reason}
            </p>
          )}
        </div>
        {speakAgainButton}
      </div>

      {askYesNo ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setCorrecting(true);
              setTypedAnswer('');
            }}
            className="min-h-[72px] rounded-2xl bg-[#1A120E] border-2 border-red-500/50 text-white flex flex-col items-center justify-center gap-1 active:scale-95"
            data-testid="answer-no"
          >
            <X className="w-7 h-7 text-red-400" />
            <span className="text-sm font-extrabold">No / {lang === 'mr' ? 'नाही' : 'नहीं'}</span>
          </button>
          <button
            type="button"
            onClick={() => confirmAnswer(currentKey as 'item_type' | 'material', guess)}
            className="min-h-[72px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white flex flex-col items-center justify-center gap-1 active:scale-95"
            data-testid="answer-yes"
          >
            <Check className="w-7 h-7" />
            <span className="text-sm font-extrabold">Yes / {lang === 'mr' ? 'होय' : 'हाँ'}</span>
          </button>
        </div>
      ) : isTextQuestion ? (
        correctionPanel
      ) : (
        <>
          {renderTiles()}
          {guess !== null && (
            <button
              type="button"
              onClick={() => confirmAnswer(currentKey, guess as never)}
              className="w-full min-h-[56px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold flex items-center justify-center gap-2 active:scale-95"
              data-testid="confirm-selection"
            >
              <Check className="w-5 h-5" /> {lang === 'mr' ? 'Yes, correct / होय, योग्य आहे' : 'Yes, correct / हाँ, सही है'}
            </button>
          )}
        </>
      )}

      {keepButton}
    </div>
  );
};
