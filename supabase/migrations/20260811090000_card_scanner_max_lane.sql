-- Business-card scanner — storage + ₹0 Max-lane job type
-- Spec: specs/card-scanner-max-lane-handoff-2026-08-05.md
-- Director decisions (interview 2026-08-01/02, 19 items) + 2026-08-05 instruction
-- that OCR runs on the Max lane like every other AI feature (no paid API path).
--
-- Version 20260811090000 chosen deliberately above the highest existing
-- migration (20260810130000): parallel lanes otherwise all reach for the same
-- "next" timestamp and collide (feedback_parallel_fanout_must_allocate_migration_versions).

-- Wrapped in a transaction (added 2026-08-05, PR #2835 review finding #5):
-- section 2 DROPs the lane CHECK on the populated ai_job_types and re-ADDs it.
-- Un-wrapped, a failure between those two statements leaves the table with NO
-- lane constraint at all — a partial-failure window on a table every AI feature
-- routes through. NOTE: this file was already applied to production before the
-- wrapper was added; the wrapper protects re-runs and other environments.
BEGIN;

-- ── 1. Private bucket for card photos ───────────────────────────────────────
-- PRIVATE by design: a visiting card is personal data. Director decision 11
-- keeps the photo as provenance ("why do you have my details?") AND requires a
-- real delete on request — both of which need a non-public bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-scans', 'card-scans', false,
  10485760,  -- 10 MB: phone photos of a 9x5cm card are ~1-3 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Only the service role touches this bucket: the upload route runs server-side
-- (it must hash + dedupe before storing), and the Windows runner downloads with
-- the service key. No client-side policy is granted on purpose — a browser must
-- never be able to enumerate other people's card photos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'card_scans_service_role_only'
  ) THEN
    CREATE POLICY card_scans_service_role_only ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'card-scans')
      WITH CHECK (bucket_id = 'card-scans');
  END IF;
END $$;

-- ── 2. Allow the new sub-lane ───────────────────────────────────────────────
-- ai_job_types.lane carries a CHECK enumerating every legal lane; 'max-cards'
-- must join it before the row below can exist (caught by a rolled-back dry run,
-- 2026-08-05 — the fourth constraint this build met the hard way).
--
-- Deliberately NOT reusing the already-allowed-but-unused 'max-pdf': a card is
-- not a PDF, and sharing a lane would let a future PDF runner claim card jobs it
-- cannot stage — fn_ai_claim filters on lane with NO job_type filter, so lane IS
-- the routing key. Two file-shaped features still need two lanes.
--
-- Additive only: every existing value is preserved, so no current row can break.
ALTER TABLE public.ai_job_types DROP CONSTRAINT IF EXISTS ai_job_types_lane_chk;
ALTER TABLE public.ai_job_types ADD CONSTRAINT ai_job_types_lane_chk
  CHECK (lane = ANY (ARRAY[
    'max'::text, 'api'::text, 'either'::text,
    'max-pdf'::text, 'max-sentiment'::text, 'max-pde'::text,
    'max-cards'::text
  ]));

-- ── 3. Max-lane job type ────────────────────────────────────────────────────
-- interactive = TRUE is load-bearing, not a preference. Measured over 14 days
-- on this database: interactive jobs are claimed in ~8 s; batch jobs in ~8,209 s
-- (2.3 hours). A counsellor holding a card at a fair cannot wait 2 hours, so a
-- batch card job would be a feature that technically exists and never gets used.
--
-- provider / model_id stay NULL: that is the ₹0 recipe — the runner falls to the
-- Max-subscription Claude CLI. Setting either one would put this on the paid API,
-- which is exactly what the Director's instruction rules out.
--
-- lane 'max-cards' is a dedicated sub-lane: fn_ai_claim filters on lane with NO
-- job_type filter, so cards can neither starve the chat lane nor be claimed by
-- a runner that does not know how to stage an image on disk.
INSERT INTO ai_job_types (
  job_type, title, description,
  lane, interactive, enabled,
  provider, model_id,
  expected_seconds, max_inflight
)
VALUES (
  'contacts.card_extract',
  'Business-card extract',
  'Reads a scanned visiting card image and returns structured contact fields for human confirmation.',
  'max-cards', true, true,
  NULL, NULL,
  20, 4
)
ON CONFLICT (job_type) DO UPDATE
SET lane             = EXCLUDED.lane,
    interactive      = EXCLUDED.interactive,
    enabled          = EXCLUDED.enabled,
    expected_seconds = EXCLUDED.expected_seconds,
    max_inflight     = EXCLUDED.max_inflight,
    updated_at       = now();

COMMIT;
