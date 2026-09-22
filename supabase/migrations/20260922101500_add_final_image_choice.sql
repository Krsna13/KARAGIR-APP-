-- Migration: 20260922101500_add_final_image_choice.sql
-- Add final_image_choice column to products table to record artisan preference between original and AI-enhanced photo

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS final_image_choice TEXT DEFAULT NULL
    CHECK (final_image_choice IN ('original', 'enhanced'));
