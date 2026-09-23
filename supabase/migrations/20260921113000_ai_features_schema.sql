-- Migration: 20260921113000_ai_features_schema.sql
-- Extend database schema for AI Image Enhancer, Multilingual Auto-Cataloger, and Dynamic Pricing Assistant

-- 1. Extend products table with AI feature columns
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS image_processing_status TEXT DEFAULT 'pending' 
    CHECK (image_processing_status IN ('pending', 'processing', 'enhanced', 'failed')),
  ADD COLUMN IF NOT EXISTS original_image_url TEXT,
  ADD COLUMN IF NOT EXISTS enhanced_image_url TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS description_hi TEXT,
  ADD COLUMN IF NOT EXISTS voice_note_url TEXT,
  ADD COLUMN IF NOT EXISTS transcript_raw TEXT,
  ADD COLUMN IF NOT EXISTS price_suggested_ml NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_deterministic NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_final NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pricing_confidence NUMERIC(3,2);

-- 2. Create market_reference_listings table for future pricing dataset
CREATE TABLE IF NOT EXISTS market_reference_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  material TEXT NOT NULL,
  dimensions_volume NUMERIC,
  listed_price NUMERIC(10,2) NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Row Level Security (RLS) Configuration

-- Enable RLS on market_reference_listings
ALTER TABLE market_reference_listings ENABLE ROW LEVEL SECURITY;

-- market_reference_listings is read-only for authenticated users, writable only via service role
DROP POLICY IF EXISTS "Authenticated users can read market reference listings" ON market_reference_listings;
CREATE POLICY "Authenticated users can read market reference listings"
  ON market_reference_listings
  FOR SELECT
  TO authenticated
  USING (true);

-- Create index for pricing query performance
CREATE INDEX IF NOT EXISTS idx_market_ref_category_material 
  ON market_reference_listings (category, material);
