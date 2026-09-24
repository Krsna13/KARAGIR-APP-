-- Migration: 20260928090000_listing_preview_columns.sql
-- Stage 6.6: Add Item wizard Preview step (Listing writer and buyer preview).
--
-- EXISTING COLUMNS CHECKED FIRST:
--   - products.description_en TEXT already exists (20260921113000_ai_features_schema.sql)
--   - products.description_hi TEXT already exists (20260921113000_ai_features_schema.sql)
--   Both are REUSED for the English and Hindi listing descriptions.
--
-- NEW COLUMNS ADDED:
--   - title_en TEXT
--   - title_hi TEXT
--   - seo_caption_en TEXT
--   - seo_caption_hi TEXT
--   - highlights_en TEXT[]
--   - highlights_hi TEXT[]
--   - search_tags TEXT[]
--   - extra_notes_original TEXT
--   - extra_notes_en TEXT
--   - listing_generated_at TIMESTAMPTZ
--   - listing_facts_hash TEXT
--   - listing_approved BOOLEAN DEFAULT FALSE

ALTER TABLE products ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS title_hi TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_caption_en TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_caption_hi TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS highlights_en TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS highlights_hi TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_tags TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS extra_notes_original TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS extra_notes_en TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_generated_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_facts_hash TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_approved BOOLEAN DEFAULT FALSE;
