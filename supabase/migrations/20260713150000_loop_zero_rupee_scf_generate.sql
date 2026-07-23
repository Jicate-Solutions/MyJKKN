-- ============================================================================
-- 20260713150000_loop_zero_rupee_scf_generate.sql
-- ----------------------------------------------------------------------------
-- ₹0 loop migration — generator 2: scf.generate_suggestions (the self-improving
-- session-feedback loop). Depends on the foundation (20260713140000):
-- fn_ai_enqueue_system / fn_ai_collect_claim / the dedupe index / the helper.
--
-- scf runs a TWO-phase pipeline (judge → generate) with three distinct prompts.
-- On lane='jobs' the cron enqueues each phase as its own ai_job type (glue
-- {{prompt}} — the cron assembles the exact system+user prompt from
-- buildJudgeParams / buildGenerationParams and passes it as payload.prompt) and
-- collects them, recording via the IDENTICAL fn_scf_record_suggestion /
-- fn_scf_record_leadership_concern / fn_scf_clear_leadership_concern (byte-parity
-- of effects). tool_set='none' + interactive=false → generic Windows seat drain.
--
-- Additive + idempotent. Validated rolled-back on prod before apply.
-- Ref: .claude/loop-lane-workorder-20260713.md §B; PR feat/loop-zero-scf.
-- ============================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, schedulable, enabled, input_schema, expected_seconds)
VALUES
  ('scf.judge_help_ask',
   'SCF — Help-ask judge (loop)',
   'Judge stage of the session-feedback self-improving loop: counts genuine help-asks in a class''s anonymized comments (privacy: count only). Migrated onto the #1998 Max lane behind loops.scf_generate_suggestions.generation_lane.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 25),
  ('scf.suggest_improvement',
   'SCF — Teaching-improvement suggestion (loop)',
   'Generate stage (improvement): concrete teaching adjustments for a low/widened-gate class window. Anonymity-preserving; recorded via fn_scf_record_suggestion. Same Max lane switch.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 40),
  ('scf.suggest_success',
   'SCF — What-worked capture (loop)',
   'Generate stage (success): captures what worked in a standout class window so it can be repeated/shared. Recorded via fn_scf_record_suggestion (kind=success). Same Max lane switch.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb, 40)
ON CONFLICT (job_type) DO NOTHING;

-- Switch seed (identity-guarded; platform_policies has no unique key tuple).
-- Seeded 'jobs' → merging + applying flips scf's generation onto the Max lane.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, publication_state)
SELECT
  'loops.scf_generate_suggestions.generation_lane', 'global', NULL,
  '"jobs"'::jsonb,
  'Generation lane for the SCF self-improving session-feedback loop generator: ''jobs'' = enqueue on the #1998 ai_jobs Max lane (₹0); ''direct'' = the legacy Anthropic-batch path (defer-to-manifest + paid sub-fallback). Flip-back switch (no deploy).',
  'string', true, true, 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
   WHERE policy_key = 'loops.scf_generate_suggestions.generation_lane'
     AND scope_type = 'global' AND scope_id IS NULL
);
