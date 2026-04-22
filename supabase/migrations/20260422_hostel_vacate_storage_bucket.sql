-- Migration: Storage bucket for hostel vacate documents (PR-B, 2026-04-22)
--
-- Creates a non-public bucket. Authorization is enforced at the
-- hostel_vacate_documents table RLS (PR-A) + service layer; storage RLS
-- here is intentionally loose (authenticated users can CRUD files) because
-- the hostel_vacate_documents row is the access-control surface and its
-- RLS already joins back to hostel_vacate_requests.

-- ─── BUCKET ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hostel-vacate-documents',
  'hostel-vacate-documents',
  false,
  5242880,  -- 5 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── RLS on storage.objects ────────────────────────────────────────────────
-- Loose: authenticated users can upload / read / delete own files. The real
-- authorization happens on hostel_vacate_documents.
DROP POLICY IF EXISTS hvd_storage_select ON storage.objects;
CREATE POLICY hvd_storage_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'hostel-vacate-documents');

DROP POLICY IF EXISTS hvd_storage_insert ON storage.objects;
CREATE POLICY hvd_storage_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'hostel-vacate-documents');

DROP POLICY IF EXISTS hvd_storage_delete ON storage.objects;
CREATE POLICY hvd_storage_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hostel-vacate-documents'
    AND (owner = auth.uid() OR is_super_admin() OR is_admin())
  );
