import React from 'react';
import { useMaterial } from '../context/MaterialContext';
import { BASE_MATERIAL_PRICE_DELTAS, ORGANIC_FINISH_OPTIONS } from '../data/materialsMasterDatabase';
import type { Product } from '../types';
import { ShieldCheck, Sparkles, Check } from 'lucide-react';


interface ProductMaterialCustomizerProps {
  product: Product;
  onOpenMultiMaterialAddon: () => void;
}

export const ProductMaterialCustomizer: React.FC<ProductMaterialCustomizerProps> = ({
  product,
  onOpenMultiMaterialAddon,
}) => {
  const {
    selectedPrimaryMaterial,
    setPrimaryMaterial,
    selectedAccentMaterials,
    selectedFinish,
    setFinish,
    calculateAdjustedPrice,
  } = useMaterial();

  const hasPrice = product.price != null && product.price > 0;
  const adjustedPrice = hasPrice ? calculateAdjustedPrice(product.price) : null;

  return (
    <div className="bg-[#1F1510] border border-[#2A1E17] rounded-3xl p-6 space-y-6 shadow-2xl">
      
      {/* 1. High-Contrast Raw Material Composition Badge */}
      <div className="p-4 rounded-2xl bg-[#120B08] border border-emerald-900/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Raw Material Composition Locked</span>
          </span>
          <span className="text-[10px] text-amber-400 font-mono bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-800">
            Grade-A Certified
          </span>
        </div>

        <div className="text-xs text-slate-300 space-y-1 pt-1">
          <p>
            <strong className="text-white">Primary Timber:</strong>{' '}
            <span className="text-[#EA580C] font-semibold">{selectedPrimaryMaterial}</span>
          </p>
          <p>
            <strong className="text-white">Secondary Inlays:</strong>{' '}
            <span className="text-slate-300">
              {selectedAccentMaterials.length > 0 ? selectedAccentMaterials.join(', ') : 'None'}
            </span>
          </p>
          <p>
            <strong className="text-white">Organic Polish:</strong>{' '}
            <span className="text-slate-400">{selectedFinish}</span>
          </p>
        </div>
      </div>

      {/* 2. Interactive Base Material Switcher */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Select Primary Base Material:
          </label>
          <span className="text-[11px] text-slate-400 font-mono">Live Price Recalculation</span>
        </div>

        <div className="space-y-2">
          {Object.entries(BASE_MATERIAL_PRICE_DELTAS).map(([materialName, meta]) => {
            const isSelected = selectedPrimaryMaterial === materialName;
            return (
              <button
                key={materialName}
                onClick={() => setPrimaryMaterial(materialName)}
                className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-[#EA580C]/20 border border-[#EA580C] text-white font-semibold shadow-md'
                    : 'bg-[#120B08] border border-[#2A1E17] text-slate-400 hover:border-[#3E2E24] hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-[#EA580C] bg-[#EA580C]' : 'border-slate-600 bg-transparent'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span>{materialName}</span>
                </div>

                <span className={`text-[11px] font-mono ${isSelected ? 'text-[#EAB308] font-bold' : 'text-slate-500'}`}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Surface Finishes Selector */}
      <div className="space-y-3 pt-2 border-t border-[#2A1E17]">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
          Organic Surface Finish & Oils:
        </label>
        <div className="space-y-2">
          {ORGANIC_FINISH_OPTIONS.map((finishOpt) => {
            const isSelected = selectedFinish === finishOpt.label;
            return (
              <button
                key={finishOpt.id}
                onClick={() => setFinish(finishOpt.label)}
                className={`w-full text-left p-3 rounded-2xl text-xs transition-all border ${
                  isSelected
                    ? 'bg-[#EA580C]/15 border-[#EA580C] text-white font-medium shadow-sm'
                    : 'bg-[#120B08] border-[#2A1E17] text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-white">{finishOpt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#EA580C]" />}
                </div>
                <p className="text-[10px] text-slate-400">{finishOpt.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Multi-Material Add-on Trigger CTA */}
      <div className="pt-3 space-y-3 border-t border-[#2A1E17]">
        <button
          onClick={onOpenMultiMaterialAddon}
          className="w-full py-3 rounded-2xl bg-[#120B08] hover:bg-[#261B15] text-[#EA580C] text-xs font-bold border border-[#EA580C]/50 transition-all flex items-center justify-center space-x-2 shadow-md hover:border-[#EA580C]"
        >
          <Sparkles className="w-4 h-4 text-[#EA580C]" />
          <span>+ Layer Accent Materials (Brass Inlay, Gold Vark, Bone)</span>
        </button>

        {/* Dynamic Adjusted Price Card */}
        <div className="p-3.5 rounded-2xl bg-[#120B08] border border-[#2A1E17] flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Calculated Custom Price</span>
            {adjustedPrice != null ? (
              <span className="text-2xl font-extrabold text-[#EAB308] font-mono">
                ₹{adjustedPrice.toLocaleString('en-IN')}
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-500/90 pt-1 block">
                Price not set / कीमत तय नहीं
              </span>
            )}
          </div>
          {hasPrice && (
            <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-800">
              Escrow Price Locked
            </span>
          )}
        </div>
      </div>

    </div>
  );
};
