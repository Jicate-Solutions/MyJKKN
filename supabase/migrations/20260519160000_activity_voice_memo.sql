-- ============================================================================
-- Voice memo support on admission_lead_activities
-- ============================================================================
-- Created: 2026-05-19
-- Purpose:
--   The new Activities tab on the enquiry page (/learners/enquiries/[id]/edit)
--   lets admission officers attach a voice memo + note to a lead's activity
--   timeline. The existing VoiceMemoRecorder writes to a Supabase storage
--   bucket and returns a public URL — we store that URL + duration on the
--   activity row.
--
-- Schema changes:
--   1. admission_lead_activities gains voice_memo_url (text, nullable) and
--      voice_memo_duration_sec (int, nullable).
--   2. New storage bucket 'activity-memos' with service-role write +
--      public read (mirrors call-memos bucket).
-- ============================================================================

ALTER TABLE public.admission_lead_activities
  ADD COLUMN IF NOT EXISTS voice_memo_url text,
  ADD COLUMN IF NOT EXISTS voice_memo_duration_sec int;

-- Create the storage bucket. INSERT-ON-CONFLICT DO NOTHING so re-running
-- the migration is idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('activity-memos', 'activity-memos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: service role can write/read everything (the API uses
-- service-role for all activity operations). Authenticated users can READ
-- the bucket (so timeline UIs can play back attached memos).
DO $$
BEGIN
  -- Public read access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'activity_memos_public_read'
  ) THEN
    CREATE POLICY activity_memos_public_read
    ON storage.objects FOR SELECT
    USING (bucket_id = 'activity-memos');
  END IF;

  -- Service role write
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'activity_memos_service_write'
  ) THEN
    CREATE POLICY activity_memos_service_write
    ON storage.objects FOR INSERT
    TO service_role
    WITH CHECK (bucket_id = 'activity-memos');
  END IF;
END $$;
