-- Migration: 20260923190000_artisan_wizard_drafts_schema.sql
-- Stage 6.1: Artisan Add Item Wizard Skeleton Schema & Draft Policies

-- ============================================================================
-- 1. ARTISANS TABLE EXTENSIONS
-- ============================================================================

-- Add speaking_language (e.g. 'hi', 'mr', 'en')
ALTER TABLE artisans 
  ADD COLUMN IF NOT EXISTS speaking_language TEXT;

-- Add experience_years (reusing experienceYears / yearsExperience concept from types & mocks)
ALTER TABLE artisans 
  ADD COLUMN IF NOT EXISTS experience_years INTEGER;

-- ============================================================================
-- 2. PRODUCTS TABLE DRAFT COLUMNS & MIGRATION ORDER
-- ============================================================================

-- CRITICAL MIGRATION ORDER:
-- Step 2a: Add listing_status with DEFAULT 'published' NOT NULL first.
-- This ensures all pre-existing rows in production/development are backfilled
-- as 'published' and will NEVER become drafts.
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS listing_status TEXT DEFAULT 'published' NOT NULL;

-- Step 2b: Alter the default to 'draft' so that subsequent rows created by
-- the Add Item wizard start as drafts.
ALTER TABLE products 
  ALTER COLUMN listing_status SET DEFAULT 'draft';

-- Step 2c: Enforce valid statuses ('draft' or 'published')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_listing_status_check'
  ) THEN
    ALTER TABLE products 
      ADD CONSTRAINT products_listing_status_check 
      CHECK (listing_status IN ('draft', 'published'));
  END IF;
END $$;

-- Step 2d: Add wizard_step (0 to 5)
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS wizard_step INTEGER DEFAULT 0;

-- Step 2e: Add updated_at with automatic trigger
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION update_products_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_products_updated_at ON products;
CREATE TRIGGER trigger_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_products_updated_at_column();

-- ============================================================================
-- 3. NULLABILITY & PUBLISHED INTEGRITY CONSTRAINTS
-- ============================================================================

-- In 0003_products.sql, item_type, material, and price were defined as NOT NULL.
-- Drafts cannot have these yet at step 0 (and placeholder values are prohibited).
-- Therefore, we make them nullable:
ALTER TABLE products ALTER COLUMN item_type DROP NOT NULL;
ALTER TABLE products ALTER COLUMN material DROP NOT NULL;
ALTER TABLE products ALTER COLUMN price DROP NOT NULL;

-- Add constraint: published items MUST have non-null item_type, material, and price
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_published_fields_check'
  ) THEN
    ALTER TABLE products 
      ADD CONSTRAINT products_published_fields_check 
      CHECK (
        listing_status <> 'published' 
        OR (item_type IS NOT NULL AND material IS NOT NULL AND price IS NOT NULL)
      );
  END IF;
END $$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICY UPDATE
-- ============================================================================

-- Before (from 0007_rls_policies.sql):
-- create policy "Public read access on products" on products for select using (true);

-- After:
-- Public & buyer users can only select rows where listing_status = 'published'.
-- Artisans can select all published rows plus their own draft rows.
DROP POLICY IF EXISTS "Public read access on products" ON products;
DROP POLICY IF EXISTS "Public read published or own products" ON products;

CREATE POLICY "Public read published or own products"
ON products FOR SELECT
USING (
  listing_status = 'published'
  OR (auth.uid() IS NOT NULL AND auth.uid() = artisan_id)
);
