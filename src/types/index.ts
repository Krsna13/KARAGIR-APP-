export type AppMode = 'buyer' | 'artisan';

export type CategoryType = 'Woodwork' | 'Pottery' | 'Brass' | 'Leather' | 'Cane' | 'All';

export interface LocationPin {
  locality: string;
  pincode: string;
  city: string;
  lat: number;
  lng: number;
}

export interface Artisan {
  id: string;
  name: string;
  shopName: string;
  experienceYears: number;
  rating: number;
  reviewsCount: number;
  isVerified: boolean;
  avatarUrl: string;
  coverUrl: string;
  locality: string;
  pincode: string;
  distanceKm: number;
  lat: number;
  lng: number;
  crafts: CategoryType[];
  specialties: string[];
  workshopReelUrl?: string;
  responseTime: string;
  completedOrdersCount: number;
  bio: string;
}

export type Model3DType = 
  | 'sofa' 
  | 'dining_table' 
  | 'study_table' 
  | 'bed' 
  | 'wardrobe' 
  | 'coffee_table' 
  | 'chair' 
  | 'bookshelf' 
  | 'dressing_table' 
  | 'shoe_rack' 
  | 'tv_unit' 
  | 'side_table' 
  | 'home_temple' 
  | 'wooden_bench' 
  | 'crockery_cabinet' 
  | 'indoor_swing' 
  | 'chest_of_drawers' 
  | 'bar_cabinet' 
  | 'console_table' 
  | 'bedside_table' 
  | 'door'
  | 'carved_mandir' 
  | 'sheesham_jhula' 
  | 'brass_urli' 
  | 'cane_chair';

export interface ItemSubcategory {
  id: string;
  name: string;
  materials: string[];
}

import type { ItemMaterialSlot } from '../data/materialRates';

export interface Item21Spec {
  id: string;
  itemNumber: number;
  name: string;
  icon: string;
  categoryGroup: 'Furniture' | 'Storage & Cabinets' | 'Sacred & Specialty' | 'Architectural & Openings';
  subcategories: ItemSubcategory[];
  defaultLengthFt: number;
  defaultWidthFt: number;
  defaultHeightFt: number;
  baseLaborPrice: number;
  sampleImageUrl: string;
  model3DType: Model3DType;
  materials: ItemMaterialSlot[];
}

export interface Product {
  id: string;
  artisanId: string;
  artisanName: string;
  shopName: string;
  title: string;
  category: CategoryType;
  price: number;
  material: string;
  dimensions: string;
  rating: number;
  imageUrl: string;
  model3DType: Model3DType;
  finishOptions: string[];
  description: string;
  inStock: boolean;
  leadTimeDays: number;
  itemSpecId?: string;

  // AI Feature Extensions (AI Image Enhancer, Multilingual Auto-Cataloger, Dynamic Pricing Assistant)
  image_processing_status?: 'pending' | 'processing' | 'enhanced' | 'failed' | null;
  original_image_url?: string | null;
  enhanced_image_url?: string | null;
  description_en?: string | null;
  description_hi?: string | null;
  voice_note_url?: string | null;
  transcript_raw?: string | null;
  price_suggested_ml?: number | null;
  price_deterministic?: number | null;
  price_final?: number | null;
  pricing_confidence?: number | null;
  final_image_choice?: 'original' | 'enhanced' | null;
}

export interface MarketReferenceListing {
  id: string;
  category: string;
  material: string;
  dimensions_volume?: number | null;
  listed_price: number;
  source?: string | null;
  created_at?: string | null;
}

export interface CustomRequest {
  id: string;
  buyerName: string;
  category: CategoryType;
  title: string;
  dimensions: {
    length: number;
    width: number;
    height: number;
    unit: 'ft' | 'in';
  };
  material: string;
  budget: number;
  locality: string;
  pincode: string;
  description: string;
  createdDate: string;
  activeArtisansCount: number;
  estimatedQuotes: string;
  status: 'broadcasted' | 'quotes_received' | 'accepted' | 'in_production';
}

export interface MilestoneStep {
  id: number;
  title: string;
  status: 'completed' | 'in_progress' | 'pending';
  timestamp?: string;
  description: string;
  photoUrl?: string;
  iconName: 'check' | 'hammer' | 'brush' | 'truck';
}

export interface OrderMilestone {
  orderId: string;
  projectTitle: string;
  buyerName: string;
  artisan: Artisan;
  totalAmount: number;
  escrowStatus: 'Locked in Escrow' | 'Partially Released' | 'Full Payout Completed';
  steps: MilestoneStep[];
  estimatedDeliveryDate: string;
}

export interface IncomingRequestRadar {
  id: string;
  buyerName: string;
  title: string;
  category: CategoryType;
  material: string;
  dimensions: string;
  budget: number;
  locality: string;
  distanceKm: number;
  postedAgo: string;
  timelineWeeks: number;
}

export interface ProductItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  coverImage: string;
  galleryImages: string[];
  description: string;
  materials: string[];
  startingPrice?: number | null;
}

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  group: string;
  coverImage: string;
  description: string;
}

export interface WorkItem {
  id: string;
  title: string;
  category: string;
  coverImage: string;
  galleryImages: string[];
  material: string;
  price: number;
  leadTimeDays: number;
}

export interface KaragirStore {
  id: string;
  artisanName: string;
  mobile: string;
  email: string;
  location: string;
  craftSpecialty: string;
  shopName: string;
  shopTagline: string;
  yearsExperience: number;
  speakingLanguage?: string;
  shopAvatar: string;
  shopBanner: string;
  categories: string[];
  works: WorkItem[];
  rating: number;
  isVerified: boolean;
}

export interface ArtisanUser {
  id: string;
  name: string;
  phone: string; // Unique Identifier for Login
  password: string; // Default: "12345" for existing records
  craftSpecialty: string;
  location: string;
  shopName?: string;
  shopTagline?: string;
  isVerified: boolean;
  registeredAt: string;
}

// Stage 5.1: Buyer AI Identifier ("Snap & Discover") Types
export type IdentifiedProductCategory =
  | 'Woodwork'
  | 'Pottery'
  | 'Brasscraft'
  | 'Textile'
  | 'Furniture'
  | 'Metal';

export interface ProductIdentification {
  item_name: string;
  material: string;
  category: IdentifiedProductCategory;
  confidence: number;
  short_description: string;
}
// Stage 6.2: Multimodal Voice Engine Types
export * from './voice';
