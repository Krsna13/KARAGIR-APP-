export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      artisans: {
        Row: {
          id: string
          name: string
          phone: string
          password_hash: string | null
          shop_name: string | null
          location: any // PostGIS Point is tricky in TS, usually parsed as string or custom object
          address: string | null
          category: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          phone: string
          password_hash?: string | null
          shop_name?: string | null
          location: any
          address?: string | null
          category?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          phone?: string
          password_hash?: string | null
          shop_name?: string | null
          location?: any
          address?: string | null
          category?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          artisan_id: string | null
          item_type: string
          material: string
          dimensions: Json | null
          price: number
          image_urls: string[] | null
          created_at: string | null
          image_processing_status: 'pending' | 'processing' | 'enhanced' | 'failed' | null
          original_image_url: string | null
          enhanced_image_url: string | null
          description_en: string | null
          description_hi: string | null
          voice_note_url: string | null
          transcript_raw: string | null
          price_suggested_ml: number | null
          price_deterministic: number | null
          price_final: number | null
          pricing_confidence: number | null
          final_image_choice: 'original' | 'enhanced' | null
        }
        Insert: {
          id?: string
          artisan_id?: string | null
          item_type: string
          material: string
          dimensions?: Json | null
          price: number
          image_urls?: string[] | null
          created_at?: string | null
          image_processing_status?: 'pending' | 'processing' | 'enhanced' | 'failed' | null
          original_image_url?: string | null
          enhanced_image_url?: string | null
          description_en?: string | null
          description_hi?: string | null
          voice_note_url?: string | null
          transcript_raw?: string | null
          price_suggested_ml?: number | null
          price_deterministic?: number | null
          price_final?: number | null
          pricing_confidence?: number | null
          final_image_choice?: 'original' | 'enhanced' | null
        }
        Update: {
          id?: string
          artisan_id?: string | null
          item_type?: string
          material?: string
          dimensions?: Json | null
          price?: number
          image_urls?: string[] | null
          created_at?: string | null
          image_processing_status?: 'pending' | 'processing' | 'enhanced' | 'failed' | null
          original_image_url?: string | null
          enhanced_image_url?: string | null
          description_en?: string | null
          description_hi?: string | null
          voice_note_url?: string | null
          transcript_raw?: string | null
          price_suggested_ml?: number | null
          price_deterministic?: number | null
          price_final?: number | null
          pricing_confidence?: number | null
          final_image_choice?: 'original' | 'enhanced' | null
        }
        Relationships: []
      }
      market_reference_listings: {
        Row: {
          id: string
          category: string
          material: string
          dimensions_volume: number | null
          listed_price: number
          source: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          category: string
          material: string
          dimensions_volume?: number | null
          listed_price: number
          source?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          category?: string
          material?: string
          dimensions_volume?: number | null
          listed_price?: number
          source?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      dataset_samples: {
        Row: {
          id: string
          storage_path: string
          category: 'Woodwork' | 'Pottery' | 'Brasscraft' | 'Textile' | 'Furniture' | 'Metal'
          lighting_condition: 'Good' | 'Poor' | 'Mixed'
          background_type: 'Clean' | 'Cluttered'
          created_at: string
        }
        Insert: {
          id?: string
          storage_path: string
          category: 'Woodwork' | 'Pottery' | 'Brasscraft' | 'Textile' | 'Furniture' | 'Metal'
          lighting_condition: 'Good' | 'Poor' | 'Mixed'
          background_type: 'Clean' | 'Cluttered'
          created_at?: string
        }
        Update: {
          id?: string
          storage_path?: string
          category?: 'Woodwork' | 'Pottery' | 'Brasscraft' | 'Textile' | 'Furniture' | 'Metal'
          lighting_condition?: 'Good' | 'Poor' | 'Mixed'
          background_type?: 'Clean' | 'Cluttered'
          created_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          id: string
          rate_key: string
          name: string
          type: string
          unit: string
          price_per_unit: number
          description: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          rate_key: string
          name: string
          type: string
          unit: string
          price_per_unit: number
          description?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          rate_key?: string
          name?: string
          type?: string
          unit?: string
          price_per_unit?: number
          description?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          buyer_id: string
          artisan_id: string | null
          product_id: string | null
          status: string
          final_price: number
          created_at: string | null
        }
        Insert: {
          id?: string
          buyer_id: string
          artisan_id?: string | null
          product_id?: string | null
          status: string
          final_price: number
          created_at?: string | null
        }
        Update: {
          id?: string
          buyer_id?: string
          artisan_id?: string | null
          product_id?: string | null
          status?: string
          final_price?: number
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_artisans_within_radius: {
        Args: {
          search_lat: number
          search_lng: number
          radius_km: number
        }
        Returns: {
          id: string
          name: string
          phone: string
          shop_name: string
          location: any
          address: string
          category: string
          distance_meters: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
