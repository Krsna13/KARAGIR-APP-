-- Migration: 20260922102500_product_voice_notes_bucket.sql
-- Storage bucket and RLS policies for artisan product voice notes (Stage 2.1)
-- Copies the exact verified auth.uid() folder-ownership pattern from Stage 1.1b (20260922071500_product_photos_raw_bucket.sql)

-- 1. Create storage bucket 'product-voice-notes' if it does not already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-voice-notes', 'product-voice-notes', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS Policies
-- Artisans can only upload voice notes into their own artisan_id-prefixed folder:
-- Folder structure: {artisan_id}/{product_id}/{timestamp}.webm
DROP POLICY IF EXISTS "Artisans can only upload to own folder in product-voice-notes" ON storage.objects;
CREATE POLICY "Artisans can only upload to own folder in product-voice-notes"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-voice-notes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users (buyers, artisans, and public app) can listen to/read voice notes
DROP POLICY IF EXISTS "Public read access for product-voice-notes" ON storage.objects;
CREATE POLICY "Public read access for product-voice-notes"
  ON storage.objects
  FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'product-voice-notes');

-- Artisans can update their own voice notes
DROP POLICY IF EXISTS "Artisans can update own voice notes in product-voice-notes" ON storage.objects;
CREATE POLICY "Artisans can update own voice notes in product-voice-notes"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-voice-notes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Artisans can delete their own voice notes
DROP POLICY IF EXISTS "Artisans can delete own voice notes in product-voice-notes" ON storage.objects;
CREATE POLICY "Artisans can delete own voice notes in product-voice-notes"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-voice-notes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
