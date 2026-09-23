import type { KaragirStore, Artisan, CategoryType } from '../types';
import type { RegionalArtisan } from '../data/regionalArtisansDatabase';
import type { ArtisanRecord } from '../types/artisan';
import type { Database } from '../lib/supabase/database.types';

// Mock coordinates around Nashik for newly registered artisans
const MOCK_NASHIK_COORDS = [
  { lat: 19.9975, lng: 73.7898, locality: 'Satpur MIDC', pincode: '422007' },
  { lat: 20.0110, lng: 73.7628, locality: 'Gangapur Road', pincode: '422013' },
  { lat: 20.0050, lng: 73.7915, locality: 'Panchavati', pincode: '422003' },
  { lat: 19.9650, lng: 73.7550, locality: 'Ambad MIDC', pincode: '422010' }
];

/**
 * Bidirectional Mapping: Database -> Frontend Store
 * Maps PostgreSQL column `experience_years` to frontend `yearsExperience`.
 */
export const convertDbArtisanToStore = (
  record: ArtisanRecord
): Partial<KaragirStore> => {
  return {
    id: record.id,
    artisanName: record.name,
    mobile: record.phone,
    shopName: record.shop_name || '',
    craftSpecialty: record.category || '',
    location: record.address || '',
    yearsExperience: record.experience_years ?? 0,
    speakingLanguage: record.speaking_language || undefined,
  };
};

/**
 * Bidirectional Mapping: Frontend Store -> Database
 * Maps frontend `yearsExperience` to PostgreSQL column `experience_years`.
 */
export const convertStoreToDbArtisan = (
  store: Partial<KaragirStore>
): Database['public']['Tables']['artisans']['Update'] => {
  const updates: Database['public']['Tables']['artisans']['Update'] = {};

  if (store.artisanName !== undefined) updates.name = store.artisanName;
  if (store.shopName !== undefined) updates.shop_name = store.shopName;
  if (store.location !== undefined) updates.address = store.location;
  if (store.craftSpecialty !== undefined) updates.category = store.craftSpecialty;
  if (store.speakingLanguage !== undefined) updates.speaking_language = store.speakingLanguage;
  if (store.yearsExperience !== undefined) updates.experience_years = store.yearsExperience;

  return updates;
};

/**
 * Maps KaragirStore to the public buyer-facing Artisan model used on storefronts.
 * Ensures `yearsExperience` is faithfully preserved as `experienceYears`.
 */
export const convertStoreToArtisan = (store: KaragirStore, index: number = 0): Artisan => {
  // Assign a semi-random map coordinate based on index
  const coord = MOCK_NASHIK_COORDS[index % MOCK_NASHIK_COORDS.length];
  
  // Convert categories (which are strings) to CategoryType safely
  const mappedCrafts = store.categories && store.categories.length > 0 
    ? store.categories as CategoryType[] 
    : ['Woodwork'] as CategoryType[];

  return {
    id: store.id,
    name: store.artisanName,
    shopName: store.shopName || `${store.artisanName}'s Workshop`,
    experienceYears: store.yearsExperience ?? 0,
    rating: store.rating || 5.0,
    reviewsCount: Math.floor(Math.random() * 50) + 1, // Mock reviews
    isVerified: store.isVerified,
    avatarUrl: store.shopAvatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', // Default avatar
    coverUrl: store.shopBanner || 'https://images.unsplash.com/photo-1611078516315-9430c042cbfa?w=800&q=80', // Default cover
    locality: store.location || coord.locality,
    pincode: coord.pincode,
    distanceKm: parseFloat((Math.random() * 5 + 1).toFixed(1)),
    lat: coord.lat + (Math.random() * 0.01 - 0.005), // Slight randomization
    lng: coord.lng + (Math.random() * 0.01 - 0.005),
    crafts: mappedCrafts,
    specialties: [store.craftSpecialty || 'Custom Craft'],
    responseTime: '~2 hours',
    completedOrdersCount: store.works?.length || 0,
    bio: store.shopTagline || `Expert in ${store.craftSpecialty}. Crafting high quality pieces for local buyers.`
  };
};

export const convertStoreToRegionalArtisan = (store: KaragirStore, index: number = 0): RegionalArtisan => {
  const coord = MOCK_NASHIK_COORDS[index % MOCK_NASHIK_COORDS.length];
  
  return {
    id: store.id,
    name: store.artisanName,
    shopName: store.shopName || `${store.artisanName}'s Workshop`,
    mobileNo: store.mobile,
    address: store.location || coord.locality,
    pincode: coord.pincode,
    city: 'Nashik',
    area: coord.locality,
    lat: coord.lat + (Math.random() * 0.01 - 0.005),
    lng: coord.lng + (Math.random() * 0.01 - 0.005),
    craftCategory: store.craftSpecialty || 'Custom Joinery',
    rating: store.rating || 5.0,
    experienceYears: store.yearsExperience ?? 0,
    isVerified: store.isVerified,
    availability: 'Available Now',
    image: store.shopAvatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
    bio: store.shopTagline || `Expert in ${store.craftSpecialty}. Crafting high quality pieces for local buyers.`
  };
};
