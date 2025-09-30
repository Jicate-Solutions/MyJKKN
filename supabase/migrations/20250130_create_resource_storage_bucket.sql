-- Migration: Create storage bucket for resource images
-- Date: 2025-01-30
-- Description: Set up storage bucket and policies for resource management images

-- Create storage bucket for resource images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resource-images',
  'resource-images',
  true, -- Public bucket for easy access
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for authenticated users to upload
CREATE POLICY IF NOT EXISTS "Authenticated users can upload resource images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resource-images'
);

-- Create storage policy for authenticated users to update
CREATE POLICY IF NOT EXISTS "Authenticated users can update their resource images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'resource-images')
WITH CHECK (bucket_id = 'resource-images');

-- Create storage policy for authenticated users to delete
CREATE POLICY IF NOT EXISTS "Authenticated users can delete resource images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'resource-images');

-- Create storage policy for public read access
CREATE POLICY IF NOT EXISTS "Public can view resource images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'resource-images');

-- Add comment
COMMENT ON POLICY "Authenticated users can upload resource images" ON storage.objects IS 
'Allows authenticated users to upload images to the resource-images bucket';
