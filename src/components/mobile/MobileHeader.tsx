import React, { useState } from 'react';
import { Hammer, MapPin, ChevronDown, ShieldCheck } from 'lucide-react';
import type { AppMode, LocationPin } from '../../types';
import { useKaragirStore } from '../../context/KaragirStoreContext';

interface MobileHeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  selectedLocation: LocationPin;
  onOpenLocationSheet: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  mode,
  onModeChange,
  selectedLocation,
  onOpenLocationSheet,
}) => {
  const [isHammerAnimating, setIsHammerAnimating] = useState(false);
  const { storeData, setIsAuthModalOpen } = useKaragirStore();

  const handleHammerClick = () => {
    setIsHammerAnimating(true);
    setTimeout(() => setIsHammerAnimating(false), 550);
  };

  const handleToggleMode = () => {
    if (mode === 'buyer') {
      if (!storeData) {
        setIsAuthModalOpen(true);
        return;
      }
      onModeChange('artisan');
    } else {
      onModeChange('buyer');
    }
  };

  return (
    <header className="sticky top-0 z-[1000] bg-[#120B08]/95 backdrop-blur-md border-b border-[#2A1E17] px-3.5 py-2.5 flex items-center justify-between shadow-md">
      {/* Brand & Animated Hammer */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleHammerClick}
          className="flex items-center space-x-2 text-left group focus:outline-none"
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-[#1F1510] border border-[#2A1E17] shadow-sm">
            <Hammer
              className={`w-4 h-4 text-[#EA580C] transition-transform ${
                isHammerAnimating ? 'animate-hammer' : ''
              }`}
            />
          </div>
          <div className="flex items-baseline">
            <span
              className={`text-lg font-black tracking-tight text-white ${
                isHammerAnimating ? 'animate-squishy' : ''
              }`}
            >
              karagir
            </span>
            <span className="w-2 h-2 rounded-full bg-[#EA580C] glow-dot ml-0.5 inline-block"></span>
          </div>
        </button>
      </div>

      {/* Center Location Pill */}
      <button
        onClick={onOpenLocationSheet}
        className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-[#1F1510] border border-[#2A1E17] text-[11px] font-medium text-slate-200 hover:border-[#EA580C]/60 active:scale-95 transition-all shadow-inner max-w-[140px] truncate"
      >
        <MapPin className="w-3 h-3 text-[#EA580C] shrink-0" />
        <span className="truncate">{selectedLocation.locality}</span>
        <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
      </button>

      {/* Right Controls: Mode Switcher & Avatar */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleToggleMode}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
            mode === 'artisan'
              ? 'bg-[#EA580C] text-white border-[#EA580C] shadow-sm'
              : 'bg-[#1F1510] text-slate-300 border-[#2A1E17] hover:border-slate-500'
          }`}
          title={mode === 'buyer' ? 'Switch to Artisan Portal' : 'Switch to Buyer Mode'}
        >
          {mode === 'artisan' ? (
            <>
              <ShieldCheck className="w-3 h-3" />
              <span>Artisan</span>
            </>
          ) : (
            <span>Buyer</span>
          )}
        </button>

        {/* User Avatar */}
        <div className="relative w-8 h-8 rounded-full bg-gradient-to-tr from-[#EA580C] to-[#EAB308] p-0.5 shrink-0">
          <img
            src={
              mode === 'buyer'
                ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200'
                : 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&q=80&w=200'
            }
            alt="User"
            className="w-full h-full rounded-full object-cover"
          />
          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border-2 border-[#120B08]" />
        </div>
      </div>
    </header>
  );
};
