import React, { createContext, useContext, useState, useEffect } from 'react';
import type { KaragirStore, WorkItem, ArtisanUser } from '../types';
import * as storageService from '../services/storageService';
import { regionalArtisansDatabase } from '../data/regionalArtisansDatabase';
import { ARTISAN_DATABASE } from '../data/artisanDatabase';

interface KaragirStoreContextType {
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  isWizardOpen: boolean;
  setIsWizardOpen: (open: boolean) => void;
  storeData: KaragirStore | null;
  loginArtisan: (mobile: string, pass: string) => Promise<boolean>;
  registerArtisan: (data: Partial<ArtisanUser>) => Promise<void>;
  saveStoreProfile: (data: Partial<KaragirStore>) => Promise<void>;
  addWorkItem: (item: WorkItem) => Promise<void>;
  logout: () => void;
  allStores: Record<string, KaragirStore>;
}

const KaragirStoreContext = createContext<KaragirStoreContextType | undefined>(undefined);

export const KaragirStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  
  const [allStores] = useState<Record<string, KaragirStore>>({});
  const [storeData, setStoreData] = useState<KaragirStore | null>(null);

  // Note: For now we maintain the local state map, but ideally this is fetched from DB on load
  useEffect(() => {
    // Initial fetch of active session if needed
  }, []);

  const loginArtisan = async (mobile: string, pass: string): Promise<boolean> => {
    let { data, error } = await storageService.login(mobile, pass);

    // Just-in-time registration for mock artisans who exist in static data but not in Supabase Auth yet.
    if (error?.message?.includes('Invalid login credentials')) {
      const mockArtisan = regionalArtisansDatabase.find(a => a.mobileNo === mobile);
      
      const reg = await storageService.register(mobile, pass, mockArtisan?.name || "Mock Artisan");
      if (reg.data && reg.data.user) {
        data = reg.data as typeof data;
        error = null;
        
        // Ensure they have a profile created immediately so they can skip the wizard
        if (mockArtisan) {
          await storageService.registerArtisanProfile({
            id: reg.data.user.id,
            name: mockArtisan.name,
            phone: mockArtisan.mobileNo,
            location: `POINT(${mockArtisan.lng} ${mockArtisan.lat})`,
            address: mockArtisan.address,
            category: mockArtisan.craftCategory,
            shop_name: mockArtisan.shopName,
          });
        }
      }
    }

    // Local Mock Fallback if Supabase Auth completely fails (e.g. rate limit, unsynced DB)
    if (error || !data?.user) {
      const allMocks = [...regionalArtisansDatabase, ...ARTISAN_DATABASE.map(a => ({
        id: a.id,
        name: a.name,
        mobileNo: a.phone,
        shopName: a.shopName || '',
        craftCategory: a.craftSpecialty,
        address: a.location,
        lat: 19.9975,
        lng: 73.7898
      }))];

      const mockFallback = allMocks.find(a => a.mobileNo === mobile);
      if (mockFallback && pass === '123456') {
        const mockStore: KaragirStore = {
          id: mockFallback.id,
          artisanName: mockFallback.name,
          mobile: mockFallback.mobileNo,
          email: '',
          location: mockFallback.address,
          craftSpecialty: mockFallback.craftCategory,
          shopName: mockFallback.shopName,
          shopTagline: 'Quality Craftsman',
          yearsExperience: 10,
          shopAvatar: '',
          shopBanner: '',
          categories: [mockFallback.craftCategory, 'Custom Designs'],
          works: [
            {
              id: 'mock-work-1',
              title: 'Premium Handcrafted Table',
              category: mockFallback.craftCategory,
              coverImage: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=600&q=80',
              galleryImages: [],
              price: 25000,
              material: 'Teak Wood',
              leadTimeDays: 14
            },
            {
              id: 'mock-work-2',
              title: 'Traditional Carved Chair',
              category: 'Custom Designs',
              coverImage: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=600&q=80',
              galleryImages: [],
              price: 12000,
              material: 'Rosewood',
              leadTimeDays: 7
            }
          ],
          rating: 4.8,
          isVerified: true
        };
        setStoreData(mockStore);
        setIsAuthModalOpen(false);
        return true;
      }
      return false;
    }

    // Supabase logic for valid authenticated users
    const profile = await storageService.getArtisanProfile(data.user.id);
    if (profile && profile.shop_name) {
      const store: KaragirStore = {
        id: profile.id,
        artisanName: profile.name,
        mobile: profile.phone,
        email: '',
        location: profile.address || '',
        craftSpecialty: profile.category || '',
        shopName: profile.shop_name,
        shopTagline: '',
        yearsExperience: profile.experience_years ?? 0,
        speakingLanguage: profile.speaking_language || undefined,
        shopAvatar: '',
        shopBanner: '',
        categories: [],
        works: [],
        rating: 5.0,
        isVerified: true
      };
      setStoreData(store);
      setIsAuthModalOpen(false);
      return true;
    } else {
      const newStore: KaragirStore = {
        id: data.user.id,
        artisanName: profile?.name || '',
        mobile: mobile,
        email: '',
        location: '',
        craftSpecialty: '',
        shopName: '',
        shopTagline: '',
        yearsExperience: 0,
        shopAvatar: '',
        shopBanner: '',
        categories: [],
        works: [],
        rating: 5.0,
        isVerified: false,
      };
      setStoreData(newStore);
      setIsAuthModalOpen(false);
      setIsWizardOpen(true);
      return true;
    }
  };

  const registerArtisan = async (data: Partial<ArtisanUser>) => {
    const { data: authData, error } = await storageService.register(
      data.phone || '', 
      data.password || '12345', 
      data.name || ''
    );

    if (error || !authData.user) {
      console.error('Registration failed');
      return;
    }

    await storageService.registerArtisanProfile({
      id: authData.user.id,
      name: data.name || '',
      phone: data.phone || '',
      location: '0101000020E6100000C16AC4CA967252403F35DFD721FF3340', // Mock Point
      category: data.craftSpecialty || ''
    });

    const newStore: KaragirStore = {
      id: authData.user.id,
      artisanName: data.name || '',
      mobile: data.phone || '',
      email: '',
      location: data.location || '',
      craftSpecialty: data.craftSpecialty || '',
      shopName: '',
      shopTagline: '',
      yearsExperience: 0,
      shopAvatar: '',
      shopBanner: '',
      categories: [],
      works: [],
      rating: 5.0,
      isVerified: false,
    };
    setStoreData(newStore);
    setIsAuthModalOpen(false);
    setIsWizardOpen(true);
  };

  const saveStoreProfile = async (data: Partial<KaragirStore>) => {
    if (!storeData) return;
    setStoreData({ ...storeData, ...data });
    await storageService.updateArtisanProfile(storeData.id, {
      shop_name: data.shopName,
      category: data.craftSpecialty,
      address: data.location,
      speaking_language: data.speakingLanguage,
      experience_years: data.yearsExperience,
    });
  };

  const addWorkItem = async (item: WorkItem) => {
    if (!storeData) return;
    const categories = new Set(storeData.categories);
    categories.add(item.category);
    setStoreData({
      ...storeData,
      categories: Array.from(categories),
      works: [...storeData.works, item],
    });
    
    await storageService.addProduct({
      artisan_id: storeData.id,
      item_type: item.title,
      material: item.material,
      price: item.price
    });
  };

  const logout = async () => {
    await storageService.logout();
    setStoreData(null);
  };

  return (
    <KaragirStoreContext.Provider value={{
      isAuthModalOpen, setIsAuthModalOpen,
      isWizardOpen, setIsWizardOpen,
      storeData, loginArtisan, registerArtisan, saveStoreProfile, addWorkItem, logout, allStores
    }}>
      {children}
    </KaragirStoreContext.Provider>
  );
};

export const useKaragirStore = () => {
  const context = useContext(KaragirStoreContext);
  if (context === undefined) {
    throw new Error('useKaragirStore must be used within a KaragirStoreProvider');
  }
  return context;
};
