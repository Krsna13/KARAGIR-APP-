// src/components/dev/DevVoiceInputPage.tsx
// Stage 6.2: Dev-only test page for VoiceInputButton across text, number, dimensions, and choice fields.
// Gated by import.meta.env.DEV, reachable by /dev/voice-input URL only.

import React, { useState } from 'react';
import { ArrowLeft, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';
import { VoiceInputButton } from '../voice/VoiceInputButton';
import type {
  VoiceFieldSpec,
  VoiceDimensionsValue,
  VoiceTextValue,
} from '../../types/voice';
import { SUPPORTED_LANGUAGES } from '../../config/languages';

export interface DevVoiceInputPageProps {
  onBack: () => void;
}

export const DevVoiceInputPage: React.FC<DevVoiceInputPageProps> = ({ onBack }) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('hi');

  // Field 1: Product Name (text)
  const [productName, setProductName] = useState<VoiceTextValue | null>(null);
  const nameFieldSpec: VoiceFieldSpec = {
    key: 'product_name',
    type: 'text',
    question_en: 'What is the name of your craft product?',
    question_hi: 'आपके हस्तशिल्प उत्पाद का क्या नाम है?',
  };

  // Field 2: Price (number)
  const [price, setPrice] = useState<number | null>(null);
  const priceFieldSpec: VoiceFieldSpec = {
    key: 'price',
    type: 'number',
    question_en: 'What is the price of this item in Rupees?',
    question_hi: 'इस वस्तु की कीमत कितने रुपये है?',
    unit_hint: 'INR',
  };

  // Field 3: Size (dimensions)
  const [dimensions, setDimensions] = useState<VoiceDimensionsValue | null>(null);
  const dimensionsFieldSpec: VoiceFieldSpec = {
    key: 'size',
    type: 'dimensions',
    question_en: 'What are the dimensions (length, width, height) of the product?',
    question_hi: 'इस उत्पाद की लंबाई, चौड़ाई और ऊंचाई क्या है?',
  };

  // Field 4: Craft Technique (choice)
  const [technique, setTechnique] = useState<string | null>(null);
  const techniqueFieldSpec: VoiceFieldSpec = {
    key: 'craft_technique',
    type: 'choice',
    question_en: 'Which technique was used to make this item?',
    question_hi: 'इसे बनाने में किस तकनीक का उपयोग किया गया?',
    choices: [
      { id: 'hand-carved', label_en: 'Hand-Carved', label_hi: 'हस्त-नक्काशी' },
      { id: 'hand-woven', label_en: 'Hand-Woven', label_hi: 'हथकरघा बुनाई' },
      { id: 'wheel-thrown', label_en: 'Wheel-Thrown', label_hi: 'चाक पर बना' },
      { id: 'partly-machine', label_en: 'Partly Machine', label_hi: 'आंशिक मशीन' },
    ],
  };

  const handleResetAll = () => {
    setProductName(null);
    setPrice(null);
    setDimensions(null);
    setTechnique(null);
  };

  return (
    <div
      data-testid="dev-voice-input-page"
      className="min-h-full bg-[#120B08] text-stone-100 p-4 sm:p-6 pb-24 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2A1E17] pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="dev-voice-back-button"
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-[#1A120E] border border-[#2A1E17] text-stone-300 hover:text-white flex items-center justify-center active:scale-95 transition-all"
            title="Back / वापस"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wide">
                Voice Input Engine
              </h1>
              <span className="text-[10px] bg-[#EA580C]/20 text-[#EA580C] px-2 py-0.5 rounded-full font-mono font-bold">
                DEV TESTBED
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Stage 6.2 Multimodal Voice & Vernacular Number Parsing
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetAll}
          className="text-xs text-stone-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A120E] border border-[#2A1E17]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* Speaking Language Toggle */}
      <div className="bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-4 space-y-2">
        <label className="text-xs font-semibold text-stone-300 block">
          Speaking Language / बोलने की भाषा:
        </label>
        <div className="grid grid-cols-3 gap-2">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setSelectedLanguage(lang.code)}
              className={`py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                selectedLanguage === lang.code
                  ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-lg shadow-[#EA580C]/20'
                  : 'bg-[#140D09] text-stone-400 border-[#2A1E17] hover:border-stone-700'
              }`}
            >
              <span>{lang.nativeName}</span>
              <span className="text-[10px] opacity-75">({lang.name})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Field 1: Text Field (Product Name) */}
      <div
        data-testid="dev-field-name-card"
        className="bg-[#140D09] border border-[#2A1E17] rounded-3xl p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
              Field 1 • Text Type
            </span>
            <h3 className="text-sm font-bold text-white">
              Product Name / उत्पाद का नाम
            </h3>
            <p className="text-xs text-stone-400">
              Question: "{nameFieldSpec.question_en}"
            </p>
          </div>
          {productName && (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            readOnly
            value={productName ? `${productName.original} (${productName.en})` : ''}
            placeholder="Tap mic and speak product name..."
            className="flex-1 bg-[#1A120E] border border-[#2A1E17] rounded-2xl px-4 py-3 text-sm text-white placeholder-stone-600 focus:outline-none"
          />
          <VoiceInputButton
            field={nameFieldSpec}
            speakingLanguage={selectedLanguage}
            onValueConfirmed={(val: VoiceTextValue) => setProductName(val)}
          />
        </div>
      </div>

      {/* Field 2: Number Field (Price) */}
      <div
        data-testid="dev-field-price-card"
        className="bg-[#140D09] border border-[#2A1E17] rounded-3xl p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
              Field 2 • Number Type
            </span>
            <h3 className="text-sm font-bold text-white">
              Price (INR) / कीमत (रुपये)
            </h3>
            <p className="text-xs text-stone-400">
              Spoken numbers: "do hazaar paanch sau", "dedh sau", "ek lakh", etc.
            </p>
          </div>
          {price !== null && (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            readOnly
            value={price !== null ? `₹${price.toLocaleString('en-IN')}` : ''}
            placeholder="Tap mic and speak price in Rupees..."
            className="flex-1 bg-[#1A120E] border border-[#2A1E17] rounded-2xl px-4 py-3 text-sm text-white placeholder-stone-600 focus:outline-none font-mono"
          />
          <VoiceInputButton
            field={priceFieldSpec}
            speakingLanguage={selectedLanguage}
            onValueConfirmed={(val: number) => setPrice(val)}
          />
        </div>
      </div>

      {/* Field 3: Dimensions Field (Size with partial merging) */}
      <div
        data-testid="dev-field-size-card"
        className="bg-[#140D09] border border-[#2A1E17] rounded-3xl p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
              Field 3 • Dimensions Type
            </span>
            <h3 className="text-sm font-bold text-white">
              Size & Dimensions / आकार और माप
            </h3>
            <p className="text-xs text-stone-400">
              Partial answers prompt for missing dimensions then merge automatically.
            </p>
          </div>
          {dimensions && (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 bg-[#1A120E] border border-[#2A1E17] rounded-2xl px-4 py-3 text-sm text-white font-mono">
            {dimensions ? (
              <span>
                {dimensions.length ?? '?'} × {dimensions.width ?? '?'} ×{' '}
                {dimensions.height ?? '?'} {dimensions.unit || '(no unit)'}
              </span>
            ) : (
              <span className="text-stone-600 font-sans">
                Tap mic and speak dimensions (e.g. 4x2x3 feet)...
              </span>
            )}
          </div>
          <VoiceInputButton
            field={dimensionsFieldSpec}
            speakingLanguage={selectedLanguage}
            onValueConfirmed={(val: VoiceDimensionsValue) => setDimensions(val)}
          />
        </div>
      </div>

      {/* Field 4: Choice Field (Craft Technique) */}
      <div
        data-testid="dev-field-technique-card"
        className="bg-[#140D09] border border-[#2A1E17] rounded-3xl p-5 space-y-3 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
              Field 4 • Choice Type
            </span>
            <h3 className="text-sm font-bold text-white">
              Craft Technique / शिल्प तकनीक
            </h3>
            <p className="text-xs text-stone-400">
              Choices: hand-carved, hand-woven, wheel-thrown, partly-machine
            </p>
          </div>
          {technique && (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 flex flex-wrap gap-1.5 bg-[#1A120E] border border-[#2A1E17] rounded-2xl p-2.5">
            {techniqueFieldSpec.choices?.map((c) => (
              <span
                key={c.id}
                className={`text-xs px-2.5 py-1 rounded-xl border transition-all ${
                  technique === c.id
                    ? 'bg-[#EA580C] text-white border-[#EA580C] font-semibold'
                    : 'bg-[#140D09] text-stone-500 border-[#2A1E17]'
                }`}
              >
                {c.label_en} ({c.label_hi})
              </span>
            ))}
          </div>
          <VoiceInputButton
            field={techniqueFieldSpec}
            speakingLanguage={selectedLanguage}
            onValueConfirmed={(val: string) => setTechnique(val)}
          />
        </div>
      </div>

      {/* Real-time Confirmed State Inspector */}
      <div className="bg-[#1A120E] border border-[#2A1E17] rounded-3xl p-4 space-y-2">
        <span className="text-[11px] font-semibold text-stone-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#EA580C]" />
          Confirmed Form Data (Live State):
        </span>
        <pre
          data-testid="dev-voice-confirmed-json"
          className="text-xs font-mono bg-[#120B08] p-3 rounded-2xl border border-[#2A1E17] text-stone-300 overflow-x-auto"
        >
          {JSON.stringify(
            {
              speaking_language: selectedLanguage,
              product_name: productName,
              price,
              dimensions,
              craft_technique: technique,
            },
            null,
            2
          )}
        </pre>
      </div>
    </div>
  );
};
