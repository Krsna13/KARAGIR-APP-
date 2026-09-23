export interface ProductRecord {
  id: string; // uuid
  artisan_id: string; // uuid
  item_type?: string | null;
  material?: string | null;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  } | null;
  price?: number | null;
  image_urls?: string[] | null;
  listing_status: 'draft' | 'published';
  wizard_step?: number | null;
  updated_at?: string | null;
  created_at: string;

  // AI Feature Extensions
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

  // Stage 6.4: Identify step. Confirmed values in the columns; the AI's
  // original guess (validated identify-product response) in ai_identification.
  category?: IdentifiedProductCategory | null;
  secondary_materials?: string[] | null;
  finish?: ProductFinish | null;
  complexity?: ProductComplexity | null;
  shape_profile?: ProductShapeProfile | null;
  ai_identification?: ProductAiIdentification | null;
  identification_source?: 'ai_confirmed' | 'artisan_corrected' | null;
  identification_photos?: IdentificationPhotos | null;
}

/** Which photos the last identification run used (see migration 20260926090000). */
export interface IdentificationPhotos {
  used_image_ids: string[];
  cover_image_id: string | null;
  all_image_ids: string[];
}

export type ProductFinish = 'natural' | 'polished' | 'painted' | 'lacquered' | 'unknown';
export type ProductComplexity = 'simple' | 'medium' | 'intricate';
export type ProductShapeProfile = 'box' | 'flat' | 'round';

/**
 * identify-product response as returned by the Edge Function (extended mode).
 * Optional fields are absent when the AI could not determine them.
 */
export interface ProductAiIdentification extends ProductIdentification {
  secondary_materials?: string[];
  finish?: ProductFinish;
  complexity?: ProductComplexity;
  complexity_reason?: string;
  shape_profile?: ProductShapeProfile;
  item_name_spoken?: string;
  material_spoken?: string;
}

export type ImageProcessingStatus = 'pending' | 'processing' | 'enhanced' | 'failed';
export type FinalImageChoice = 'original' | 'enhanced';

/** Maximum photos per product (also enforced by the product_images DB trigger). */
export const MAX_PRODUCT_IMAGES = 5;

// Stage 6.2: one row per product photo (see migration 20260924100000_product_images.sql)
export interface ProductImage {
  id: string; // uuid
  product_id: string; // uuid
  artisan_id: string; // uuid
  position: number; // 0..4
  original_image_url: string | null;
  enhanced_image_url: string | null;
  image_processing_status: ImageProcessingStatus;
  final_image_choice: FinalImageChoice | null;
  is_cover: boolean;
  created_at: string;
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
