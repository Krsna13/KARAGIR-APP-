// src/components/discover/SnapAndDiscover.tsx
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  RotateCcw,
  Check,
  Tag,
  Hammer,
  DollarSign,
  Users,
} from 'lucide-react';
import {
  identifyProduct,
  ProductIdentificationError,
} from '../../services/productIdentificationService';
import type { ProductIdentification, IdentifiedProductCategory } from '../../types';

export interface SnapAndDiscoverProps {
  photoBlob: Blob;
  previewUrl: string;
  onClose: () => void;
  onTryAnother?: () => void;
}

type ViewState = 'identifying' | 'result' | 'low-confidence' | 'error';

interface FriendlyError {
  title: string;
  subtitle: string;
}

const CATEGORY_CHOICES: Array<{
  id: IdentifiedProductCategory;
  nameEn: string;
  nameHi: string;
  icon: string;
}> = [
  { id: 'Woodwork', nameEn: 'Woodwork', nameHi: 'काष्ठकला', icon: '🪵' },
  { id: 'Pottery', nameEn: 'Pottery', nameHi: 'मिट्टी के बर्तन', icon: '🏺' },
  { id: 'Brasscraft', nameEn: 'Brasscraft', nameHi: 'पीतल शिल्प', icon: '🔔' },
  { id: 'Textile', nameEn: 'Textile', nameHi: 'वस्त्र शिल्प', icon: '🧵' },
  { id: 'Furniture', nameEn: 'Furniture', nameHi: 'फर्नीचर', icon: '🪑' },
  { id: 'Metal', nameEn: 'Metal', nameHi: 'धातु शिल्प', icon: '⚔️' },
];

/**
 * Maps error status codes to friendly bilingual strings.
 * Never exposes raw internal errors or numerical codes to users.
 */
function getFriendlyError(err: unknown): FriendlyError {
  if (err instanceof ProductIdentificationError) {
    if (err.status === 422) {
      return {
        title: 'Please upload a photo of a craft item / कृपया किसी हस्तशिल्प वस्तु की तस्वीर अपलोड करें',
        subtitle:
          'Our AI focuses on traditional handmade items like woodwork, pottery, brass, and textiles / हमारा AI पारंपरिक हस्तशिल्प वस्तुओं पर केंद्रित है।',
      };
    }
    if (err.status === 429) {
      return {
        title: 'Too many requests, try again shortly / बहुत सारे अनुरोध, कृपया थोड़ी देर बाद पुनः प्रयास करें',
        subtitle:
          'The vision service is currently handling high volume. Please wait a moment / विज़न सेवा अभी व्यस्त है। कृपया कुछ क्षण प्रतीक्षा करें।',
      };
    }
  }

  // 500, network, or other errors
  return {
    title:
      'Identification is unavailable right now, please try again / पहचान सेवा अभी उपलब्ध नहीं है, कृपया बाद में पुनः प्रयास करें',
    subtitle:
      'Could not reach the vision service. Please check your connection / विज़न सेवा से संपर्क नहीं हो सका। कृपया अपना कनेक्शन जांचें।',
  };
}

/**
 * Full-screen modal overlay presenting the AI identification results,
 * low-confidence verification, error recovery, and honest future-stage placeholders.
 */
