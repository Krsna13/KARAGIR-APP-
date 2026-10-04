// src/components/portal/addItem/steps/PriceStep.tsx
// Stage 6.7: wizard step 4. Pricing is built from the artisan's own production costs:
// four cost questions -> breakdown -> target profit -> suggested price -> final price.
// Every number shown is computed from the artisan's answers (or verified online listings).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, Globe, AlertTriangle, Check, Pencil } from 'lucide-react';
import type { ProductRecord } from '../../../../types/product';
import type { VoiceFieldSpec } from '../../../../types/voice';
import { VoiceOrTypeInput } from '../../../voice/VoiceOrTypeInput';
import { speakText } from '../../../../config/languages';
import { saveDraft, debouncedSaveDraft } from '../../../../services/draftService';
import { fetchOnlineEstimate, recordConfirmedPrice, type OnlineEstimate } from '../../../../services/priceEstimateService';
import { assertValidProductPatch } from '../../../../lib/patchValidator';
import { asDescribeLang } from './describeLogic';
import {
  MARGIN_PRESETS,
  DEFAULT_MARGIN,
  areCostsComplete,
  calculateSuggestedPrice,
  compareToOnlineRange,
  costInputsFromDraft,
  costQuestionText,
  formatPercent,
  formatRupees,
  isLossPrice,
  isValidCost,
  isValidMargin,
  lossWarningText,
  marginPresetText,
  noneLabel,
  onlineNoteText,
  priceSummaryText,
  sumProductionCost,
  type CostKey,
  type PriceText,
} from './priceLogic';

interface PriceStepProps {
  productId: string;
  draft: ProductRecord;
  speakingLanguage?: string | null;
  onDraftPatch: (patch: Partial<ProductRecord>) => void;
}

type Phase = CostKey | 'profit' | 'final';

const COST_ORDER: CostKey[] = ['cost_material', 'cost_labour', 'cost_hardware', 'cost_finishing'];
/** Hardware and finishing may be "None" (0). Material and labour must be given. */
const OPTIONAL_ZERO: Record<CostKey, boolean> = {
  cost_material: false,
  cost_labour: false,
  cost_hardware: true,
  cost_finishing: true,
};

const toUpdate = (patch: Partial<ProductRecord>) => {
  assertValidProductPatch(patch as Record<string, unknown>);
  return patch as unknown as Parameters<typeof saveDraft>[1];
};

const firstUnansweredCost = (draft: Partial<ProductRecord>): CostKey | null =>
  COST_ORDER.find((k) => !isValidCost(draft[k])) ?? null;

