-- Migration: Add store logo and hero image URLs to store_settings
-- and create a dedicated storage bucket for store images.

-- 1. Add new columns to store_settings
ALTER TABLE store_settings
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

-- 2. Create storage bucket for store images (public, so customers can view)
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-images', 'store-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS: anyone can read store images
DROP POLICY IF EXISTS "store_images_public_select" ON storage.objects;
CREATE POLICY "store_images_public_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-images');

-- 4. Storage RLS: admin/manager can insert
DROP POLICY IF EXISTS "store_images_staff_insert" ON storage.objects;
CREATE POLICY "store_images_staff_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'store-images'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
    OR (auth.jwt() ->> 'role' = 'service_role')
  )
);

-- 5. Storage RLS: admin/manager can update
DROP POLICY IF EXISTS "store_images_staff_update" ON storage.objects;
CREATE POLICY "store_images_staff_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'store-images'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
    OR (auth.jwt() ->> 'role' = 'service_role')
  )
)
WITH CHECK (
  bucket_id = 'store-images'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
    OR (auth.jwt() ->> 'role' = 'service_role')
  )
);

-- 6. Storage RLS: admin/manager can delete
DROP POLICY IF EXISTS "store_images_staff_delete" ON storage.objects;
CREATE POLICY "store_images_staff_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'store-images'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
    OR (auth.jwt() ->> 'role' = 'service_role')
  )
);
