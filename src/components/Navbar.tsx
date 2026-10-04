import React, { useState, useEffect, useRef } from 'react';
import { Hammer, MapPin, ChevronDown, ShieldCheck, Layers, Compass, Hammer as HammerIcon, CheckCircle2 } from 'lucide-react';
import { useKaragirStore } from '../context/KaragirStoreContext';
import type { AppMode, LocationPin } from '../types';
import { NASHIK_LOCALITIES } from '../data/mockData';
import { isDemoMode } from '../config/demoMode';

interface NavbarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  selectedLocation: LocationPin;
  onLocationChange: (loc: LocationPin) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  mode,
  onModeChange,
  selectedLocation,
  onLocationChange,
  activeTab,
  onTabChange,
}) => {
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [isHammerAnimating, setIsHammerAnimating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { storeData, setIsAuthModalOpen } = useKaragirStore();

  const handleHammerClick = () => {
    setIsHammerAnimating(true);
    setTimeout(() => setIsHammerAnimating(false), 550);
  };

  const handleTabClick = (tab: string) => {
    onTabChange(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleModeSwitch = (targetMode: AppMode) => {
    if (targetMode === 'artisan' && !storeData) {
      setIsAuthModalOpen(true);
      return;
    }
    
    onModeChange(targetMode);
    if (targetMode === 'artisan') {
      onTabChange('artisan-portal');
    } else if (activeTab === 'artisan-portal') {
      onTabChange('find-artisans');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsLocationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-[1000] bg-[#120B08]/90 backdrop-blur-md border-b border-[#2A1E17]">
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-10">

        <div className="flex items-center justify-between h-20">
          
          {/* Left: Brand Logo & Motif */}
          <div className="flex items-center space-x-6">
            <button
              onClick={handleHammerClick}
              className="flex items-center space-x-2.5 text-left group focus:outline-none"
            >
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#1F1510] border border-[#2A1E17] group-hover:border-[#EA580C] transition-all shadow-md">
                <Hammer
                  className={`w-5 h-5 text-[#EA580C] transition-transform ${
                    isHammerAnimating ? 'animate-hammer' : 'group-hover:-rotate-12'
                  }`}
                />
              </div>
              <div>
                <div className="flex items-baseline">
                  <span className={`text-2xl font-extrabold tracking-tight text-white ${isHammerAnimating ? 'animate-squishy' : ''}`}>
                    karagir
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] glow-dot ml-0.5 inline-block"></span>
                </div>
                <p className="text-[10px] text-[#CBD5E1] tracking-wider uppercase font-medium">
                  Local Craft. Masterfully Made.
                </p>
              </div>
            </button>

            {isDemoMode() && (
              <div className="hidden sm:flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                Demo / डेमो
              </div>
            )}

            {/* Location Picker Pill */}
            <div className="relative hidden md:block" ref={dropdownRef}>
              <button
                onClick={() => setIsLocationDropdownOpen(!isLocationDropdownOpen)}
                className="flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#1F1510] border border-[#2A1E17] text-xs font-medium text-slate-200 hover:border-[#EA580C]/50 transition-colors shadow-sm"
              >
                <MapPin className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>{selectedLocation.locality}, Nashik</span>
                <span className="text-[10px] text-slate-400">({selectedLocation.pincode})</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-1 transition-transform ${isLocationDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu floating z-[1100] */}
              {isLocationDropdownOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-[#1F1510] border border-[#3E2E24] rounded-2xl shadow-2xl z-[1100] overflow-hidden py-2 backdrop-blur-xl">
                  <div className="px-3 py-1.5 border-b border-[#2A1E17]">
                    <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Select Target Locality</p>
                  </div>
                  {NASHIK_LOCALITIES.map((loc) => (
                    <button
                      key={loc.pincode}
                      onClick={() => {
                        onLocationChange(loc);
                        setIsLocationDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-left hover:bg-[#261B15] transition-colors ${
                        selectedLocation.pincode === loc.pincode ? 'text-[#EA580C] font-semibold bg-[#261B15]' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <MapPin className={`w-3.5 h-3.5 ${selectedLocation.pincode === loc.pincode ? 'text-[#EA580C]' : 'text-slate-500'}`} />
                        <span>{loc.locality}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">{loc.pincode}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center Navigation Links (Buyer Mode Views) */}
          {mode === 'buyer' && (
            <nav className="hidden lg:flex items-center space-x-1 bg-[#1F1510]/90 p-1.5 rounded-full border border-[#2A1E17] shadow-inner">
              <button
                onClick={() => handleTabClick('find-local-artisans')}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeTab === 'find-local-artisans' || activeTab === 'find-artisans'
                    ? 'bg-[#EA580C] text-white shadow-md glow-orange'
                    : 'text-slate-300 hover:text-white hover:bg-[#261B15]'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Find Artisans</span>
              </button>

              <button
                onClick={() => handleTabClick('custom-request')}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeTab === 'custom-request'
                    ? 'bg-[#EA580C] text-white shadow-md glow-orange'
                    : 'text-slate-300 hover:text-white hover:bg-[#261B15]'
                }`}
              >
                <HammerIcon className="w-3.5 h-3.5" />
                <span>Build Custom Request</span>
              </button>

              <button
                onClick={() => handleTabClick('artisan-storefront')}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeTab === 'artisan-storefront'
                    ? 'bg-[#EA580C] text-white shadow-md glow-orange'
                    : 'text-slate-300 hover:text-white hover:bg-[#261B15]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>3D Storefront</span>
              </button>

              <button
                onClick={() => handleTabClick('milestone-tracker')}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeTab === 'milestone-tracker'
                    ? 'bg-[#EA580C] text-white shadow-md glow-orange'
                    : 'text-slate-300 hover:text-white hover:bg-[#261B15]'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Milestone Tracker</span>
              </button>
            </nav>
          )}

          {/* Right: Dual-Role Mode Switcher & Profile */}
          <div className="flex items-center space-x-4">
            
            {/* Mode Switcher Toggle */}
            <div className="flex items-center p-1 rounded-full bg-[#1F1510] border border-[#2A1E17] shadow-md">
              <button
                onClick={() => handleModeSwitch('buyer')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  mode === 'buyer'
                    ? 'bg-[#EA580C] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Buyer Mode
              </button>

              <button
                onClick={() => handleModeSwitch('artisan')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center space-x-1 ${
                  mode === 'artisan'
                    ? 'bg-[#EA580C] text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Artisan Portal</span>
              </button>
            </div>

            {/* Profile Avatar */}
            <div className="relative flex items-center space-x-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#EA580C] to-[#EAB308] p-0.5 shadow-md">
                <img
                  src={mode === 'buyer' ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200' : 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?auto=format&fit=crop&q=80&w=200'}
                  alt="User Avatar"
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#120B08]" />
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};
