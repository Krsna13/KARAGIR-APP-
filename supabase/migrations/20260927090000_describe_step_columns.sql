-- Migration: 20260927090000_describe_step_columns.sql
-- Stage 6.5: Add Item wizard Describe step (facts for the listing and pricing model).
--
-- EXISTING COLUMNS CHECKED FIRST (per task instructions):
--   - products.dimensions JSONB already exists (0003_products.sql). It was never
--     written to by the app (Stage 6.1-6.4 did not use it). We REUSE it rather than
--     adding a new column, but its shape now is the Stage 6.5 raw answer:
--       { shape: 'box'|'flat'|'round', values: { <dimension_key>: number, ... },
--         unit: 'ft'|'in'|'cm'|'m', approximate: boolean }
--     instead of the old ad-hoc { length, width, height } the TypeScript type used
--     to declare (that shape was never persisted, so there is nothing to migrate).
--   - The frontend `leadTimeDays` field (src/types/index.ts) belongs to a separate,
--     unrelated mock/display "Product"/"WorkItem" type used by storefront cards —
--     it is not a products table column and is NOT reused. lead_time_days below is
--     a new, distinct column on the real products row written by this wizard step.
--   - No other requested column (technique, labor_days, availability,
--     quantity_available, accepts_customization, visible_features, colors, style,
--     suggested_use, story_original, story_en, care_instructions, description_mode,
--     normalized_dimensions) existed before this migration.
--
-- Not applied to a live database in this environment.

ALTER TABLE products ADD COLUMN IF NOT EXISTS normalized_dimensions JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS technique TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS labor_days NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS availability TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_available INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time_days INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS accepts_customization BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS visible_features TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS style TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS suggested_use TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS story_original TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS story_en TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS care_instructions TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_mode TEXT;

-- CHECK constraints mirror the enums in
-- src/components/portal/addItem/steps/describeLogic.ts and identify-product/validation.ts.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_availability_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_availability_check
      CHECK (availability IN ('ready', 'made_to_order'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_style_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_style_check
      CHECK (style IN ('traditional', 'modern', 'rustic', 'fusion', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_description_mode_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_description_mode_check
      CHECK (description_mode IN ('ai_assisted', 'manual'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_labor_days_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_labor_days_check CHECK (labor_days IS NULL OR labor_days >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_quantity_available_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_quantity_available_check
      CHECK (quantity_available IS NULL OR quantity_available >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_lead_time_days_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_lead_time_days_check
      CHECK (lead_time_days IS NULL OR lead_time_days >= 0);
  END IF;

  -- dimensions (reused column) and normalized_dimensions must be JSON objects when present.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_dimensions_object_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_dimensions_object_check
      CHECK (dimensions IS NULL OR jsonb_typeof(dimensions) = 'object');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_normalized_dimensions_object_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_normalized_dimensions_object_check
      CHECK (normalized_dimensions IS NULL OR jsonb_typeof(normalized_dimensions) = 'object');
  END IF;
END $$;
