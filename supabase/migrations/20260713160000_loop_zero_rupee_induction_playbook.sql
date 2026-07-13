-- ============================================================================
-- 20260713160000_loop_zero_rupee_induction_playbook.sql
-- ----------------------------------------------------------------------------
-- ₹0 loop migration — generator 3: induction.generate_playbook. Single-phase
-- batch loop (one playbook per fresher cohort), same shape as curriculum. Depends
-- on the foundation (20260713140000). On lane='jobs' the cron enqueues each
-- cohort's playbook prompt (glue {{prompt}}) and records via the IDENTICAL
-- fn_induction_record_loop_suggestion (byte-parity). tool_set='none',
-- interactive=false → generic Windows seat drain.
--
-- Additive + idempotent. Validated rolled-back on prod before apply.
-- Ref: .claude/loop-lane-workorder-20260713.md §B; PR feat/loop-zero-induction-playbook.
-- ============================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, schedulable, enabled, input_schema, expected_seconds)
VALUES
  ('induction.generate_playbook',
   'Induction — Cohort Playbook (loop generator)',
   'Loop generator: for a fresher induction cohort, generates a value-balanced playbook to beat the prior cohort''s measured join score. Recorded via fn_induction_record_loop_suggestion. Migrated onto the #1998 Max lane behind loops.induction_generate_playbook.generation_lane. The cron assembles the full prompt and passes it as payload.prompt.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 60)
ON CONFLICT (job_type) DO NOTHING;

-- Switch seed (identity-guarded; platform_policies has no unique key tuple).
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, publication_state)
SELECT
  'loops.induction_generate_playbook.generation_lane', 'global', NULL,
  '"jobs"'::jsonb,
  'Generation lane for the induction cohort-playbook loop generator: ''jobs'' = enqueue on the #1998 ai_jobs Max lane (₹0); ''direct'' = the legacy paid Anthropic-batch path. Flip-back switch (no deploy).',
  'string', true, true, 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'loops.induction_generate_playbook.generation_lane'
     AND scope_type = 'global' AND scope_id IS NULL
);
