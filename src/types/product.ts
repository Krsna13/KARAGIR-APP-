import type { NormalizedDimensions } from '../utils/dimensionMerger';
import type { DimensionKey } from './voice';

export interface ProductRecord {
  id: string; // uuid
  artisan_id: string; // uuid
  item_type?: string | null;
  material?: string | null;
  /**
   * Stage 6.5: raw dimensions answer, shape-aware. Was an unused
   * {length,width,height} shape before this stage; nothing to migrate since
   * that shape was never persisted.
   */
  dimensions?: ProductDimensionsRaw | null;
  normalized_dimensions?: NormalizedDimensions | null;
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

  // Stage 6.5: Describe step facts (for the listing and the pricing model).
  technique?: string | null;
  labor_days?: number | null;
  availability?: 'ready' | 'made_to_order' | null;
  quantity_available?: number | null;
  lead_time_days?: number | null;
  accepts_customization?: boolean | null;
  visible_features?: string[] | null;
  colors?: string[] | null;
  style?: ProductStyle | null;
  suggested_use?: string[] | null;
  story_original?: string | null;
  story_en?: string | null;
  care_instructions?: string | null;
  description_mode?: 'ai_assisted' | 'manual' | null;

  // Stage 6.6: Preview step (Listing writer and buyer preview)
  title_en?: string | null;
  title_hi?: string | null;
  seo_caption_en?: string | null;
  seo_caption_hi?: string | null;
  highlights_en?: string[] | null;
  highlights_hi?: string[] | null;
  search_tags?: string[] | null;
  extra_notes_original?: string | null;
  extra_notes_en?: string | null;
  listing_generated_at?: string | null;
  listing_facts_hash?: string | null;
  listing_approved?: boolean | null;
  summary_spoken?: string | null;
}

export type ListingSection = 'title' | 'caption' | 'highlights' | 'description';

export interface ListingResult {
  title_en: string;
  title_hi: string;
  seo_caption_en: string;
  seo_caption_hi: string;
  highlights_en: string[];
  highlights_hi: string[];
  description_en: string;
  description_hi: string;
  search_tags: string[];
  summary_spoken: string;
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
  complexity_reason_spoken?: string;
  shape_profile?: ProductShapeProfile;
  item_name_spoken?: string;
  material_spoken?: string;
  // Stage 6.5
  visible_features?: string[];
  colors?: string[];
  style?: ProductStyle;
  suggested_use?: string[];
}

export type ProductStyle = 'traditional' | 'modern' | 'rustic' | 'fusion' | 'unknown';

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

// Stage 6.5: shape-aware dimensions raw answer (products.dimensions) and its
// cm-normalized output (products.normalized_dimensions). See
// src/utils/dimensionMerger.ts for normalizeDimensions() and the
// DimensionKey type (also re-exported from src/types/voice.ts).
export type { NormalizedDimensions };

export interface ProductDimensionsRaw {
  shape: ProductShapeProfile;
  values: Partial<Record<DimensionKey, number>>;
  unit: 'ft' | 'in' | 'cm' | 'm';
  approximate: boolean;
}
