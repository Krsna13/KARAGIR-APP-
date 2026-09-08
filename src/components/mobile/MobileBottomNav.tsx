import React from 'react';
import { Home, Compass, Sparkles, CheckCircle2, Store } from 'lucide-react';
import type { AppMode } from '../../types';

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  mode,
  onModeChange,
}) => {
  const isHomeActive = activeTab === 'find-artisans';
  const isExploreActive = activeTab === 'find-local-artisans';
  const isCraftActive = activeTab === 'custom-request' || activeTab === 'artisan-storefront' || activeTab === 'customize-artisan-item';
  const isOrdersActive = activeTab === 'milestone-tracker';
  const isPortalActive = activeTab === 'artisan-portal';

  const handleNavClick = (tab: string, targetMode: AppMode = 'buyer') => {
    if (mode !== targetMode) {
      onModeChange(targetMode);
    }
    onTabChange(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav className="sticky bottom-0 w-full z-[1000] bg-[#120B08]/95 backdrop-blur-xl border-t border-[#2A1E17] px-2 py-1.5 shadow-2xl safe-area-bottom shrink-0">
      <div className="w-full flex items-center justify-around relative">
        
        {/* Tab 1: Home */}
        <button
          onClick={() => handleNavClick('find-artisans', 'buyer')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative ${
            isHomeActive
              ? 'text-[#EA580C]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className={`w-5 h-5 transition-transform ${isHomeActive ? 'scale-110 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-bold mt-1 tracking-tight">Home</span>
          {isHomeActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] absolute bottom-0 shadow-sm glow-dot" />
          )}
        </button>

        {/* Tab 2: Explore / Artisans */}
        <button
          onClick={() => handleNavClick('find-local-artisans', 'buyer')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative ${
            isExploreActive
              ? 'text-[#EA580C]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className={`w-5 h-5 transition-transform ${isExploreActive ? 'scale-110 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-bold mt-1 tracking-tight">Explore</span>
          {isExploreActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] absolute bottom-0 shadow-sm glow-dot" />
          )}
        </button>

        {/* Tab 3 (CENTER FAB): Craft Copilot AI & 3D */}
        <div className="relative -top-4 flex flex-col items-center">
          <button
            onClick={() => handleNavClick('custom-request', 'buyer')}
            className={`w-13 h-13 rounded-full bg-gradient-to-tr from-[#EA580C] via-[#F97316] to-[#EAB308] p-0.5 shadow-lg active:scale-95 transition-all flex items-center justify-center group ${
              isCraftActive ? 'ring-4 ring-[#EA580C]/40 ring-offset-2 ring-offset-[#120B08]' : ''
            }`}
            title="Create Bespoke Request with Craft Copilot"
          >
            <div className="w-full h-full rounded-full bg-gradient-to-br from-[#EA580C] to-[#C2410C] flex items-center justify-center text-white shadow-inner group-hover:brightness-110">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
          </button>
          <span
            className={`text-[10px] font-extrabold mt-0.5 tracking-tight ${
              isCraftActive ? 'text-[#EA580C]' : 'text-slate-300'
            }`}
          >
            Craft AI
          </span>
        </div>

        {/* Tab 4: Orders / Milestones */}
        <button
          onClick={() => handleNavClick('milestone-tracker', 'buyer')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative ${
            isOrdersActive
              ? 'text-[#EA580C]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <CheckCircle2 className={`w-5 h-5 transition-transform ${isOrdersActive ? 'scale-110 stroke-[2.5]' : ''}`} />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-[#120B08]" />
          </div>
          <span className="text-[10px] font-bold mt-1 tracking-tight">Orders</span>
          {isOrdersActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] absolute bottom-0 shadow-sm glow-dot" />
          )}
        </button>

        {/* Tab 5: Artisan Portal */}
        <button
          onClick={() => handleNavClick('artisan-portal', 'artisan')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all relative ${
            isPortalActive
              ? 'text-[#EA580C]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Store className={`w-5 h-5 transition-transform ${isPortalActive ? 'scale-110 stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-bold mt-1 tracking-tight">Portal</span>
          {isPortalActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] absolute bottom-0 shadow-sm glow-dot" />
          )}
        </button>

      </div>
    </nav>
  );
};
