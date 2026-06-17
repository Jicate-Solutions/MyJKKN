-- ============================================================================
-- Migration: 20260615000000_rcltp_p3_overwrite_and_audio
-- RCLTP v2 Phase 3 refinements (Director decisions, 2026-06-15)
-- ============================================================================
-- (Q1) Answers are LAST-WINS. rcltp_part_b_responses was append-only (no unique
--      key), so a re-answer created a duplicate row. Add UNIQUE(assessment_id,
--      question_id) so the responses route can upsert (onConflict) — one
--      authoritative answer per question per sitting. Verified safe to add:
--      prod has 0 rows / 0 duplicate pairs at apply time.
--
-- (Q2) Capture Part A VOICE now (scoring stays EKSAQ-gated). Private rcltp-audio
--      bucket, audio MIME only, 5 MB cap — mirrors the existing call-memos audio
--      bucket. ACCESS MODEL: uploads/downloads go through server-minted signed
--      URLs (service_role); the bucket carries NO authenticated/public object
--      policies, so children's voice recordings are reachable ONLY through the
--      gated server routes (POST /api/rcltp/recordings/upload-url issues a
--      path-scoped signed upload URL). This is intentionally stricter than the
--      platform's looser "any authenticated user can read bucket X" convention.
-- ============================================================================

-- (Q1) one response per (sitting, question) — enables upsert onConflict
ALTER TABLE rcltp_part_b_responses
  ADD CONSTRAINT rcltp_part_b_responses_assessment_question_uniq
  UNIQUE (assessment_id, question_id);

-- (Q2) private audio bucket (shape mirrors existing call-memos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rcltp-audio',
  'rcltp-audio',
  false,
  5242880,                                  -- 5 MB
  ARRAY['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- NOTE: deliberately NO storage.objects policies for rcltp-audio. Access is
-- exclusively via service-role signed URLs minted by the Phase-3 routes. Adding
-- a broad "authenticated can read" policy here would expose every child's voice
-- recording to every signed-in user — do NOT add one.
