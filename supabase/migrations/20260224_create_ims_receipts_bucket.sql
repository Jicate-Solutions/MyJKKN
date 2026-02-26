-- Migration: Create storage bucket for IMS receipt PDFs
-- Date: 2026-02-24
-- Description: Provision the ims-receipts bucket required by lib/utils/ims-receipt-pdf.ts
--              The ims_sales.receipt_pdf_url column was added in 20260224_add_receipt_pdf_url_to_ims_sales.sql
--              but the storage bucket was not created at that time, causing StorageApiError: Bucket not found.

-- Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ims-receipts',
  'ims-receipts',
  true,           -- Public: receipt URLs are shared with customers via WhatsApp/email
  10485760,       -- 10MB limit (PDFs are small; 10MB is generous headroom)
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Note: CREATE POLICY IF NOT EXISTS requires PG17+; Supabase runs PG15/16.
-- Use DROP IF EXISTS → CREATE for idempotent re-runs.
DROP POLICY IF EXISTS "Authenticated users can upload IMS receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update IMS receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete IMS receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public can view IMS receipts" ON storage.objects;

-- Authenticated users can upload receipts (fire-and-forget from POS sale completion)
CREATE POLICY "Authenticated users can upload IMS receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ims-receipts');

-- Authenticated users can overwrite receipts (required for upsert: true in upload call)
CREATE POLICY "Authenticated users can update IMS receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'ims-receipts')
WITH CHECK (bucket_id = 'ims-receipts');

-- Authenticated users can delete receipts
CREATE POLICY "Authenticated users can delete IMS receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'ims-receipts');

-- Public read: receipt links shared via WhatsApp/email must be publicly accessible
CREATE POLICY "Public can view IMS receipts"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'ims-receipts');
