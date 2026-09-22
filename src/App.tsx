import { useState, useEffect } from 'react';
import type { AppMode, LocationPin, Artisan, Product, ProductItem } from './types';
import { NASHIK_LOCALITIES, MOCK_ARTISANS } from './data/mockData';
import { FindLocalArtisansPage } from './components/FindLocalArtisansPage';
import { CustomRequestBuilder } from './components/CustomRequestBuilder';
import { ArtisanStorefront } from './components/ArtisanStorefront';
import { MilestoneTracker } from './components/MilestoneTracker';

import { ArtisanPortal } from './components/ArtisanPortal';
import { WorkshopReelModal } from './components/WorkshopReelModal';
import { ArtisanProduct3DEditor } from './components/ArtisanProduct3DEditor';
import { MaterialProvider } from './context/MaterialContext';
import { KaragirStoreProvider } from './context/KaragirStoreContext';
import { KaragirAuthModal } from './components/KaragirAuthModal';
import { CreateStoreWizard } from './components/CreateStoreWizard';
import { EscrowProvider } from './context/EscrowContext';

import { MobileAppShell } from './components/mobile/MobileAppShell';
import { MobileHome } from './components/mobile/MobileHome';
import { MobileStatusBar } from './components/mobile/MobileStatusBar';
import { DatasetCollector } from './components/dev/DatasetCollector';

