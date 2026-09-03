-- Campus Walk — AI classification lane (job type + lane CHECK widen)
-- Spec: specs/campus-walk-2026-08-17.md (13 Director decisions, 5 guardrails)
--
-- SPLIT FROM the bucket migration (2026-09-03): this used to share a transaction
-- with 20261102010000_campus_walk_storage_bucket.sql, which creates the private
-- `campus-walk` storage bucket that photo capture depends on. This half touches
-- the shared, live ai_job_types table (a CHECK constraint and a seed row) whose
-- current contents cannot be verified from the repo. It belongs to an AI
-- classification lane that is currently inert and has no consumer — see the
-- deployment note below. If this half ever fails, that failure must stay
-- contained to the optional lane and never take the bucket down with it. They are
-- now two independent migrations, ORDERED so this one lands SECOND, after the
-- bucket, and can fail without affecting it.
--
-- Version 20261102020000 is above the highest version on jicate/main at split time
-- and clear of every version claimed by other open PRs (checked 2026-09-03).

BEGIN;

-- ── Allow the new sub-lane ───────────────────────────────────────────────
-- fn_ai_claim filters on lane with NO job_type filter, so lane IS the routing key.
-- A dedicated 'max-campus' sub-lane means walk photos can neither starve the chat
-- lane nor be claimed by a runner that does not know how to stage an image on disk.
-- Deliberately NOT reusing 'max-cards': that runner stages a visiting card and
-- returns contact fields; it would claim walk jobs it cannot answer.
--
-- Additive only — every existing value is preserved, so no current row can break.
--
-- Wrapped in a transaction: a failure between the DROP and the re-ADD below would
-- leave ai_job_types with NO lane constraint at all — a partial-failure window on a
-- table every AI feature routes through. That risk is now isolated to this file; it
-- can no longer take the storage bucket migration down with it.
ALTER TABLE public.ai_job_types DROP CONSTRAINT IF EXISTS ai_job_types_lane_chk;
ALTER TABLE public.ai_job_types ADD CONSTRAINT ai_job_types_lane_chk
  CHECK (lane = ANY (ARRAY[
    'max'::text, 'api'::text, 'either'::text,
    'max-pdf'::text, 'max-sentiment'::text, 'max-pde'::text,
    'max-cards'::text,
    'max-campus'::text
  ]));

-- ── Max-lane job type ────────────────────────────────────────────────────
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