export const SnapAndDiscover: React.FC<SnapAndDiscoverProps> = ({
  photoBlob,
  previewUrl,
  onClose,
  onTryAnother,
}) => {
  const [viewState, setViewState] = useState<ViewState>('identifying');
  const [identification, setIdentification] = useState<ProductIdentification | null>(null);
  const [friendlyError, setFriendlyError] = useState<FriendlyError | null>(null);
  const [isSelectingCategory, setIsSelectingCategory] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function runIdentification() {
      setViewState('identifying');
      setFriendlyError(null);
      setIsSelectingCategory(false);

      try {
        const result = await identifyProduct(photoBlob);
        if (!isMounted) return;

        setIdentification(result);

        // Branch based on confidence threshold (< 0.6 is low-confidence)
        if (result.confidence < 0.6) {
          setViewState('low-confidence');
        } else {
          setViewState('result');
        }
      } catch (err) {
        if (!isMounted) return;
        setFriendlyError(getFriendlyError(err));
        setViewState('error');
      }
    }

    runIdentification();

    return () => {
      isMounted = false;
    };
  }, [photoBlob]);

  // Handle buyer confirming a low-confidence guess
  const handleConfirmLowConfidence = () => {
    setViewState('result');
  };

  // Handle buyer manually picking the correct craft category
  const handleSelectCategory = (cat: IdentifiedProductCategory) => {
    if (identification) {
      setIdentification({
        ...identification,
        category: cat,
      });
    }
    setIsSelectingCategory(false);
    setViewState('result');
  };

  return (
    <div
      className="fixed inset-0 z-[1250] bg-black/85 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Snap & Discover"
      data-testid="snap-and-discover-modal"
    >
      <div className="w-full max-w-[430px] h-[100dvh] sm:h-[92vh] sm:max-h-[890px] bg-[#120B08] flex flex-col relative overflow-hidden sm:rounded-[36px] sm:border border-[#2A1E17] shadow-2xl">
        {/* Sticky Header */}
        <header className="px-4 py-3 bg-[#1A120E]/95 border-b border-[#2A1E17] flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              type="button"
              data-testid="close-discover-button"
              className="w-8 h-8 rounded-full bg-[#261B15] border border-[#3A2A20] text-slate-300 hover:text-white flex items-center justify-center transition-colors active:scale-95"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="text-xs font-black text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>Snap & Discover</span>
              </div>
              <div className="text-[10px] text-[#EA580C] font-medium">पहचानें और खोजें</div>
            </div>
          </div>

          {onTryAnother && (
            <button
              onClick={onTryAnother}
              type="button"
              data-testid="try-another-header-button"
              className="text-[11px] px-2.5 py-1 rounded-full bg-[#261B15] hover:bg-[#EA580C]/20 border border-[#3A2A20] hover:border-[#EA580C]/60 text-slate-200 transition-colors flex items-center gap-1 active:scale-95"
            >
              <RotateCcw className="w-3 h-3 text-[#EA580C]" />
              <span>Retake</span>
            </button>
          )}
        </header>

        {/* Scrollable Content Viewport */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain">
          {/* Photo Preview Card */}
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-[#1A120E] border border-[#2A1E17] shadow-inner shrink-0">
            <img
              src={previewUrl}
              alt="Artisan Craft Item"
              className="w-full h-full object-cover"
              data-testid="photo-preview-image"
            />
            {viewState === 'identifying' && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4 space-y-3 animate-in fade-in">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-[#EA580C] border-t-transparent animate-spin" />
                  <Sparkles className="w-5 h-5 text-[#EA580C] animate-pulse" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-extrabold text-white">
                    Analyzing your craft photo...
                  </p>
                  <p className="text-[10px] text-orange-200/90 font-medium">
                    आपके शिल्प की तस्वीर की पहचान की जा रही है...
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* STATE 1: Identifying Loading State Card */}
          {viewState === 'identifying' && (
            <div
              className="p-4 rounded-2xl bg-[#1A120E] border border-[#2A1E17] text-center space-y-2 animate-pulse"
              data-testid="identifying-state"
            >
              <div className="h-4 bg-[#2A1E17] rounded-full w-2/3 mx-auto" />
              <div className="h-3 bg-[#2A1E17] rounded-full w-1/2 mx-auto" />
              <div className="h-10 bg-[#2A1E17] rounded-xl w-full mt-2" />
            </div>
          )}

          {/* STATE 2: Error State Card */}
          {viewState === 'error' && friendlyError && (
            <div
              className="p-4 rounded-2xl bg-amber-950/20 border border-amber-600/40 space-y-3.5 animate-in fade-in"
              data-testid="error-state"
            >
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-amber-200 leading-snug">
                    {friendlyError.title}
                  </h3>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    {friendlyError.subtitle}
                  </p>
                </div>
              </div>

              <div className="pt-1 flex gap-2">
                {onTryAnother && (
                  <button
                    onClick={onTryAnother}
                    type="button"
                    data-testid="retry-photo-button"
                    className="flex-1 min-h-[48px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#EA580C] to-[#F97316] text-white text-xs font-extrabold flex items-center justify-center space-x-2 shadow-md active:scale-95 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try another photo / दूसरी तस्वीर चुनें</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  type="button"
                  data-testid="error-close-button"
                  className="min-h-[48px] px-4 rounded-xl bg-[#261B15] border border-[#3A2A20] text-slate-300 text-xs font-bold active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: Low-Confidence Verification Prompt (< 0.6) */}
          {viewState === 'low-confidence' && identification && (
            <div
              className="p-4 rounded-2xl bg-[#1F1510] border border-amber-500/50 space-y-3.5 animate-in fade-in"
              data-testid="low-confidence-state"
            >
              <div className="flex items-start space-x-2.5">
                <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                    Tentative Match ({Math.round(identification.confidence * 100)}% Confidence)
                  </span>
                  <h2 className="text-sm font-extrabold text-white leading-tight">
                    Possibly: {identification.item_name}?
                  </h2>
                  <p className="text-[11px] text-amber-200/90 font-medium">
                    संभवतः: {identification.item_name}?
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed pt-0.5">
                    Our vision engine is unsure about this piece. Please verify if this matches your item.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              {!isSelectingCategory ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleConfirmLowConfidence}
                    type="button"
                    data-testid="confirm-low-confidence-button"
                    className="min-h-[48px] py-2 px-3 rounded-xl bg-gradient-to-r from-[#EA580C] to-[#F97316] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Yes, that's it / हाँ, यही है</span>
                  </button>

                  <button
                    onClick={() => setIsSelectingCategory(true)}
                    type="button"
                    data-testid="not-quite-button"
                    className="min-h-[48px] py-2 px-3 rounded-xl bg-[#261B15] hover:bg-[#32231B] border border-[#3A2A20] text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <span>Not quite / नहीं, कुछ और</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 pt-1 animate-in fade-in" data-testid="category-picker">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-slate-300">
                      Select craft category / सही श्रेणी चुनें:
                    </p>
                    <button
                      onClick={() => setIsSelectingCategory(false)}
                      className="text-[10px] text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORY_CHOICES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => handleSelectCategory(cat.id)}
                        type="button"
                        data-testid={`select-category-${cat.id.toLowerCase()}`}
                        className="min-h-[48px] p-2.5 rounded-xl bg-[#1A120E] hover:bg-[#251A14] border border-[#2A1E17] hover:border-[#EA580C]/60 text-left flex items-center space-x-2.5 active:scale-95 transition-all"
                      >
                        <span className="text-lg">{cat.icon}</span>
                        <div>
                          <div className="text-xs font-extrabold text-white">{cat.nameEn}</div>
                          <div className="text-[10px] text-slate-400">{cat.nameHi}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STATE 4: High-Confidence or Confirmed Identification Result */}
          {viewState === 'result' && identification && (
            <div className="space-y-3.5 animate-in fade-in" data-testid="result-state">
              {/* Main Headline & Details Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1F1510] via-[#1A120E] to-[#120B08] border border-[#2A1E17] shadow-xl space-y-2.5">
                {/* Headline: Item Name */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                      <span>Identified Craft</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {Math.round(identification.confidence * 100)}% match
                    </span>
                  </div>
                  <h1
                    className="text-lg font-black text-white tracking-tight leading-snug mt-1"
                    data-testid="item-name-headline"
                  >
                    {identification.item_name}
                  </h1>
                </div>

                {/* Primary Material Tag (directly beneath headline) */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <div
                    className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#EA580C]/20 border border-[#EA580C]/60 text-xs font-extrabold text-[#EA580C] shadow-sm"
                    data-testid="material-tag"
                  >
                    <Tag className="w-3 h-3 text-[#EA580C]" />
                    <span>Material: {identification.material}</span>
                  </div>

                  <div
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-[#261B15] border border-[#3A2A20] text-[11px] font-semibold text-slate-300"
                    data-testid="category-badge"
                  >
                    <Hammer className="w-3 h-3 text-[#EAB308]" />
                    <span>{identification.category}</span>
                  </div>
                </div>

                {/* Short Description */}
                <p
                  className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-[#2A1E17]"
                  data-testid="short-description"
                >
                  {identification.short_description}
                </p>
              </div>

              {/* Placeholder Section 1: Estimated Price Range (Honest Coming Soon) */}
              <div
                className="p-4 rounded-2xl bg-[#170E0A] border border-dashed border-[#3A2A20] space-y-2"
                data-testid="price-placeholder-card"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-[#261B15] flex items-center justify-center">
                      <DollarSign className="w-3.5 h-3.5 text-[#EAB308]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white">Estimated Price Range</h3>
                      <p className="text-[10px] text-slate-400">अनुमानित मूल्य</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#261B15] text-[#EAB308] border border-[#EAB308]/30">
                    Coming Soon
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Local craft material & labor rate estimation engine arrives in Stage 5.3. No simulated rates.
                </p>
              </div>

              {/* Placeholder Section 2: Artisans Who Can Make This (Honest Coming Soon) */}
              <div
                className="p-4 rounded-2xl bg-[#170E0A] border border-dashed border-[#3A2A20] space-y-2"
                data-testid="artisans-placeholder-card"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-[#261B15] flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-[#EA580C]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white">Artisans Who Can Make This</h3>
                      <p className="text-[10px] text-slate-400">इसे बनाने वाले कारीगर</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#261B15] text-[#EA580C] border border-[#EA580C]/30">
                    Coming Soon
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  PostGIS geolocation craft matching with verified nearby artisans arrives in Stage 5.4.
                </p>
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 space-y-2">
                {onTryAnother && (
                  <button
                    onClick={onTryAnother}
                    type="button"
                    data-testid="try-another-button"
                    className="w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#EA580C] to-[#F97316] text-white text-xs font-extrabold flex items-center justify-center space-x-2 shadow-lg shadow-[#EA580C]/20 active:scale-[0.98] transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try another photo / दूसरी तस्वीर चुनें</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  type="button"
                  data-testid="done-button"
                  className="w-full min-h-[48px] py-2.5 rounded-xl bg-[#1A120E] hover:bg-[#251A14] border border-[#2A1E17] text-slate-300 hover:text-white text-xs font-bold active:scale-[0.98] transition-all"
                >
                  Done / पूरा हुआ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
