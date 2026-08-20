-- Campus Walk — private photo bucket + ₹0 Max-lane job type
-- Spec: specs/campus-walk-2026-08-17.md (13 Director decisions, 5 guardrails)
--
-- WHAT THIS IS FOR
-- The Director walks the 28-acre campus, photographs a physical condition (a dirty
-- toilet, a broken light), and it is routed to whoever owns it. D13 splits the
-- outcome: a SYMPTOM is one action; a SYSTEM GAP ("there is no cleaning SOP") is
-- broader work. Both become project_tasks under the standing CAMPUS-OPS project.
--
-- WHY NOT grievance_tickets (reversal recorded 2026-08-19)
-- grievance_tickets looked like the natural home — it has assigned_to, real SLA
-- columns and a business-day deadline RPC. It is the wrong home. Nothing that counts
-- those rows filters by type, and one of the counters is a STAFF PERFORMANCE SCORE:
-- 20260722200000_hod_metrics_add_overdue_ages.sql computes an HOD's grievance
-- resolution percentage straight from COUNT(*) on that table. Filing facility photos
-- there would drag down a department head's rating and inflate the NAAC/UGC grievance
-- figures exported by app/api/b2a/grievance/dashboard. That is precisely the harm
-- guardrail G1 exists to prevent, so campus conditions never touch that table.
--
-- Version 20260909000000 is deliberately above the highest existing migration
-- (20260908034127): parallel lanes otherwise all reach for the same "next" timestamp
-- and collide.

-- Wrapped in a transaction: section 2 DROPs the lane CHECK on the populated
-- ai_job_types and re-ADDs it. Un-wrapped, a failure between those two statements
-- leaves the table with NO lane constraint — a partial-failure window on a table
-- every AI feature routes through.
BEGIN;

-- ── 1. Private bucket for walk photos ───────────────────────────────────────
-- PRIVATE by design and non-negotiable (guardrail G4). A photo taken in a corridor,
-- a hostel or a washroom block can contain identifiable students and staff even when
-- the subject is a broken fitting. A public bucket would make every such photo
-- enumerable by URL. The upload route also strips EXIF before storing, so location
-- is captured explicitly and with intent rather than leaking through image metadata.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campus-walk', 'campus-walk', false,
  10485760,  -- 10 MB, matching card-scans; a compressed phone photo is ~1-3 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Service role only. The upload route runs server-side because it must hash and
-- dedupe before storing, and the Max-lane runner downloads with the service key.
-- No client-side policy is granted on purpose: a browser must never be able to
-- enumerate campus photos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'campus_walk_service_role_only'
  ) THEN
    CREATE POLICY campus_walk_service_role_only ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'campus-walk')
      WITH CHECK (bucket_id = 'campus-walk');
  END IF;
END $$;

-- ── 2. Allow the new sub-lane ───────────────────────────────────────────────
-- fn_ai_claim filters on lane with NO job_type filter, so lane IS the routing key.
-- A dedicated 'max-campus' sub-lane means walk photos can neither starve the chat
-- lane nor be claimed by a runner that does not know how to stage an image on disk.
-- Deliberately NOT reusing 'max-cards': that runner stages a visiting card and
-- returns contact fields; it would claim walk jobs it cannot answer.
--
-- Additive only — every existing value is preserved, so no current row can break.
ALTER TABLE public.ai_job_types DROP CONSTRAINT IF EXISTS ai_job_types_lane_chk;
ALTER TABLE public.ai_job_types ADD CONSTRAINT ai_job_types_lane_chk
  CHECK (lane = ANY (ARRAY[
    'max'::text, 'api'::text, 'either'::text,
    'max-pdf'::text, 'max-sentiment'::text, 'max-pde'::text,
    'max-cards'::text,
    'max-campus'::text
  ]));

-- ── 3. Max-lane job type ────────────────────────────────────────────────────
-- interactive = TRUE is load-bearing. Measured on this database: interactive jobs
-- are claimed in ~8 s, batch jobs in ~8,209 s (2.3 hours). The Director confirms the
-- suggested destination while still standing in front of the problem (D3) — a
-- 2-hour turnaround would make the confirm step impossible and the feature unused.
--
-- provider / model_id stay NULL: that is the ₹0 recipe — the runner falls to the
-- Max-subscription Claude CLI. Setting either would put this on the paid API, which
-- the Director ruled out on 2026-08-18.
--
-- NOTE FOR DEPLOYMENT: the runner that drains this lane lives OUTSIDE this repo and
-- must learn 'campus.walk_classify' before classification works. Until it does,
-- capture still functions — the Director picks the destination manually (D3 already
-- requires human confirmation, so the manual path is the same UI minus the suggestion).
INSERT INTO ai_job_types (
  job_type, title, description,
  lane, interactive, enabled,
  provider, model_id,
  expected_seconds, max_inflight
)
VALUES (
  'campus.walk_classify',
  'Campus Walk classify',
  'Reads a campus condition photo plus one line of text and suggests destination '
  || '(symptom / system gap), category and likely owner, for human confirmation.',
  'max-campus', true, true,
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
