import { describe, it, expect } from 'vitest';
import { 
  convertDbArtisanToStore, 
  convertStoreToDbArtisan, 
  convertStoreToArtisan 
} from '../artisanConverter';
import type { ArtisanRecord } from '../../types/artisan';
import type { KaragirStore } from '../../types';

describe('artisanConverter Bidirectional Experience & Storefront Mapping (Stage 6.1)', () => {
  it('maps database experience_years to frontend yearsExperience on read', () => {
    const dbRecord: ArtisanRecord = {
      id: 'artisan-777',
      name: 'Santosh Lohar',
      phone: '9822012345',
      shop_name: 'Lohar Metal Works',
      location: null,
      address: 'Panchavati, Nashik',
      category: 'Brass',
      speaking_language: 'mr',
      experience_years: 18,
      created_at: '2026-09-23T00:00:00Z',
    };

    const store = convertDbArtisanToStore(dbRecord);
    expect(store.yearsExperience).toBe(18);
    expect(store.speakingLanguage).toBe('mr');
    expect(store.shopName).toBe('Lohar Metal Works');
  });

  it('maps frontend yearsExperience to database experience_years on save', () => {
    const storeUpdates: Partial<KaragirStore> = {
      yearsExperience: 25,
      speakingLanguage: 'hi',
      shopName: 'Santosh Iron & Brass Craft',
    };

    const dbPayload = convertStoreToDbArtisan(storeUpdates);
    expect(dbPayload.experience_years).toBe(25);
    expect(dbPayload.speaking_language).toBe('hi');
    expect(dbPayload.shop_name).toBe('Santosh Iron & Brass Craft');
  });

  it('proves a saved experience value appears on the artisan storefront data model', () => {
    // 1. Artisan saves profile with 22 years of experience
    const savedExperience = 22;
    const dbUpdate = convertStoreToDbArtisan({ yearsExperience: savedExperience });
    expect(dbUpdate.experience_years).toBe(22);

    // 2. Database stores row with experience_years = 22
    const persistedDbRecord: ArtisanRecord = {
      id: 'artisan-888',
      name: 'Anand Shinde',
      phone: '9822998877',
      shop_name: 'Shinde Teak Workshops',
      location: null,
      address: 'Gangapur Road, Nashik',
      category: 'Woodwork',
      speaking_language: 'hi',
      experience_years: dbUpdate.experience_years!,
      created_at: '2026-09-23T00:00:00Z',
    };

    // 3. Hydrate into frontend KaragirStore
    const hydratedStorePartial = convertDbArtisanToStore(persistedDbRecord);
    const fullStore: KaragirStore = {
      id: persistedDbRecord.id,
      artisanName: persistedDbRecord.name,
      mobile: persistedDbRecord.phone,
      email: '',
      location: persistedDbRecord.address || '',
      craftSpecialty: persistedDbRecord.category || '',
      shopName: persistedDbRecord.shop_name || '',
      shopTagline: 'Master Teak Carver',
      yearsExperience: hydratedStorePartial.yearsExperience!,
      speakingLanguage: hydratedStorePartial.speakingLanguage,
      shopAvatar: '',
      shopBanner: '',
      categories: ['Woodwork'],
      works: [],
      rating: 4.9,
      isVerified: true,
    };

    // 4. Convert store to public buyer-facing Artisan storefront model
    const storefrontArtisan = convertStoreToArtisan(fullStore);

    // 5. Storefront model has experienceYears = 22
    expect(storefrontArtisan.experienceYears).toBe(22);
    expect(storefrontArtisan.name).toBe('Anand Shinde');
    expect(storefrontArtisan.shopName).toBe('Shinde Teak Workshops');
  });
});
