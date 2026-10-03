-- Stage 6.7: training data for the Stage 6.8 pricing model.
-- Written ONLY by Edge Functions using the service role (record-pricing, estimate-price).
-- RLS is enabled with no policies, so anon/authenticated clients can neither read nor write.
CREATE TABLE IF NOT EXISTS pricing_training_data (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  source           TEXT NOT NULL CHECK (source IN ('artisan', 'online')),
  category         TEXT,
  item_type        TEXT,
  material         TEXT,
  shape_profile    TEXT,
  volume_cm3       NUMERIC CHECK (volume_cm3 IS NULL OR volume_cm3 >= 0),
  area_cm2         NUMERIC CHECK (area_cm2 IS NULL OR area_cm2 >= 0),
  technique        TEXT,
  complexity       TEXT,
  finish           TEXT,
  -- The artisan's address text (the profile has no separate city/state columns).
  location_text    TEXT,
  cost_material    NUMERIC CHECK (cost_material IS NULL OR cost_material >= 0),
  cost_labour      NUMERIC CHECK (cost_labour IS NULL OR cost_labour >= 0),
  cost_hardware    NUMERIC CHECK (cost_hardware IS NULL OR cost_hardware >= 0),
  cost_finishing   NUMERIC CHECK (cost_finishing IS NULL OR cost_finishing >= 0),
  production_cost  NUMERIC CHECK (production_cost IS NULL OR production_cost >= 0),
  target_margin    NUMERIC CHECK (target_margin IS NULL OR (target_margin >= 0 AND target_margin < 0.6)),
  -- artisan rows: the confirmed final price. online rows: the listed price found online.
  price_final      NUMERIC NOT NULL CHECK (price_final > 0),
  source_url       TEXT,
  source_title     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_training_data_product_idx ON pricing_training_data (product_id, source);
CREATE INDEX IF NOT EXISTS pricing_training_data_category_idx ON pricing_training_data (category, item_type);

ALTER TABLE pricing_training_data ENABLE ROW LEVEL SECURITY;
