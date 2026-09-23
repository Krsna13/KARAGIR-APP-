-- Migration: 20260925090000_product_images_update_policy_fix.sql
-- Carry-over security fix for 20260924100000_product_images.sql.
--
-- !! RLS NOT LIVE-VERIFIED !!
-- Written against the schema but not applied to or exercised on a live
-- Supabase project. To verify with a real authenticated artisan session:
--   1. UPDATE one of your own product_images rows (e.g. is_cover)        -> succeeds
--   2. UPDATE your own row's product_id to another artisan's product id  -> rejected
--   3. UPDATE another artisan's row                                        -> 0 rows affected
--
-- Problem: the UPDATE policy's WITH CHECK only required artisan_id = auth.uid().
-- An artisan could therefore move one of their own image rows onto ANOTHER
-- artisan's product by updating product_id (the new row still has their
-- artisan_id). The INSERT policy already prevented this for new rows.
--
-- Fix: WITH CHECK now also requires the (new) parent product to belong to
-- auth.uid(), the same EXISTS check as the insert policy.

DROP POLICY IF EXISTS "product_images update own" ON product_images;

CREATE POLICY "product_images update own"
ON product_images FOR UPDATE
TO authenticated
USING (artisan_id = auth.uid())
WITH CHECK (
  artisan_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_images.product_id
      AND p.artisan_id = auth.uid()
  )
);
