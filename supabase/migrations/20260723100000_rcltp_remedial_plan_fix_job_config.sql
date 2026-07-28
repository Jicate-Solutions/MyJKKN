-- ============================================================================
-- RCLTP remedial-plan draft loop — ai_job_types config fix
-- 2026-07-23 — corrects the Slice-1 registration for 'rcltp.remedial_plan_draft'
-- so the ₹0 Windows AI-Max seat can actually run the job.
-- ----------------------------------------------------------------------------
-- The Slice-1 seed (20260723060000_rcltp_remedial_plan_draft_loop.sql) registered
-- this {{prompt}}-glue job with two config values that made the Max seat fail
-- BEFORE it ever called the model:
--   1. input_schema declared `learner_id` required=true. The seat validates a
--      job type's required inputs against the payload TOP LEVEL, but the enqueue
--      path (enqueueJobsLane / fn_ai_enqueue_system) sends payload = { prompt,
--      _ctx } — the domain keys live inside _ctx, not at top level. So the seat
--      errored "missing required input(s): learner_id" in ~3s.
--   2. prompt_template was NULL (never set by the Slice-1 INSERT). After (1) was
--      fixed the seat then errored "empty prompt after template fill": it
--      substitutes the payload into prompt_template, and NULL yields an empty
--      prompt.
--
-- Every working {{prompt}}-glue Max job (curriculum.lesson_spine_generate,
-- pde.case_author) uses EXACTLY input_schema = a single required `prompt`
-- textarea AND prompt_template = '{{prompt}}'. This migration aligns
-- rcltp.remedial_plan_draft with that canonical pattern. The collector still
-- reads _ctx for recordDraft, unchanged.
--
-- Idempotent. Already applied live on prod 2026-07-23; codified here so a fresh
-- environment cannot re-inherit the broken Slice-1 values — the Slice-1
-- ON CONFLICT (job_type) DO UPDATE clause does NOT update input_schema or
-- prompt_template, so re-running Slice-1 would not self-heal an existing row.
--
-- Proof this fixes the ₹0 lane: after both fields were corrected, a real job
-- drained to status='done' on the Windows seat and the collector wrote a draft
-- with ai_model='maxlane:rcltp.remedial_plan_draft' (not the direct-path
-- 'direct:' prefix — which bypasses the seat entirely and had masked the bug).
-- ============================================================================

BEGIN;

UPDATE public.ai_job_types
SET
  input_schema    = '[{"key":"prompt","type":"textarea","label":"Assembled prompt","required":true}]'::jsonb,
  prompt_template = '{{prompt}}',
  updated_at      = now()
WHERE job_type = 'rcltp.remedial_plan_draft';

COMMIT;
