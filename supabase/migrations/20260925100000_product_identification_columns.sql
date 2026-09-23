-- Migration: 20260925100000_product_identification_columns.sql
-- Stage 6.4: Add Item wizard Identify step.
--
-- The confirmed values live in the regular columns below. The AI's ORIGINAL
-- guess is kept verbatim in ai_identification, and identification_source
-- records whether the artisan accepted it or corrected it. Keeping both is
-- deliberate: AI guess vs artisan correction becomes training data for the
-- pricing model later, so ai_identification must never be overwritten with
-- the confirmed values.
--
-- All columns are nullable: drafts are created before identification runs,
-- and pre-existing products were never identified. No values are backfilled.
--
-- Not applied to a live database in this environment.

ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS secondary_materials TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS finish TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS complexity TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shape_profile TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_identification JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS identification_source TEXT;

-- CHECK constraints mirror the enums in
-- supabase/functions/identify-product/validation.ts
-- (ALLOWED_CATEGORIES, FINISH_TYPES, COMPLEXITY_LEVELS, SHAPE_PROFILES).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_category_check
      CHECK (category IN ('Woodwork', 'Pottery', 'Brasscraft', 'Textile', 'Furniture', 'Metal'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_finish_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_finish_check
      CHECK (finish IN ('natural', 'polished', 'painted', 'lacquered', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_complexity_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_complexity_check
      CHECK (complexity IN ('simple', 'medium', 'intricate'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_shape_profile_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_shape_profile_check
      CHECK (shape_profile IN ('box', 'flat', 'round'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_identification_source_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_identification_source_check
      CHECK (identification_source IN ('ai_confirmed', 'artisan_corrected'));
  END IF;

  -- The AI guess must be a JSON object (the validated identify-product response).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_ai_identification_object_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_ai_identification_object_check
      CHECK (ai_identification IS NULL OR jsonb_typeof(ai_identification) = 'object');
  END IF;
END $$;
