-- =====================================================================
-- Voice Memo Pipeline — schema additions for admission_call_logs
-- =====================================================================
-- TIER-0 safe-additive migration. Adds 11 nullable columns + 1 partial
-- index to admission_call_logs. No DROPs, no NOT NULL on existing rows,
-- no RLS changes here (storage RLS lives in companion migration).
--
-- EMPIRICAL CONTEXT (Director's Path A, 2026-05-09):
--   Counselors call admission leads from personal phones (Exotel
--   click-to-call too costly per call), so the cheapest accurate
--   sentiment-capture path is: counselor records a 30-second English
--   voice memo after each call → Whisper transcribes (forced en) →
--   GPT-4o-mini extracts sentiment + summary + categories.
--
--   Whisper Tamil accuracy is ~21% (Soniox benchmark) — effectively
--   garbage. The pipeline rejects non-English audio at the language-
--   detection guardrail (`memo_analyze_status = 'rejected_non_english'`)
--   so GPT never wastes tokens on unintelligible transcripts.
--
-- COLUMNS:
--   memo_audio_url               — Supabase Storage path (call-memos bucket)
--   memo_audio_size_bytes        — guard against >5MB uploads
--   memo_audio_duration_seconds  — for cost monitoring
--   memo_transcript              — raw Whisper output
--   memo_transcript_language     — Whisper language detect (must be 'en')
--   memo_sentiment               — positive | neutral | concerned | anxious | hostile
--   memo_sentiment_score         — 0.0–1.0 (1=very positive)
--   memo_summary                 — 1-2 sentence GPT summary
--   memo_categories              — array from canonical taxonomy
--   memo_analyze_status          — pending | transcribing | analyzing |
--                                  completed | failed | rejected_non_english
--   memo_analyzed_at             — completion timestamp
--
-- INDEX:
--   idx_admission_call_logs_memo_pending — partial index for cron sweeper
--   covers WHERE memo_audio_url IS NOT NULL AND status IN ('pending','failed').
--   Cron route /api/cron/analyze-voice-memos hits this every 5 min.
-- =====================================================================

ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_audio_url TEXT;
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_audio_size_bytes INTEGER;
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_audio_duration_seconds NUMERIC;
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_transcript TEXT;
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_transcript_language TEXT;
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_sentiment TEXT;
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_sentiment_score NUMERIC;
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_summary TEXT;
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_categories TEXT[];
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_analyze_status TEXT DEFAULT 'pending';
ALTER TABLE admission_call_logs ADD COLUMN IF NOT EXISTS memo_analyzed_at TIMESTAMPTZ;

-- Constrain to known statuses defensively (NOT VALID so existing rows aren't blocked).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admission_call_logs_memo_analyze_status_check'
  ) THEN
    ALTER TABLE admission_call_logs
      ADD CONSTRAINT admission_call_logs_memo_analyze_status_check
      CHECK (
        memo_analyze_status IS NULL
        OR memo_analyze_status IN (
          'pending', 'transcribing', 'analyzing',
          'completed', 'failed', 'rejected_non_english'
        )
      ) NOT VALID;
  END IF;
END $$;

-- Partial index — cron sweeper queries this thousands of times/day.
CREATE INDEX IF NOT EXISTS idx_admission_call_logs_memo_pending
  ON admission_call_logs(memo_analyze_status)
  WHERE memo_audio_url IS NOT NULL
    AND memo_analyze_status IN ('pending', 'failed');

COMMENT ON COLUMN admission_call_logs.memo_audio_url IS
  'Supabase Storage path: call-memos/{institution_id}/{call_log_id}.webm. NULL until counselor uploads.';
COMMENT ON COLUMN admission_call_logs.memo_analyze_status IS
  'Pipeline status: pending → transcribing → analyzing → completed | failed | rejected_non_english.';
COMMENT ON COLUMN admission_call_logs.memo_transcript_language IS
  'Whisper language-detection result. Must equal ''en'' for GPT analysis to proceed.';

-- =====================================================================
-- Storage bucket: call-memos
-- =====================================================================
-- Private bucket (public=false), 5MB cap, audio MIME whitelist.
-- Path: call-memos/{institution_id}/{call_log_id}.webm
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-memos',
  'call-memos',
  false,
  5242880,  -- 5MB
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- =====================================================================
-- Storage RLS policies for call-memos bucket
-- =====================================================================
-- INSERT: authenticated users may upload to a path whose first folder
--   matches their profile.institution_id. Counselors stay in their lane;
--   super_admins (no institution scoping) can upload anywhere.
-- SELECT: same institution-scoping rule.
-- DELETE: super_admin only (TIER-3 destructive — counselors cannot
--   permanently lose voice memos by accident).
--
-- Pattern reference: solutions-documents (20260221000002) but extended
-- with institution-scoping via storage.foldername(name)[1].
-- =====================================================================

DROP POLICY IF EXISTS "Counselors upload voice memos to own institution" ON storage.objects;
CREATE POLICY "Counselors upload voice memos to own institution"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'call-memos'
  AND (
    -- super_admin: bypass institution scoping
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_super_admin = true OR profiles.role = 'super_admin')
    )
    OR
    -- regular user: first folder must match their institution_id
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.institution_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Counselors view voice memos of own institution" ON storage.objects;
CREATE POLICY "Counselors view voice memos of own institution"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'call-memos'
  AND (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.is_super_admin = true OR profiles.role = 'super_admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.institution_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Super admins delete voice memos" ON storage.objects;
CREATE POLICY "Super admins delete voice memos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'call-memos'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.is_super_admin = true OR profiles.role = 'super_admin')
  )
);

