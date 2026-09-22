import React, { useState } from 'react';
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

export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  mode,
  onModeChange,
  selectedLocation,
  onLocationChange,
  activeTab,
  onTabChange,
  children,
}) => {
  const [isLocationSheetOpen, setIsLocationSheetOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0604] text-white flex flex-col items-center justify-center selection:bg-[#EA580C] selection:text-white w-full sm:py-4">
      
      {/* Smartphone Chassis Screen Container */}
      <div className="w-full max-w-[430px] h-[100dvh] sm:h-[92vh] sm:max-h-[890px] bg-[#120B08] flex flex-col relative sm:rounded-[44px] sm:border-[7px] sm:border-[#2A1E17] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_rgba(234,88,12,0.18)] overflow-hidden">
        
        {/* Mobile Status Bar (Android Clock, 5G, Battery, Punchhole) */}
        <MobileStatusBar />

        {/* Mobile Top App Bar (Logo, Locality Dropdown trigger, Mode Switch) */}
        <MobileHeader
          mode={mode}
          onModeChange={onModeChange}
          selectedLocation={selectedLocation}
          onOpenLocationSheet={() => setIsLocationSheetOpen(true)}
        />

        {/* Scrollable Mobile Screen Content (Takes available height between top and bottom nav) */}
        <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar relative px-1">
          {children}
        </div>

        {/* Mobile Bottom Navigation Bar (Pinned at bottom of screen) */}
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
  );
};
