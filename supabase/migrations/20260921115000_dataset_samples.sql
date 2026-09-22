-- Migration: 20260921115000_dataset_samples.sql
-- Dataset collection tool for AI Image Enhancer training and evaluation (Stage 0.3)

-- 1. Create dataset_samples table
CREATE TABLE IF NOT EXISTS dataset_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Woodwork', 'Pottery', 'Brasscraft', 'Textile', 'Furniture', 'Metal')),
  lighting_condition TEXT NOT NULL CHECK (lighting_condition IN ('Good', 'Poor', 'Mixed')),
  background_type TEXT NOT NULL CHECK (background_type IN ('Clean', 'Cluttered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Row Level Security (RLS) Configuration for dataset_samples
ALTER TABLE dataset_samples ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (internal dev/curator accounts) to view dataset samples
CREATE POLICY "Authenticated users can read dataset samples"
  ON dataset_samples
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert new dataset samples
CREATE POLICY "Authenticated users can insert dataset samples"
  ON dataset_samples
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Indexes for efficient querying by category and date
CREATE INDEX IF NOT EXISTS idx_dataset_samples_category 
  ON dataset_samples (category);

CREATE INDEX IF NOT EXISTS idx_dataset_samples_created_at 
  ON dataset_samples (created_at DESC);

-- 3. Storage Bucket Configuration for raw photos
-- Create bucket 'dataset-raw-photos' if it does not already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('dataset-raw-photos', 'dataset-raw-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Authenticated users can upload raw dataset photos
CREATE POLICY "Authenticated users can upload dataset raw photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'dataset-raw-photos');

-- Storage RLS: Authenticated users can view dataset raw photos
CREATE POLICY "Authenticated users can read dataset raw photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'dataset-raw-photos');
