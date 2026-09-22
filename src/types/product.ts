export interface ProductRecord {
  id: string; // uuid
  artisan_id: string; // uuid
  item_type: string;
  material: string;
  dimensions: {
    length: number;
    width: number;
    height: number;
  } | null;
  price: number;
  image_urls: string[] | null;
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
