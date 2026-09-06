-- ===========================================================================
-- RCLTP Part-B question generation → the ₹0 Max lane (decision #2)
-- ===========================================================================
-- Today `rcltp.question_generation` is registered but UNRUNNABLE on the lane:
-- prompt_template IS NULL and input_schema = '[]'. Both fail the seat BEFORE
-- the model is ever invoked ("empty prompt after template fill" / "missing
-- required input(s)"), which looks identical to a model failure in the job row.
-- This migration makes it match its two working siblings
-- (rcltp.remedial_plan_draft, curriculum.lesson_spine_generate) and registers
-- the second stage.
--
-- WHY TWO JOB TYPES: the direct/paid path makes two INDEPENDENT model calls —
-- generate the question set, then re-read the passage and check every answer
-- key with a different system prompt. That second verdict is what populates
-- ai_agreed_count, which is what the "Approve all AI-agreed" batch button
-- (#2357) reads. Folding the check into the generating call would anchor it on
-- the questions the model can still see itself writing, quietly turning that
-- batch button into a rubber stamp. So the check stays a separate pass, chained
-- on the lane (the scf.judge → scf.suggest_* pattern), and stays ₹0.
--
-- input_schema MUST be prompt-only: enqueueJobsLane sends payload
-- { prompt, _ctx }, so any domain key marked required fails the seat fast.
-- model_id stays the always-latest family alias 'sonnet', never a dated id.
--
-- Created: 2026-07-25 (rank-2 of the Senior-Learner⇄AI offload decisions).
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Repair the stage-1 registration so the seat can actually run it.
-- ---------------------------------------------------------------------------
UPDATE public.ai_job_types
SET prompt_template  = '{{prompt}}',
    input_schema     = '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb,
    enabled          = true,
    schedulable      = true,
    expected_seconds = 45,
    description      = 'Stage 1 of RCLTP Part-B question generation on the ₹0 Max lane: drafts comprehension questions for ONE curated passage (Marzano spread, MCQ + short-answer mix, quality over quantity). Writes nothing itself — the collect sweep chains stage 2 (rcltp.question_keycheck) and only then records status=draft rows. A Senior Learner approves; AI never writes approved.',
    updated_at       = now()
WHERE job_type = 'rcltp.question_generation';

-- ---------------------------------------------------------------------------
-- 2. Register stage 2 — the independent answer-key check.
-- ---------------------------------------------------------------------------
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, schedulable, enabled, input_schema,
   expected_seconds, provider, model_id)
VALUES
  ('rcltp.question_keycheck',
   'RCLTP — Part-B answer-key check (stage 2)',
   'Stage 2 of RCLTP Part-B question generation: re-reads the passage and judges each proposed correct answer INDEPENDENTLY (agree / disagree / ambiguous) in a fresh context with a different system prompt. Its verdicts populate ai_meta.checker, which drives ai_agreed_count and therefore the "Approve all AI-agreed" batch button — so this pass must stay separate from the generating call, never folded into it.',
   '{{prompt}}', 'none', 'job.result', false, 'max', 'seat_owner', true, true,
   '[{"key":"prompt","label":"Assembled prompt","type":"textarea","required":true}]'::jsonb,
   30, 'anthropic', 'sonnet')
ON CONFLICT (job_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Nightly cap — how many passages the overnight sweep may draft in one run.
-- ---------------------------------------------------------------------------
-- Identity-guarded via NOT EXISTS rather than ON CONFLICT: platform_policies'
-- uniqueness is an EXPRESSION index (policy_key, scope_type,
-- COALESCE(scope_id, '000…')), so a bare column conflict target raises 42P10.
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, data_type, description,
  ui_widget, ui_options, ui_consequence, ui_cascade, ui_category, is_system, is_active
)
SELECT
  'rcltp.question_generation.nightly_cap',
  'global', NULL::uuid,
  '10'::jsonb, 'number',
  'How many passages the overnight sweep may draft questions for in a single run. Bounds an unattended night so a large content upload cannot enqueue an unbounded pile.',
  'number', NULL::jsonb,
  'Set too low and newly added passages wait several nights before a Senior Learner has anything to review. Set too high and one night can produce a review pile larger than anyone will genuinely read — which is how batch approval turns into rubber-stamping.',
  '[{"effect":"Too low: ready-to-review questions lag behind new passages","severity":"medium"},{"effect":"Too high: a review pile too big to read honestly","severity":"high"}]'::jsonb,
  'Question Review', true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'rcltp.question_generation.nightly_cap'
    AND scope_type = 'global'
    AND scope_id IS NULL
);

COMMIT;
