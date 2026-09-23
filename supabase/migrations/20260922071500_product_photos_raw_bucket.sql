-- Migration: 20260922071500_product_photos_raw_bucket.sql
-- Storage bucket and RLS policies for raw artisan product photos (Stage 1.1)

-- 1. Create storage bucket 'product-photos-raw' if it does not already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-photos-raw', 'product-photos-raw', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS Policies
-- Artisans can only upload raw product photos into their own artisan_id-prefixed folder:
-- Folder structure: {artisan_id}/{product_id}/{timestamp}.jpg
DROP POLICY IF EXISTS "Artisans can only upload to own folder in product-photos-raw" ON storage.objects;
CREATE POLICY "Artisans can only upload to own folder in product-photos-raw"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos-raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users (buyers, artisans, and public app) can view raw product photos
DROP POLICY IF EXISTS "Public read access for product-photos-raw" ON storage.objects;
CREATE POLICY "Public read access for product-photos-raw"
  ON storage.objects
  FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'product-photos-raw');

-- Artisans can update their own raw product photos
DROP POLICY IF EXISTS "Artisans can update own photos in product-photos-raw" ON storage.objects;
CREATE POLICY "Artisans can update own photos in product-photos-raw"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-photos-raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Artisans can delete their own raw product photos
DROP POLICY IF EXISTS "Artisans can delete own photos in product-photos-raw" ON storage.objects;
CREATE POLICY "Artisans can delete own photos in product-photos-raw"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-photos-raw'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
