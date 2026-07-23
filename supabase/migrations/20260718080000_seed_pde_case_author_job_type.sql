-- ============================================================================
-- 20260718080000_seed_pde_case_author_job_type.sql
-- ----------------------------------------------------------------------------
-- ONE internal ai_job_types recipe, `pde.case_author`: given a DE-IDENTIFIED
-- dental casesheet (pulled server-to-server from the PMS app), draft OSCE-domain
-- clinical-reasoning questions + domain weights + ground-truth for a PDE
-- clinical_case. ₹0 Max lane, text-only.
--
-- Glue prompt_template ({{prompt}}): app/api/pde/cases/import-from-pms assembles
-- the FULL prompt (fenced de-identified case facts + strict-JSON output spec) and
-- passes it as payload.prompt via enqueueJobsLane (fn_ai_enqueue_system,
-- service_role). The Max BATCH drain returns the model text in ai_jobs.result;
-- the route parses it and returns the assembled draft to the faculty form
-- builder for REVIEW — no case is written until the faculty clicks "Save as
-- draft" (AI clinical content is never auto-created).
--
-- Security shape (mirrors the bug.triage recipe, 20260717100000):
--   tool_set='none'         → text-only; case facts fenced as untrusted data
--                             (injection-inert — no tools to hijack).
--   interactive=false       → served by the BATCH drain. (The CHAT drain refuses
--                             non-chat jobs, so interactive=true would fail 100%
--                             — see feedback_interactive_job_type_only_served_by_chat_drain.)
--   allow_rule='seat_owner' → the generic authenticated enqueue path is locked to
--                             the seat allowlist; the real door is the faculty-gated
--                             import route enqueuing via fn_ai_enqueue_system.
--   external_allowed=false  → NOT reachable through the external AI Door.
-- ============================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, external_allowed)
VALUES
('pde.case_author',
 'PDE — draft clinical-reasoning case from a de-identified casesheet',
 'Given a de-identified dental casesheet pulled from the PMS app, draft OSCE-domain questions + domain weights + ground-truth for a PDE clinical_case. Enqueued ONLY via fn_ai_enqueue_system from the faculty-gated /api/pde/cases/import-from-pms route; the assembled draft is returned to the faculty form builder for review before any case is created.',
 '{{prompt}}',
 'none', 'job.result', false, 'max', 'seat_owner', 3, false, true,
 '[{"key":"prompt","type":"textarea","label":"prompt","required":true}]'::jsonb,
 60, false)
ON CONFLICT (job_type) DO UPDATE SET
  title            = EXCLUDED.title,
  description      = EXCLUDED.description,
  prompt_template  = EXCLUDED.prompt_template,
  tool_set         = EXCLUDED.tool_set,
  output_target    = EXCLUDED.output_target,
  interactive      = EXCLUDED.interactive,
  lane             = EXCLUDED.lane,
  allow_rule       = EXCLUDED.allow_rule,
  max_inflight     = EXCLUDED.max_inflight,
  schedulable      = EXCLUDED.schedulable,
  enabled          = EXCLUDED.enabled,
  input_schema     = EXCLUDED.input_schema,
  expected_seconds = EXCLUDED.expected_seconds,
  external_allowed = EXCLUDED.external_allowed,
  updated_at       = now();
