import { useState } from 'react';
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

function AppContent() {
  const [mode, setMode] = useState<AppMode>('buyer');
  const [activeTab, setActiveTab] = useState<string>('find-artisans');
  const [selectedLocation, setSelectedLocation] = useState<LocationPin>(NASHIK_LOCALITIES[0]);
  const [selectedArtisan, setSelectedArtisan] = useState<Artisan>(MOCK_ARTISANS[0]);
  const [activeReelArtisan, setActiveReelArtisan] = useState<Artisan | null>(null);
  const [selectedProductForCustomization, setSelectedProductForCustomization] = useState<Product | ProductItem | null>(null);

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
        <main className="w-full mx-auto">
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
                <div className="pb-20 px-2 pt-2">
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
                <div className="pb-20 px-3 pt-3">
                  <CustomRequestBuilder
                    selectedLocation={selectedLocation}
                    onSubmitSuccess={() => setActiveTab('milestone-tracker')}
                    onBack={() => setActiveTab('find-artisans')}
                  />
                </div>
              )}

              {activeTab === 'artisan-storefront' && (
                <div className="pb-20 px-3 pt-3">
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
                <div className="pb-20 px-3 pt-3">
                  <button
                    onClick={() => setActiveTab('artisan-storefront')}
                    className="mb-4 inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#1F1510] hover:bg-[#261B15] text-slate-200 hover:text-white border border-[#3E2E24] text-xs font-bold transition-all shadow-md group"
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
                <div className="pb-20 px-3 pt-3">
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
                <div className="pb-20 px-3 pt-3">
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

          {/* Global Modals (Auth & Setup Wizards) */}
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
