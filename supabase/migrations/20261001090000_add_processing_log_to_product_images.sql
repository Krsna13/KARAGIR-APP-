-- Migration: 20261001090000_add_processing_log_to_product_images.sql
-- Stage 6.3b: Studio Photo Enhancer Upgrade Schema
-- 1. product_images: cutout_image_url, quality_warnings, enhancement_mode, mask_coverage, processing_log
-- 2. products: photo_background ('white','soft_grey','warm_studio','original') DEFAULT 'white'

-- 1. Upgrade product_images table
ALTER TABLE product_images 
  ADD COLUMN IF NOT EXISTS cutout_image_url TEXT,
  ADD COLUMN IF NOT EXISTS quality_warnings TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enhancement_mode TEXT CHECK (enhancement_mode IN ('studio', 'light_only')),
  ADD COLUMN IF NOT EXISTS mask_coverage NUMERIC,
  ADD COLUMN IF NOT EXISTS processing_log JSONB;

-- 2. Upgrade products table
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS photo_background TEXT CHECK (photo_background IN ('white', 'soft_grey', 'warm_studio', 'original')) DEFAULT 'white';

-- Set default for existing rows if null
UPDATE products SET photo_background = 'white' WHERE photo_background IS NULL;
