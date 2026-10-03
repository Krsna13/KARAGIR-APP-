-- Stage 6.7: pricing is built from the artisan's own production costs.
-- labor_days is kept (nullable, no longer asked or used).
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_material  NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_labour    NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_hardware  NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_finishing NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS production_cost NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_margin  NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_material_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_cost_material_check CHECK (cost_material IS NULL OR cost_material >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_labour_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_cost_labour_check CHECK (cost_labour IS NULL OR cost_labour >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_hardware_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_cost_hardware_check CHECK (cost_hardware IS NULL OR cost_hardware >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_finishing_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_cost_finishing_check CHECK (cost_finishing IS NULL OR cost_finishing >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_target_margin_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_target_margin_check
      CHECK (target_margin IS NULL OR (target_margin >= 0 AND target_margin < 0.6));
  END IF;
END $$;
