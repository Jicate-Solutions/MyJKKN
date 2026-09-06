-- ============================================================================
-- 20260713180000_loop_zero_rupee_escalation.sql
-- ----------------------------------------------------------------------------
-- ₹0 loop migration — generator 5: session_feedback.escalation. A weekly digest
-- that AI-summarizes each escalated class then applies ONE idempotent digest.
-- Because the digest is SYNCHRONOUS (all summaries must be ready before
-- fn_scf_apply_weekly_escalation_digest), lane='jobs' enqueues each summary and
-- BOUNDED-POLLS the drain, falling back to the existing per-class TEMPLATE for any
-- summary not ready by the deadline (the route already degrades to the template
-- when AI is unavailable — so timeouts are byte-parity with a no-AI run).
-- Depends on the foundation (20260713140000). tool_set='none', interactive=false.
--
-- Additive + idempotent. Validated rolled-back on prod before apply.
-- ============================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, schedulable, enabled, input_schema, expected_seconds)
VALUES
  ('session_feedback.escalation',
   'Session Feedback — Escalation briefing (loop generator)',
   'Loop generator: writes a 2-3 sentence leadership briefing for a class escalated in the weekly session-feedback digest. Enqueued per class; the digest is applied synchronously with a per-class template fallback. Migrated onto the #1998 Max lane behind loops.session_feedback_escalation.generation_lane.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 20)
ON CONFLICT (job_type) DO NOTHING;

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, publication_state)
SELECT
  'loops.session_feedback_escalation.generation_lane', 'global', NULL,
  '"jobs"'::jsonb,
  'Generation lane for the weekly session-feedback escalation digest: ''jobs'' = enqueue each briefing on the #1998 ai_jobs Max lane (₹0), bounded-poll with template fallback; ''direct'' = the legacy inline Anthropic path. Flip-back switch (no deploy).',
  'string', true, true, 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'loops.session_feedback_escalation.generation_lane'
     AND scope_type = 'global' AND scope_id IS NULL
);
