-- ============================================================================
-- 20260713170000_loop_zero_rupee_induction_effectiveness.sql
-- ----------------------------------------------------------------------------
-- ₹0 loop migration — generator 4: induction.session_effectiveness. A SINGLE-SHOT
-- loop (inline messages.create per weak topic) restructured into enqueue+collect
-- on lane='jobs'. Depends on the foundation (20260713140000). The cron assembles
-- the SYSTEM_PROMPT + per-topic userPrompt and passes it as payload.prompt (glue
-- {{prompt}}); collect parses the tip JSON and records via the IDENTICAL
-- fn_induction_record_session_tip (byte-parity). tool_set='none', interactive=false.
--
-- Additive + idempotent. Validated rolled-back on prod before apply.
-- ============================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, schedulable, enabled, input_schema, expected_seconds)
VALUES
  ('induction.session_effectiveness',
   'Induction — Session-effectiveness tip (loop generator)',
   'Loop generator: for an induction topic whose first batch run scored weak, proposes a value-first improvement for its next batch run. Recorded via fn_induction_record_session_tip. Migrated onto the #1998 Max lane behind loops.induction_session_effectiveness.generation_lane.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 30)
ON CONFLICT (job_type) DO NOTHING;

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, publication_state)
SELECT
  'loops.induction_session_effectiveness.generation_lane', 'global', NULL,
  '"jobs"'::jsonb,
  'Generation lane for the induction session-effectiveness loop generator: ''jobs'' = enqueue on the #1998 ai_jobs Max lane (₹0); ''direct'' = the legacy inline Anthropic path. Flip-back switch (no deploy).',
  'string', true, true, 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'loops.induction_session_effectiveness.generation_lane'
     AND scope_type = 'global' AND scope_id IS NULL
);