function AppContent() {
  const [mode, setMode] = useState<AppMode>('buyer');
  const [activeTab, setActiveTab] = useState<string>('find-artisans');
  const [selectedLocation, setSelectedLocation] = useState<LocationPin>(NASHIK_LOCALITIES[0]);
  const [selectedArtisan, setSelectedArtisan] = useState<Artisan>(MOCK_ARTISANS[0]);
  const [activeReelArtisan, setActiveReelArtisan] = useState<Artisan | null>(null);
  const [selectedProductForCustomization, setSelectedProductForCustomization] = useState<Product | ProductItem | null>(null);

  // Dev-only route detection: e.g. /dev/dataset-collector or #/dev/dataset-collector
  const [isDevDatasetCollector, setIsDevDatasetCollector] = useState<boolean>(() => {
    if (!import.meta.env.DEV) return false;
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return path.includes('/dev/dataset-collector') || hash.includes('/dev/dataset-collector');
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      setIsDevDatasetCollector(
        path.includes('/dev/dataset-collector') || hash.includes('/dev/dataset-collector')
      );
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  if (import.meta.env.DEV && isDevDatasetCollector) {
    return (
      <div className="min-h-screen bg-[#0A0604] text-white flex flex-col items-center justify-center selection:bg-[#EA580C] selection:text-white w-full sm:py-4">
        {/* Smartphone Chassis Screen Container */}
        <div className="w-full max-w-[430px] h-[100dvh] sm:h-[92vh] sm:max-h-[890px] bg-[#120B08] flex flex-col relative sm:rounded-[44px] sm:border-[7px] sm:border-[#2A1E17] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_rgba(234,88,12,0.18)] overflow-hidden">
          <MobileStatusBar />
          <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar relative">
            <DatasetCollector
              onBack={() => {
                window.history.pushState(null, '', '/');
                setIsDevDatasetCollector(false);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  const handleSelectArtisan = (artisan: Artisan) => {
    setSelectedArtisan(artisan);
    setActiveTab('artisan-storefront');
  };

  return (
    <MaterialProvider>
      <MobileAppShell
        mode={mode}
        onModeChange={(newMode) => {
          setMode(newMode);
          if (newMode === 'artisan') {
            setActiveTab('artisan-portal');
          } else {
            setActiveTab('find-artisans');
          }
        }}
        selectedLocation={selectedLocation}
        onLocationChange={setSelectedLocation}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeReelArtisan={activeReelArtisan}
        onCloseReel={() => setActiveReelArtisan(null)}
      >
        <main className="w-full mx-auto overflow-x-hidden">
          {mode === 'buyer' && (
            <>
              {activeTab === 'find-artisans' && (
                <MobileHome
                  selectedLocation={selectedLocation}
                  onSelectArtisan={handleSelectArtisan}
                  onOpenCustomBuilder={() => setActiveTab('custom-request')}
                  onOpenReel={(artisan) => setActiveReelArtisan(artisan)}
                  onOpenExplore={() => setActiveTab('find-local-artisans')}
                />
              )}

              {activeTab === 'find-local-artisans' && (
                <div className="px-3 pt-2">
                  <FindLocalArtisansPage
                    onBackToHome={() => setActiveTab('find-artisans')}
                    onSelectArtisanStorefront={(regionalArtisan) => {
                      const convertedArtisan: Artisan = {
                        id: regionalArtisan.id,
                        name: regionalArtisan.name,
                        shopName: regionalArtisan.shopName,
                        experienceYears: regionalArtisan.experienceYears,
                        rating: regionalArtisan.rating,
                        reviewsCount: 150,
                        isVerified: regionalArtisan.isVerified,
                        avatarUrl: regionalArtisan.image,
                        coverUrl: regionalArtisan.image,
                        locality: regionalArtisan.area,
                        pincode: regionalArtisan.pincode,
                        distanceKm: 2.5,
                        lat: regionalArtisan.lat,
                        lng: regionalArtisan.lng,
                        crafts: ['Woodwork'],
                        specialties: [regionalArtisan.craftCategory],
                        responseTime: '~2 hours',
                        completedOrdersCount: 100,
                        bio: regionalArtisan.bio
                      };
                      setSelectedArtisan(convertedArtisan);
                      setActiveTab('artisan-storefront');
                    }}
                  />
                </div>
              )}

              {activeTab === 'custom-request' && (
                <div className="px-3 pt-2">
                  <CustomRequestBuilder
                    selectedLocation={selectedLocation}
                    onSubmitSuccess={() => setActiveTab('milestone-tracker')}
                    onBack={() => setActiveTab('find-artisans')}
                  />
                </div>
              )}

              {activeTab === 'artisan-storefront' && (
                <div className="px-3 pt-2">
                  <ArtisanStorefront
                    artisan={selectedArtisan}
                    onOpenReel={(artisan) => setActiveReelArtisan(artisan)}
                    onCustomizeProduct={(product) => {
                      setSelectedProductForCustomization(product);
                      setActiveTab('customize-artisan-item');
                    }}
                    onBack={() => setActiveTab('find-artisans')}
                  />
                </div>
              )}

              {activeTab === 'customize-artisan-item' && (
                <div className="px-3 pt-2">
                  <button
                    onClick={() => setActiveTab('artisan-storefront')}
                    className="mb-3 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#1A120E] hover:bg-[#261B15] text-slate-200 hover:text-white border border-[#2A1E17] text-xs font-bold transition-all shadow"
                  >
                    <span>← Back to Workshop</span>
                  </button>
                  <ArtisanProduct3DEditor 
                    artisan={selectedArtisan} 
                    product={selectedProductForCustomization}
                  />
                </div>
              )}

              {activeTab === 'milestone-tracker' && (
                <div className="px-3 pt-2">
                  <MilestoneTracker
                    onBack={() => setActiveTab('find-artisans')}
                  />
                </div>
              )}
            </>
          )}

          {mode === 'artisan' && (
            <>
              {activeTab === 'artisan-portal' && (
                <div className="px-3 pt-2">
                  <ArtisanPortal
                    onBackToBuyer={() => {
                      setMode('buyer');
                      setActiveTab('find-artisans');
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* Global Modals */}
          <KaragirAuthModal />
          <CreateStoreWizard />
        </main>
        {/* Workshop Reel Video Overlay Modal */}
        {activeReelArtisan && (
          <WorkshopReelModal
            artisan={activeReelArtisan}
            onClose={() => setActiveReelArtisan(null)}
          />
        )}
      </MobileAppShell>
    </MaterialProvider>
  );
}

export function App() {
  return (
    <EscrowProvider>
      <KaragirStoreProvider>
        <AppContent />
      </KaragirStoreProvider>
    </EscrowProvider>
  );
}

export default App;
