-- =============================================
-- MIGRATION: Widen bug-reports bucket allowed_mime_types
-- Date: 2026-05-08
-- Tier: 1 (data-touching, requires explicit approval before run on prod)
-- Description:
--   Allow PDF, CSV, plain text, JSON, xlsx/xls, docx/doc files to be uploaded
--   to the `bug-reports` Supabase storage bucket alongside images.
--
-- Why: MyJKKN's bug-reporter widget previously only accepted images. Users
--   need to attach Excel files, PDFs, CSV exports, and text logs to bugs to
--   give triagers full context. Widget + viewer support was added in PR
--   feat(bug-widget-non-image-attachments). This migration brings the bucket
--   policy in line.
--
-- Defensive design:
--   1. Only updates if bucket exists (was created manually via dashboard).
--   2. Preserves any image MIMEs already configured.
--   3. Idempotent — safe to re-run.
--
-- Verification (run AFTER apply):
--   SELECT name, allowed_mime_types
--   FROM storage.buckets
--   WHERE name = 'bug-reports';
-- =============================================

DO $$
DECLARE
  current_mimes TEXT[];
  new_mimes TEXT[];
BEGIN
  -- Check bucket exists
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'bug-reports') THEN
    RAISE NOTICE 'bug-reports bucket does not exist. Skipping policy update.';
    RETURN;
  END IF;

  -- Get current allowed_mime_types (NULL means "all types allowed")
  SELECT allowed_mime_types FROM storage.buckets WHERE name = 'bug-reports'
    INTO current_mimes;

  IF current_mimes IS NULL THEN
    RAISE NOTICE 'bug-reports bucket currently allows ALL MIME types. No update needed.';
    RETURN;
  END IF;

  -- Union current MIMEs with the new document types
  new_mimes := ARRAY(
    SELECT DISTINCT unnest(current_mimes || ARRAY[
      -- Documents (NEW)
      'application/pdf',
      'text/csv',
      'text/plain',
      'application/json',
      -- Microsoft Office (NEW)
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ]::TEXT[])
  );

  UPDATE storage.buckets
  SET allowed_mime_types = new_mimes
  WHERE name = 'bug-reports';

  RAISE NOTICE 'bug-reports bucket policy updated. Was % types, now % types.',
    array_length(current_mimes, 1), array_length(new_mimes, 1);
END $$;
