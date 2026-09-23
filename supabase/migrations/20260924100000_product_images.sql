-- Migration: 20260924100000_product_images.sql
-- Stage 6.2: Multi-photo support for the Add Item wizard (Photos step).
--
-- Up to 5 images per product, each enhanced separately, exactly one cover.
--
-- !! RLS NOT LIVE-VERIFIED !!
-- The policies, trigger and partial unique index below were written against the
-- existing schema but have NOT been applied to or exercised on a live Supabase
-- project. Client tests mock Supabase at the client boundary. Verify with a real
-- authenticated artisan session (own rows, another artisan's rows, anon on a
-- published product, anon on a draft) before relying on them.
--
-- Cover sync (products.original_image_url / enhanced_image_url /
-- image_processing_status / final_image_choice) is deliberately NOT a trigger.
-- It lives in src/services/productImageService.ts -> syncCoverToProduct().
-- See that file for the rationale.

-- ============================================================================
-- 1. TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  artisan_id UUID NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  original_image_url TEXT,
  enhanced_image_url TEXT,
  -- Same allowed values as products.image_processing_status (20260921113000_ai_features_schema.sql)
  image_processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (image_processing_status IN ('pending', 'processing', 'enhanced', 'failed')),
  -- Same allowed values as products.final_image_choice (20260922101500_add_final_image_choice.sql)
  final_image_choice TEXT DEFAULT NULL
    CHECK (final_image_choice IN ('original', 'enhanced')),
  is_cover BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Two photos can never occupy the same slot of the same product.
  CONSTRAINT product_images_product_position_key UNIQUE (product_id, position)
);

CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON product_images (product_id);
CREATE INDEX IF NOT EXISTS product_images_artisan_id_idx ON product_images (artisan_id);

-- ============================================================================
-- 2. AT MOST ONE COVER PER PRODUCT (partial unique index)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS product_images_one_cover_per_product
  ON product_images (product_id)
  WHERE is_cover;

-- ============================================================================
-- 3. MAX 5 IMAGES PER PRODUCT (trigger)
-- ============================================================================
-- Locks the parent product row first so two concurrent inserts for the same
-- product are serialized and cannot both observe count = 4.
-- SECURITY DEFINER so the count is not narrowed by product_images RLS.
CREATE OR REPLACE FUNCTION enforce_product_images_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  image_count INTEGER;
BEGIN
  PERFORM 1 FROM products WHERE id = NEW.product_id FOR UPDATE;

  SELECT count(*) INTO image_count
  FROM product_images
  WHERE product_id = NEW.product_id
    AND id <> NEW.id;

  IF image_count >= 5 THEN
    RAISE EXCEPTION 'product_images limit exceeded: product % already has 5 images', NEW.product_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_product_images_limit ON product_images;
CREATE TRIGGER trigger_product_images_limit
BEFORE INSERT OR UPDATE OF product_id ON product_images
FOR EACH ROW
EXECUTE FUNCTION enforce_product_images_limit();

-- ============================================================================
-- 4. ROW LEVEL SECURITY  (NOT LIVE-VERIFIED — see header)
-- ============================================================================
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_images select own or published" ON product_images;
DROP POLICY IF EXISTS "product_images insert own" ON product_images;
DROP POLICY IF EXISTS "product_images update own" ON product_images;
DROP POLICY IF EXISTS "product_images delete own" ON product_images;

-- SELECT: the owning artisan, or anyone when the parent product is published.
CREATE POLICY "product_images select own or published"
ON product_images FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND artisan_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_images.product_id
      AND p.listing_status = 'published'
  )
);

-- INSERT: only as yourself, and only onto a product you own (prevents attaching
-- images to another artisan's product while still claiming your own artisan_id).
CREATE POLICY "product_images insert own"
ON product_images FOR INSERT
TO authenticated
WITH CHECK (
  artisan_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_images.product_id
      AND p.artisan_id = auth.uid()
  )
);

-- UPDATE: only your own rows, and you cannot reassign artisan_id to someone else.
CREATE POLICY "product_images update own"
ON product_images FOR UPDATE
TO authenticated
USING (artisan_id = auth.uid())
WITH CHECK (artisan_id = auth.uid());

-- DELETE: only your own rows. (ON DELETE CASCADE from products is a referential
-- action and removes rows regardless of this policy.)
CREATE POLICY "product_images delete own"
ON product_images FOR DELETE
TO authenticated
USING (artisan_id = auth.uid());

-- Storage: no change. Per-image files live at
--   product-photos-raw/{artisan_id}/{product_id}/{image_id}/raw.jpg
--   product-photos-raw/{artisan_id}/{product_id}/{image_id}/enhanced.png
-- and the existing folder-owner policies in 20260922071500_product_photos_raw_bucket.sql
-- ((storage.foldername(name))[1] = auth.uid()::text) still apply.
