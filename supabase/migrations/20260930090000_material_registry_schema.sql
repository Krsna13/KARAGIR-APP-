-- Migration: 20260930090000_material_registry_schema.sql
-- Material Registry: artisan-side inventory of purchased raw material batches
-- (wood, metal, stone, clay, leather, ...) with supplier/invoice traceability,
-- plus allocations of a batch's quantity to specific customer projects.
--
-- Distinct from the existing `materials` table (0004_materials.sql), which is
-- a flat rate/price catalog used for product-cost estimation. This schema
-- tracks physical purchased stock, not reference pricing.
--
-- !! RLS NOT LIVE-VERIFIED !! Written against the existing schema conventions
-- (see 20260924100000_product_images.sql) but not exercised against a live
-- Supabase project. Verify with a real authenticated artisan session before
-- relying on it.

-- ============================================================================
-- 1. TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS material_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id UUID NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  material_code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('Wood', 'Metal', 'Stone', 'Clay', 'Leather')),
  material_name TEXT NOT NULL,
  grade TEXT,
  supplier_name TEXT NOT NULL,
  supplier_location TEXT,
  invoice_number TEXT,
  supplier_batch_code TEXT,
  purchased_qty NUMERIC NOT NULL CHECK (purchased_qty > 0),
  unit TEXT NOT NULL DEFAULT 'kg',
  purchase_date DATE,
  traceability_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (traceability_status IN ('pending', 'complete')),
  passport_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_batches_artisan_id_idx ON material_batches (artisan_id);
CREATE INDEX IF NOT EXISTS material_batches_category_idx ON material_batches (category);

CREATE TABLE IF NOT EXISTS material_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES material_batches(id) ON DELETE CASCADE,
  artisan_id UUID NOT NULL REFERENCES artisans(id) ON DELETE CASCADE,
  project_label TEXT NOT NULL,
  project_ref TEXT,
  allocated_qty NUMERIC NOT NULL CHECK (allocated_qty > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_allocations_batch_id_idx ON material_allocations (batch_id);
CREATE INDEX IF NOT EXISTS material_allocations_artisan_id_idx ON material_allocations (artisan_id);

-- ============================================================================
-- 2. GUARD: an allocation cannot exceed the batch's remaining quantity
-- ============================================================================
-- SECURITY DEFINER so the check is not narrowed by material_allocations RLS,
-- and locks the parent batch row first so concurrent allocations are serialized.
CREATE OR REPLACE FUNCTION enforce_material_allocation_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch_purchased NUMERIC;
  already_allocated NUMERIC;
BEGIN
  SELECT purchased_qty INTO batch_purchased
  FROM material_batches
  WHERE id = NEW.batch_id
  FOR UPDATE;

  SELECT COALESCE(SUM(allocated_qty), 0) INTO already_allocated
  FROM material_allocations
  WHERE batch_id = NEW.batch_id
    AND id <> NEW.id;

  IF already_allocated + NEW.allocated_qty > batch_purchased THEN
    RAISE EXCEPTION 'material_allocations exceeds purchased quantity for batch %', NEW.batch_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_material_allocation_limit ON material_allocations;
CREATE TRIGGER trigger_material_allocation_limit
BEFORE INSERT OR UPDATE OF batch_id, allocated_qty ON material_allocations
FOR EACH ROW
EXECUTE FUNCTION enforce_material_allocation_limit();

-- ============================================================================
-- 3. updated_at bookkeeping on material_batches
-- ============================================================================
CREATE OR REPLACE FUNCTION touch_material_batches_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_material_batches_updated_at ON material_batches;
CREATE TRIGGER trigger_material_batches_updated_at
BEFORE UPDATE ON material_batches
FOR EACH ROW
EXECUTE FUNCTION touch_material_batches_updated_at();

-- ============================================================================
-- 4. ROW LEVEL SECURITY  (NOT LIVE-VERIFIED — see header)
-- ============================================================================
ALTER TABLE material_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_batches select own" ON material_batches;
DROP POLICY IF EXISTS "material_batches insert own" ON material_batches;
DROP POLICY IF EXISTS "material_batches update own" ON material_batches;
DROP POLICY IF EXISTS "material_batches delete own" ON material_batches;

CREATE POLICY "material_batches select own"
ON material_batches FOR SELECT
USING (auth.uid() = artisan_id);

CREATE POLICY "material_batches insert own"
ON material_batches FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = artisan_id);

CREATE POLICY "material_batches update own"
ON material_batches FOR UPDATE
TO authenticated
USING (auth.uid() = artisan_id)
WITH CHECK (auth.uid() = artisan_id);

CREATE POLICY "material_batches delete own"
ON material_batches FOR DELETE
TO authenticated
USING (auth.uid() = artisan_id);

DROP POLICY IF EXISTS "material_allocations select own" ON material_allocations;
DROP POLICY IF EXISTS "material_allocations insert own" ON material_allocations;
DROP POLICY IF EXISTS "material_allocations delete own" ON material_allocations;

CREATE POLICY "material_allocations select own"
ON material_allocations FOR SELECT
USING (auth.uid() = artisan_id);

CREATE POLICY "material_allocations insert own"
ON material_allocations FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = artisan_id
  AND EXISTS (
    SELECT 1 FROM material_batches b
    WHERE b.id = material_allocations.batch_id
      AND b.artisan_id = auth.uid()
  )
);

CREATE POLICY "material_allocations delete own"
ON material_allocations FOR DELETE
TO authenticated
USING (auth.uid() = artisan_id);
