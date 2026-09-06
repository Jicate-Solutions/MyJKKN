-- ============================================================================
-- PDE coach + OSCE scoring → ₹0 max-pde sub-lane (Stage 3a job-type registration)
-- ============================================================================
-- Created: 2026-07-28. Applied by the orchestrator with a BEGIN…ROLLBACK
-- rehearsal — NOT auto-applied by any deploy.
--
-- REQUIRES 20260807100000_max_sentiment_pde_sublanes.sql (Stage 2a) APPLIED
-- FIRST — that migration widens ai_job_types_lane_chk and fn_ai_job_type_upsert
-- to include 'max-pde'. Without it these INSERTs fail the CHECK constraint.
--
-- WHAT: registers the two interactive PDE job types the Stage-3 code enqueues
-- when the Max lane is active:
--   pde.clinical_reasoning.coach  — Socratic feedback   (/api/pde/coach)
--   pde.osce_score                — per-domain OSCE score (/api/pde/clinical-reasoning/score)
-- Both interactive=true (a student is waiting), lane='max-pde' (isolated from
-- ai_query.chat), provider/model NULL, prompt_template='{{prompt}}' (glue — the
-- service assembles the full prompt into payload.prompt).
--
-- SHIPS DARK: enabled=FALSE. While dark, fn_ai_enqueue_system returns 'unknown
-- or disabled job_type' and pdeMaxLaneActive() returns false, so the PDE code
-- keeps running its existing direct Gemini path. CUTOVER (human): prove the
-- max-pde box runner claims a test job on each type, then flip
-- enabled=true + provider='anthropic' + a Claude model_id — AND re-tune the
-- Socratic + OSCE prompts for Claude with a human quality eyeball (spec §3d)
-- before students see it.
--
-- ADDITIVE / IDEMPOTENT. The ON CONFLICT deliberately does NOT touch
-- enabled/provider/model — a re-run never un-darks or re-providers a row the
-- Director already cut over.
--
-- Every relation here already carries the ai_job_types grants; no new object,
-- so no new anon revoke needed.
-- ============================================================================

BEGIN;

INSERT INTO public.ai_job_types (
  job_type, title, description, lane, interactive, enabled,
  provider, model_id, prompt_template, tool_set, allow_rule,
  output_target, max_inflight, expected_seconds, schedulable
) VALUES
  (
    'pde.clinical_reasoning.coach',
    'PDE · Clinical-Reasoning Coach',
    'Socratic clinical-reasoning feedback — ₹0 max-pde sub-lane (live student). Dark until the max-pde runner is proven; prompts need a Gemini→Claude re-tune before go-live.',
    'max-pde', true, false,
    NULL, NULL, '{{prompt}}', 'all', 'seat_owner',
    'job.result', 5, 60, false
  ),
  (
    'pde.osce_score',
    'PDE · OSCE Domain Scoring',
    'Per-domain OSCE rubric scoring — ₹0 max-pde sub-lane (live student). One job per rubric domain. Dark until the max-pde runner is proven; prompts need a Gemini→Claude re-tune before go-live.',
    'max-pde', true, false,
    NULL, NULL, '{{prompt}}', 'all', 'seat_owner',
    'job.result', 5, 60, false
  )
ON CONFLICT (job_type) DO UPDATE SET
  title            = EXCLUDED.title,
  description      = EXCLUDED.description,
  lane             = EXCLUDED.lane,
  interactive      = EXCLUDED.interactive,
  prompt_template  = EXCLUDED.prompt_template,
  tool_set         = EXCLUDED.tool_set,
  allow_rule       = EXCLUDED.allow_rule,
  output_target    = EXCLUDED.output_target,
  max_inflight     = EXCLUDED.max_inflight,
  expected_seconds = EXCLUDED.expected_seconds,
  schedulable      = EXCLUDED.schedulable,
  updated_at       = now();
  -- NB: enabled / provider / model_id intentionally NOT in the DO UPDATE set.

NOTIFY pgrst, 'reload schema';

COMMIT;
