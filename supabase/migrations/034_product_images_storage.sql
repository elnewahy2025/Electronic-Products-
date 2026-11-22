-- ============================================================
-- 034_product_images_storage.sql
-- Supabase Storage bucket for product covers & gallery images
-- ============================================================

-- 1. Create public bucket for optimized WebP product images (5 MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS: public read only; all writes go through server API (service_role)
DROP POLICY IF EXISTS product_images_public_read ON storage.objects;
CREATE POLICY product_images_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

-- 3. Track storage_path on products & product_gallery_images for clean deletion
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cover_storage_path text;

ALTER TABLE product_gallery_images
  ADD COLUMN IF NOT EXISTS storage_path text;
