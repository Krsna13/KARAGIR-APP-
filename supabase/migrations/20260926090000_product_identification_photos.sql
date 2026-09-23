-- Migration: 20260926090000_product_identification_photos.sql
-- Stage 6.4 (additive; 20260925100000_product_identification_columns.sql is unchanged).
--
-- Records which photos the last identification run was based on, so the
-- Identify step can tell the artisan "Photos changed. Check again?" when the
-- cover changes or a photo is added/removed afterwards, even after the draft
-- is closed and resumed.
--
-- Kept separate from ai_identification on purpose: ai_identification holds the
-- AI's untouched response and nothing else.
--
-- Shape (written by the app, one object per identification run):
--   {
--     "used_image_ids": ["<uuid>", ...],   -- sent to identify-product, cover first (1-3)
--     "cover_image_id": "<uuid>",          -- cover at the time of the run
--     "all_image_ids":  ["<uuid>", ...]    -- every photo of the product at that time
--   }
-- No foreign keys: the whole point is to notice photos that were later deleted.
--
-- Not applied to a live database in this environment.

ALTER TABLE products ADD COLUMN IF NOT EXISTS identification_photos JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_identification_photos_object_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_identification_photos_object_check
      CHECK (identification_photos IS NULL OR jsonb_typeof(identification_photos) = 'object');
  END IF;
END $$;