export const PriceStep: React.FC<PriceStepProps> = ({ productId, draft, speakingLanguage, onDraftPatch }) => {
  const lang = asDescribeLang(speakingLanguage);

  const [phase, setPhase] = useState<Phase>(() => {
    const missing = firstUnansweredCost(draft);
    if (missing) return missing;
    return draft.price_final ? 'final' : 'profit';
  });
  const [margin, setMargin] = useState<number>(() => (isValidMargin(draft.target_margin) ? (draft.target_margin as number) : DEFAULT_MARGIN));
  const [customOpen, setCustomOpen] = useState(false);
  const [customError, setCustomError] = useState(false);
  const [online, setOnline] = useState<OnlineEstimate | 'loading' | null>(null);
  const [pendingPrice, setPendingPrice] = useState<number | null>(null); // chosen, awaiting loss confirmation
  const [confirming, setConfirming] = useState(false);

  const mountedRef = useRef(true);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const spokenKeyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      debouncedSaveDraft.flush(productId).catch((err) => console.error('[PriceStep] Flush failed:', err));
    };
  }, [productId]);

  const persistNow = useCallback(
    async (patch: Partial<ProductRecord>) => {
      onDraftPatch(patch);
      try {
        await saveDraft(productId, toUpdate(patch));
      } catch (err) {
        console.error('[PriceStep] Save failed:', err);
      }
    },
    [onDraftPatch, productId]
  );

  const costs = costInputsFromDraft(draft);
  const productionCost = sumProductionCost(costs);
  const calcResult = productionCost !== null ? calculateSuggestedPrice(productionCost, margin) : null;
  const calc = calcResult && calcResult.ok ? calcResult.value : null;

  // ---- speech -------------------------------------------------------------
  const spokenFor = (p: Phase): string | null => {
    if (COST_ORDER.includes(p as CostKey)) return costQuestionText(p as CostKey, lang).spoken;
    if (p === 'profit' && calc) return priceSummaryText(calc, lang).spoken;
    if (p === 'final' && calc) return priceSummaryText(calc, lang).spoken;
    return null;
  };
  const speakKey = `${phase}|${calc ? `${calc.suggested_price}` : ''}`;
  useEffect(() => {
    if (spokenKeyRef.current === speakKey) return;
    spokenKeyRef.current = speakKey;
    const text = spokenFor(phase);
    if (text) speakText(text, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakKey]);

  const speakAgain = () => {
    const text = spokenFor(phase);
    if (text) speakText(text, lang);
  };

  // ---- online comparison (secondary; never blocks) ----------------------
  useEffect(() => {
    if (phase !== 'profit' && phase !== 'final') return;
    if (online !== null) return;
    setOnline('loading');
    fetchOnlineEstimate(productId).then((res) => {
      if (mountedRef.current) setOnline(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const onlineRange = online && online !== 'loading' && online.status === 'ok' ? { low: online.low, high: online.high } : null;
  const onlinePosition = calc ? compareToOnlineRange(calc.suggested_price, onlineRange) : null;
  const noteKey = onlinePosition ? `${onlinePosition}|${calc?.suggested_price}` : null;
  const notedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!noteKey || !onlinePosition || notedRef.current === noteKey) return;
    notedRef.current = noteKey;
    speakText(onlineNoteText(onlinePosition, lang).spoken, lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey]);

  // ---- state changes --------------------------------------------------
  /** Cost or margin changes invalidate a previously confirmed price: the artisan must confirm again. */
  const clearedPrice = (): Partial<ProductRecord> =>
    draftRef.current.price_final || draftRef.current.price ? { price_final: null, price: null } : {};

  const saveCost = (key: CostKey, value: unknown) => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!isValidCost(n)) return;
    const nextCosts = { ...costInputsFromDraft(draftRef.current), [key]: n };
    const total = sumProductionCost(nextCosts);
    const patch: Partial<ProductRecord> = { [key]: n, production_cost: total, ...clearedPrice() };
    if (total !== null) {
      const r = calculateSuggestedPrice(total, margin);
      patch.target_margin = margin;
      patch.price_deterministic = r.ok ? r.value.suggested_price : null;
    }
    void persistNow(patch);
    setPendingPrice(null);
    const nextMissing = firstUnansweredCost({ ...draftRef.current, ...patch });
    setPhase(nextMissing ?? 'profit');
  };

  const chooseMargin = (m: number) => {
    if (!isValidMargin(m)) {
      setCustomError(true);
      return;
    }
    setCustomError(false);
    setMargin(m);
    const r = productionCost !== null ? calculateSuggestedPrice(productionCost, m) : null;
    void persistNow({
      target_margin: m,
      price_deterministic: r && r.ok ? r.value.suggested_price : null,
      ...clearedPrice(),
    });
    setPendingPrice(null);
  };

  const confirmFinalPrice = async (price: number) => {
    if (!calc || !(price > 0)) return;
    setConfirming(true);
    await persistNow({
      cost_material: costs.cost_material as number,
      cost_labour: costs.cost_labour as number,
      cost_hardware: costs.cost_hardware as number,
      cost_finishing: costs.cost_finishing as number,
      production_cost: calc.production_cost,
      target_margin: margin,
      price_deterministic: calc.suggested_price,
      price_final: price,
      price,
    });
    // Make sure the row is committed before the server reads it, then record training data.
    await debouncedSaveDraft.flush(productId).catch(() => undefined);
    await recordConfirmedPrice(productId);
    if (mountedRef.current) {
      setPendingPrice(null);
      setConfirming(false);
    }
  };

  /** Choosing a price: below cost needs a second confirmation (warn, never block). */
  const choosePrice = (price: number) => {
    if (!(price > 0)) return;
    if (isLossPrice(price, calc?.production_cost)) {
      setPendingPrice(price);
      speakText(lossWarningText(lang).spoken, lang);
      return;
    }
    void confirmFinalPrice(price);
  };

  // ---- render helpers -------------------------------------------------
  const header = (title: PriceText, extra?: React.ReactNode) => (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-[#120B08] border border-[#EA580C]/40">
      <div className="flex-1 space-y-1" data-testid="price-question-text">
        <p className="text-base font-extrabold text-white leading-snug">{title.en}</p>
        {title.spoken !== title.en && <p className="text-sm text-amber-300 leading-snug">{title.spoken}</p>}
        {extra}
      </div>
      <button
        type="button"
        onClick={speakAgain}
        className="w-12 h-12 rounded-xl bg-[#1A120E] border border-[#2A1E17] text-[#EA580C] flex items-center justify-center shrink-0"
        aria-label="Listen again"
        data-testid="price-speak-again"
      >
        <Volume2 className="w-5 h-5" />
      </button>
    </div>
  );

  const rupeeField = (key: string, text: PriceText): VoiceFieldSpec => ({
    key,
    type: 'number',
    question_en: text.en,
    unit_hint: 'rupees',
  });

  const bigButton = (selected: boolean) =>
    `w-full min-h-[64px] p-3 rounded-2xl border-2 text-left flex flex-col justify-center active:scale-95 transition-all ${
      selected ? 'bg-[#EA580C]/15 border-[#EA580C]' : 'bg-[#120B08] border-[#2A1E17]'
    }`;

  const costLabels: Record<CostKey, PriceText> = {
    cost_material: costQuestionText('cost_material', lang),
    cost_labour: costQuestionText('cost_labour', lang),
    cost_hardware: costQuestionText('cost_hardware', lang),
    cost_finishing: costQuestionText('cost_finishing', lang),
  };

  const onlineCard = (
    <div className="p-4 rounded-2xl bg-[#120B08] border border-[#2A1E17] space-y-2" data-testid="online-card">
      <div className="flex items-center gap-2 text-sky-400">
        <Globe className="w-4 h-4" />
        <p className="text-xs font-bold text-white">
          {lang === 'mr' ? 'ऑनलाइन तुलना' : lang === 'hi' ? 'ऑनलाइन तुलना' : 'Online comparison'}
        </p>
      </div>
      {online === 'loading' && <p className="text-xs text-slate-400" data-testid="online-loading">Checking similar items online… / ऑनलाइन देख रहे हैं…</p>}
      {online && online !== 'loading' && online.status === 'ok' && (
        <div className="space-y-2" data-testid="online-ok">
          <p className="text-sm font-bold text-white">
            Similar items online: {formatRupees(online.low)} – {formatRupees(online.high)}
          </p>
          <ul className="space-y-1">
            {online.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-400 underline break-all" data-testid="online-source">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          {onlinePosition && (
            <p className="text-xs text-amber-300" data-testid="online-note">
              {onlineNoteText(onlinePosition, lang).en}
              {lang !== 'en' && <span className="block">{onlineNoteText(onlinePosition, lang).spoken}</span>}
            </p>
          )}
        </div>
      )}
      {online && online !== 'loading' && online.status === 'insufficient' && (
        <p className="text-xs text-slate-400" data-testid="online-insufficient">Not enough online data / ऑनलाइन जानकारी पर्याप्त नहीं</p>
      )}
      {online && online !== 'loading' && online.status === 'unavailable' && (
        <p className="text-xs text-slate-500" data-testid="online-unavailable">Online comparison is not available right now.</p>
      )}
    </div>
  );

  // ---- cost cards -----------------------------------------------------
  if (COST_ORDER.includes(phase as CostKey)) {
    const key = phase as CostKey;
    const label = costLabels[key];
    return (
      <div key={phase} className="space-y-4" data-testid={`question-card-${key}`}>
        {header(label)}
        <div className="w-full flex justify-center">
          <VoiceOrTypeInput field={rupeeField(key, label)} speakingLanguage={lang} onValueConfirmed={(v) => saveCost(key, v)} />
        </div>
        {OPTIONAL_ZERO[key] && (
          <button
            type="button"
            onClick={() => saveCost(key, 0)}
            className="w-full min-h-[56px] rounded-2xl border-2 border-[#2A1E17] bg-[#120B08] text-white font-bold active:scale-95"
            data-testid={`none-${key}`}
          >
            {noneLabel('en').en}
            {lang !== 'en' && <span className="ml-2 text-amber-300">/ {noneLabel(lang).spoken}</span>}
          </button>
        )}
      </div>
    );
  }

  // ---- breakdown table (shared by profit + final) ---------------------
  const breakdown = areCostsComplete(costs) && (
    <div className="rounded-2xl bg-[#120B08] border border-[#2A1E17] overflow-hidden" data-testid="cost-breakdown">
      {COST_ORDER.map((k) => (
        <div key={k} className="flex items-center justify-between px-4 py-3 border-b border-[#2A1E17]" data-testid={`breakdown-${k}`}>
          <span className="text-sm text-slate-300">
            {costLabels[k].en}
            {lang !== 'en' && <span className="block text-[11px] text-slate-500">{costLabels[k].spoken}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{formatRupees(costs[k] as number)}</span>
            <button
              type="button"
              onClick={() => setPhase(k)}
              className="w-9 h-9 rounded-lg bg-[#1A120E] text-[#EA580C] flex items-center justify-center"
              aria-label={`Edit ${costLabels[k].en}`}
              data-testid={`edit-${k}`}
            >
              <Pencil className="w-4 h-4" />
            </button>
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1A120E]">
        <span className="text-sm font-extrabold text-white">Total Production Cost{lang !== 'en' && (lang === 'mr' ? ' / एकूण उत्पादन खर्च' : ' / कुल उत्पादन लागत')}</span>
        <span className="text-base font-extrabold text-[#EA580C]" data-testid="total-production-cost">{productionCost !== null ? formatRupees(productionCost) : ''}</span>
      </div>
    </div>
  );

  const zeroCost = calcResult !== null && !calcResult.ok && (calcResult as { error: string }).error === 'zero_cost';

  // ---- profit phase ---------------------------------------------------
  const marginSection = (
    <div className="space-y-3" data-testid="margin-section">
      <p className="text-sm font-bold text-white">
        Target profit{lang !== 'en' && (lang === 'mr' ? ' / नफा किती हवा?' : ' / कितना मुनाफ़ा चाहिए?')}
      </p>
      {MARGIN_PRESETS.map((p) => {
        const text = marginPresetText(p.id, lang);
        const selected = !customOpen && margin === p.margin;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setCustomOpen(false);
              chooseMargin(p.margin);
            }}
            className={bigButton(selected)}
            data-testid={`margin-${p.id}`}
            data-selected={selected ? 'true' : 'false'}
          >
            <span className="text-base font-extrabold text-white">
              {text.en} — {formatPercent(p.margin)}
            </span>
            {lang !== 'en' && <span className="text-sm text-amber-300">{text.spoken}</span>}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setCustomOpen(true)}
        className={bigButton(customOpen)}
        data-testid="margin-custom"
        data-selected={customOpen ? 'true' : 'false'}
      >
        <span className="text-base font-extrabold text-white">Custom (0–59%)</span>
        {lang !== 'en' && <span className="text-sm text-amber-300">{lang === 'mr' ? 'स्वतः ठरवा' : 'अपना तय करें'}</span>}
      </button>
      {customOpen && (
        <div className="space-y-2" data-testid="margin-custom-input">
          <VoiceOrTypeInput
            field={{ key: 'target_margin_percent', type: 'number', question_en: 'Profit percent', unit_hint: 'percent' }}
            speakingLanguage={lang}
            onValueConfirmed={(v) => {
              const pct = typeof v === 'number' ? v : Number(v);
              chooseMargin(pct / 100);
            }}
          />
          {customError && (
            <p className="text-xs text-red-400" role="alert" data-testid="margin-error">
              Please choose a profit between 0% and 59%. / 0% से 59% के बीच चुनें।
            </p>
          )}
        </div>
      )}
    </div>
  );

  const resultCard = calc && (
    <div className="p-4 rounded-2xl bg-[#EA580C]/10 border border-[#EA580C] space-y-1" data-testid="price-result">
      <div className="flex justify-between text-sm text-slate-300">
        <span>Production cost</span>
        <span className="font-bold text-white" data-testid="result-cost">{formatRupees(calc.production_cost)}</span>
      </div>
      <div className="flex justify-between text-sm text-slate-300">
        <span>Your profit</span>
        <span className="font-bold text-white" data-testid="result-profit">{formatRupees(calc.profit)}</span>
      </div>
      <div className="flex justify-between items-baseline pt-1">
        <span className="text-sm font-bold text-white">Suggested selling price</span>
        <span className="text-2xl font-extrabold text-[#EA580C]" data-testid="result-price">{formatRupees(calc.suggested_price)}</span>
      </div>
      <p className="text-xs text-slate-300" data-testid="result-share">Your profit is {formatPercent(calc.profit_share)} of the selling price.</p>
      <p className="text-xs text-amber-300" data-testid="result-summary">{priceSummaryText(calc, lang).spoken}</p>
    </div>
  );

  if (phase === 'profit') {
    return (
      <div key={phase} className="space-y-4" data-testid="price-profit-card">
        {header(
          { en: 'Total Production Cost', spoken: lang === 'mr' ? 'एकूण उत्पादन खर्च' : lang === 'hi' ? 'कुल उत्पादन लागत' : 'Total Production Cost' }
        )}
        {breakdown}
        {zeroCost ? (
          <p className="text-sm text-red-400" role="alert" data-testid="zero-cost-error">
            Your total cost is ₹0. Please enter your costs. / आपकी कुल लागत ₹0 है, कृपया खर्च दर्ज करें।
          </p>
        ) : (
          <>
            {marginSection}
            {resultCard}
            {onlineCard}
            <button
              type="button"
              onClick={() => setPhase('final')}
              disabled={!calc}
              className="w-full min-h-[56px] rounded-2xl bg-[#EA580C] text-white font-extrabold disabled:opacity-40 active:scale-95"
              data-testid="continue-to-final"
            >
              Continue / आगे बढ़ें
            </button>
          </>
        )}
      </div>
    );
  }

  // ---- final price phase ----------------------------------------------
  const confirmed = typeof draft.price_final === 'number' && draft.price_final > 0 ? draft.price_final : null;
  const pendingLoss = pendingPrice !== null && isLossPrice(pendingPrice, calc?.production_cost);

  return (
    <div key={phase} className="space-y-4" data-testid="price-final-card">
      {header({ en: 'Final selling price', spoken: lang === 'mr' ? 'अंतिम विक्री किंमत' : lang === 'hi' ? 'अंतिम बिक्री कीमत' : 'Final selling price' })}
      {breakdown}
      {resultCard}
      {onlineCard}

      {calc && (
        <button
          type="button"
          onClick={() => choosePrice(calc.suggested_price)}
          disabled={confirming}
          className={bigButton(confirmed === calc.suggested_price)}
          data-testid="use-suggested-price"
        >
          <span className="text-base font-extrabold text-white">Use suggested price — {formatRupees(calc.suggested_price)}</span>
          {lang !== 'en' && <span className="text-sm text-amber-300">{lang === 'mr' ? 'सुचवलेली किंमत वापरा' : 'सुझाई गई कीमत इस्तेमाल करें'}</span>}
        </button>
      )}

      <div className="space-y-2" data-testid="own-price">
        <p className="text-sm font-bold text-white">
          Or set your own price{lang !== 'en' && (lang === 'mr' ? ' / स्वतःची किंमत' : ' / अपनी कीमत')}
        </p>
        <VoiceOrTypeInput
          field={{ key: 'price_final', type: 'number', question_en: 'Your selling price', unit_hint: 'rupees' }}
          speakingLanguage={lang}
          onValueConfirmed={(v) => {
            const n = typeof v === 'number' ? v : Number(v);
            if (Number.isFinite(n) && n > 0) choosePrice(n);
          }}
        />
      </div>

      {pendingLoss && pendingPrice !== null && (
        <div className="p-4 rounded-2xl bg-red-950/50 border-2 border-red-500 space-y-3" role="alert" data-testid="loss-warning">
          <div className="flex items-center gap-2 text-red-300">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-extrabold text-white">{lossWarningText('en').en}</p>
          </div>
          {lang !== 'en' && <p className="text-sm text-red-200">{lossWarningText(lang).spoken}</p>}
          <p className="text-xs text-red-200">
            {formatRupees(pendingPrice)} &lt; {formatRupees(calc?.production_cost ?? 0)}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPendingPrice(null)}
              className="min-h-[52px] rounded-xl bg-[#1A120E] border border-[#2A1E17] text-white font-bold"
              data-testid="loss-cancel"
            >
              Change price / बदलें
            </button>
            <button
              type="button"
              onClick={() => void confirmFinalPrice(pendingPrice)}
              disabled={confirming}
              className="min-h-[52px] rounded-xl bg-red-600 text-white font-bold disabled:opacity-50"
              data-testid="loss-confirm"
            >
              Yes, use this price / हाँ
            </button>
          </div>
        </div>
      )}

      {confirmed !== null && !pendingLoss && (
        <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-600/50 flex items-center gap-2" data-testid="price-confirmed">
          <Check className="w-5 h-5 text-emerald-400" />
          <p className="text-sm font-bold text-white">
            Price set: <span data-testid="confirmed-price">{formatRupees(confirmed)}</span>
          </p>
        </div>
      )}
    </div>
  );
};
