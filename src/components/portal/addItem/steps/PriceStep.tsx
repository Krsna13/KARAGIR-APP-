import React, { useState, useEffect } from 'react';
import { IndianRupee, Sparkles, Globe, Edit2 } from 'lucide-react';
import type { ProductRecord } from '../../../../types/product';

interface PriceStepProps {
  productId: string;
  draft: ProductRecord;
  speakingLanguage?: string | null;
  onDraftPatch: (patch: Partial<ProductRecord>) => void;
}

export const PriceStep: React.FC<PriceStepProps> = ({
  draft,
  speakingLanguage,
  onDraftPatch,
}) => {
  const [manualPrice, setManualPrice] = useState<string>(
    draft.price ? String(draft.price) : ''
  );

  const lang = speakingLanguage === 'mr' ? 'mr' : speakingLanguage === 'en' ? 'en' : 'hi';

  const onlinePrice = 1000;
  const suggestedPrice = 900;

  const handleSelectPrice = (price: number) => {
    setManualPrice(String(price));
    onDraftPatch({ price });
  };

  const handleManualPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setManualPrice(val);
    if (val) {
      onDraftPatch({ price: parseInt(val, 10) });
    } else {
      onDraftPatch({ price: null });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="space-y-2 text-center">
        <h3 className="text-xl font-extrabold text-white">
          {lang === 'mr' ? 'किंमत निश्चित करा' : lang === 'hi' ? 'कीमत तय करें' : 'Set Price'}
        </h3>
        <p className="text-sm text-slate-400">
          {lang === 'mr'
            ? 'मटेरियल आणि ऑनलाईन किमतीनुसार आम्ही तुम्हाला काही पर्याय सुचवत आहोत.'
            : lang === 'hi'
            ? 'मटेरियल और ऑनलाइन कीमत के अनुसार हम आपको कुछ विकल्प सुझा रहे हैं।'
            : 'We are suggesting prices based on material and online market rates.'}
        </p>
      </div>

      <div className="space-y-4">
        {/* Suggested Price Card */}
        <button
          type="button"
          onClick={() => handleSelectPrice(suggestedPrice)}
          className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between group ${
            draft.price === suggestedPrice
              ? 'bg-[#EA580C]/10 border-[#EA580C]'
              : 'bg-[#120B08] border-[#2A1E17] hover:border-[#EA580C]/50'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              draft.price === suggestedPrice ? 'bg-[#EA580C] text-white' : 'bg-[#1A120E] text-[#EA580C] group-hover:bg-[#EA580C]/20'
            }`}>
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-white font-bold text-lg flex items-center gap-1">
                <IndianRupee className="w-4 h-4" /> {suggestedPrice}
              </p>
              <p className="text-xs text-slate-400">
                {lang === 'mr' ? 'मटेरियल नुसार योग्य किंमत' : lang === 'hi' ? 'सामग्री के अनुसार सही कीमत' : 'Suggested (Based on Material)'}
              </p>
            </div>
          </div>
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            draft.price === suggestedPrice ? 'border-[#EA580C] bg-[#EA580C]' : 'border-slate-600'
          }`}>
            {draft.price === suggestedPrice && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
          </div>
        </button>

        {/* Online Price Card */}
        <button
          type="button"
          onClick={() => handleSelectPrice(onlinePrice)}
          className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between group ${
            draft.price === onlinePrice
              ? 'bg-blue-500/10 border-blue-500'
              : 'bg-[#120B08] border-[#2A1E17] hover:border-blue-500/50'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              draft.price === onlinePrice ? 'bg-blue-500 text-white' : 'bg-[#1A120E] text-blue-500 group-hover:bg-blue-500/20'
            }`}>
              <Globe className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="text-white font-bold text-lg flex items-center gap-1">
                <IndianRupee className="w-4 h-4" /> {onlinePrice}
              </p>
              <p className="text-xs text-slate-400">
                {lang === 'mr' ? 'ऑनलाईन बाजार भाव' : lang === 'hi' ? 'ऑनलाइन बाज़ार मूल्य' : 'Online Market Price'}
              </p>
            </div>
          </div>
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            draft.price === onlinePrice ? 'border-blue-500 bg-blue-500' : 'border-slate-600'
          }`}>
            {draft.price === onlinePrice && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
          </div>
        </button>

        {/* Manual Price Card */}
        <div className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
          draft.price !== suggestedPrice && draft.price !== onlinePrice && manualPrice !== ''
            ? 'bg-emerald-500/10 border-emerald-500'
            : 'bg-[#120B08] border-[#2A1E17] focus-within:border-emerald-500/50'
        }`}>
          <div className="flex items-center gap-4 flex-1">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              draft.price !== suggestedPrice && draft.price !== onlinePrice && manualPrice !== ''
                ? 'bg-emerald-500 text-white' : 'bg-[#1A120E] text-emerald-500'
            }`}>
              <Edit2 className="w-6 h-6" />
            </div>
            <div className="text-left flex-1">
              <div className="relative flex items-center">
                <IndianRupee className="w-5 h-5 text-slate-400 absolute left-3" />
                <input
                  type="text"
                  inputMode="numeric"
                  value={manualPrice}
                  onChange={handleManualPriceChange}
                  placeholder={lang === 'mr' ? 'स्वतःची किंमत टाका' : lang === 'hi' ? 'अपनी कीमत दर्ज करें' : 'Enter custom price'}
                  className="w-full bg-[#1A120E] border border-[#2A1E17] text-white text-lg font-bold rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 ml-1">
                {lang === 'mr' ? 'किंवा तुमची स्वतःची किंमत ठरवा' : lang === 'hi' ? 'या अपनी खुद की कीमत तय करें' : 'Or set your own custom price'}
              </p>
            </div>
          </div>
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ml-4 ${
            draft.price !== suggestedPrice && draft.price !== onlinePrice && manualPrice !== ''
              ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600'
          }`}>
            {draft.price !== suggestedPrice && draft.price !== onlinePrice && manualPrice !== '' && (
              <div className="w-2.5 h-2.5 bg-white rounded-full" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
