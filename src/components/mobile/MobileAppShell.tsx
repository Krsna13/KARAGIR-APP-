import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, RotateCw } from 'lucide-react';
import { MobileStatusBar } from './MobileStatusBar';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileLocationSheet } from './MobileLocationSheet';
import type { AppMode, LocationPin, Artisan } from '../../types';

interface MobileAppShellProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  selectedLocation: LocationPin;
  onLocationChange: (loc: LocationPin) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  activeReelArtisan: Artisan | null;
  onCloseReel: () => void;
  children: React.ReactNode;
}

export type ViewportMode = 'phone' | 'phone-wide' | 'fullscreen';

export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  mode,
  onModeChange,
  selectedLocation,
  onLocationChange,
  activeTab,
  onTabChange,
  children,
}) => {
  const [viewportMode, setViewportMode] = useState<ViewportMode>('phone');
  const [isLocationSheetOpen, setIsLocationSheetOpen] = useState(false);
  const [isNativeMobile, setIsNativeMobile] = useState(false);

  // Detect if actually running on a mobile device or narrow screen
  useEffect(() => {
    const checkWidth = () => {
      setIsNativeMobile(window.innerWidth < 768);
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  const getContainerWidth = () => {
    if (isNativeMobile || viewportMode === 'fullscreen') return 'w-full max-w-full';
    if (viewportMode === 'phone-wide') return 'w-full max-w-[480px]';
    return 'w-full max-w-[420px]'; // standard Android flagship (iQOO 12 / Galaxy / Pixel)
  };

  return (
    <div className="min-h-screen bg-[#0A0604] text-white flex flex-col items-center justify-start selection:bg-[#EA580C] selection:text-white">
      
      {/* Top Device Switcher Bar (Visible on Desktop / Tablets) */}
      {!isNativeMobile && (
        <div className="w-full bg-[#160E0A] border-b border-[#2A1E17] py-2 px-4 flex items-center justify-between z-[1100] shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-ping" />
            <span className="text-xs font-black text-white uppercase tracking-wider">
              iQOO Hackathon • Mobile App Preview
            </span>
            <span className="text-[10px] bg-[#261B15] text-[#EA580C] font-mono px-2 py-0.5 rounded border border-[#EA580C]/40">
              Android Layout
            </span>
          </div>

          <div className="flex items-center space-x-1.5 bg-[#1F1510] p-1 rounded-xl border border-[#2A1E17]">
            <button
              onClick={() => setViewportMode('phone')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewportMode === 'phone'
                  ? 'bg-[#EA580C] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Standard Smartphone (420px)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>iQOO Phone</span>
            </button>

            <button
              onClick={() => setViewportMode('phone-wide')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewportMode === 'phone-wide'
                  ? 'bg-[#EA580C] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Phablet (480px)"
            >
              <Smartphone className="w-3.5 h-3.5 rotate-90" />
              <span>Plus (480px)</span>
            </button>

            <button
              onClick={() => setViewportMode('fullscreen')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                viewportMode === 'fullscreen'
                  ? 'bg-[#EA580C] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Full Width Responsive"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Full Screen</span>
            </button>
          </div>
        </div>
      )}

      {/* Main App Container (Simulated phone chassis on desktop, 100% full screen on real mobile) */}
      <div className={`flex-1 flex flex-col items-center justify-start w-full ${!isNativeMobile && viewportMode !== 'fullscreen' ? 'py-6' : ''}`}>
        
        <div
          className={`${getContainerWidth()} bg-[#120B08] flex flex-col transition-all duration-300 relative ${
            !isNativeMobile && viewportMode !== 'fullscreen'
              ? 'rounded-[44px] border-[8px] border-[#2A1E17] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_rgba(234,88,12,0.15)] min-h-[850px] max-h-[92vh] overflow-hidden'
              : 'min-h-screen w-full'
          }`}
        >
          {/* Mobile Status Bar (Android Clock, 5G, Battery, Camera Punchhole) */}
          <MobileStatusBar />

          {/* Mobile Top App Bar (Logo, Locality Dropdown trigger, Mode Switch) */}
          <MobileHeader
            mode={mode}
            onModeChange={onModeChange}
            selectedLocation={selectedLocation}
            onOpenLocationSheet={() => setIsLocationSheetOpen(true)}
          />

          {/* Scrollable Mobile Screen Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar relative">
            {children}
          </div>

          {/* Mobile Bottom Navigation Bar (5-tab navigation with Craft FAB) */}
          <MobileBottomNav
            activeTab={activeTab}
            onTabChange={onTabChange}
            mode={mode}
            onModeChange={onModeChange}
          />

          {/* Mobile Location Picker Bottom Sheet */}
          <MobileLocationSheet
            isOpen={isLocationSheetOpen}
            onClose={() => setIsLocationSheetOpen(false)}
            selectedLocation={selectedLocation}
            onSelectLocation={onLocationChange}
          />
        </div>

      </div>

    </div>
  );
};
