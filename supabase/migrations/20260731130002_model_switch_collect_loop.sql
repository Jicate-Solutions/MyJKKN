-- Feature A: auto-compare model-quality loop — COLLECT-LOOP ENABLEMENT
-- Follow-up to 20260731130000 (substrate) + 20260731130001 (switch-detection).
--
-- This migration adds the three things the collect cron
-- (app/api/cron/model-compare-collect) needs to accumulate paired old-vs-new
-- judge comparisons for a real model switch:
--
--   1) CODIFY the live {{prompt}} judge-template fix. The judge prompt shipped in
--      20260731130000 had NO {{prompt}} slot, so the assembled OLD/NEW outputs
--      never reached the model. That was fixed live on prod; this UPDATE puts the
--      fix in a migration so a fresh environment reproduces it.
--   2) A neutral model_compare.replay job type — the vehicle for re-running a
--      job's exact input on the OLD model. output_target='job.result' means it
--      writes ONLY to ai_jobs.result and NEVER to any domain table, so replaying a
--      remedial-plan / lesson-spine / etc. input can never overwrite real learner
--      data. The model it runs is pinned per-job via payload._model_override
--      (honored by fn_ai_claim — see 20260731130003).
--   3) model_switch_replays — the durable, cross-tick state machine the cron drives
--      each source job through: pending -> replaying -> judging -> recorded.
--
-- SHADOW / RECOMMENDATION-ONLY, same as the substrate: nothing here reverts a
-- model switch or changes a live model_id. It only accumulates verdict evidence.

BEGIN;

-- ===========================================================================
-- 1) Codify the live {{prompt}} judge-template fix (idempotent).
--    Exact text mirrors the live prod prompt_template (verified 2026-07-23):
--    the OLD/NEW outputs are injected at the {{prompt}} slot the drain fills.
-- ===========================================================================
UPDATE public.ai_job_types
SET prompt_template = $judge$You are a strict, impartial quality judge comparing two AI outputs produced for the SAME input by two different models. One output was produced by the OLD (previously-used) model; the other by the NEW (just-switched-to) model. Your job is to decide which output better serves the purpose of the job, so a human can tell whether the model switch helped or hurt.

You will be given:
- The job's purpose / input context.
- OLD_OUTPUT: the output from the old model.
- NEW_OUTPUT: the output from the new model.

CONTROL FOR POSITION BIAS — THIS IS MANDATORY:
- Do NOT decide "A vs B by which came first". The labels OLD_OUTPUT and NEW_OUTPUT, and their ordering, must NOT influence your verdict.
- Judge EACH output independently against an ABSOLUTE quality rubric for this task, then compare the two absolute assessments. The rubric:
  1. Correctness & factual grounding — no fabrication; claims supported by the given input.
  2. Task fit — actually answers/does what the job asked, in the required form/format.
  3. Completeness — covers what matters for the input; no important omission.
  4. Clarity & usefulness — a JKKN reader (Director/faculty/learner as appropriate) can act on it.
  5. Safety & appropriateness — no harmful, biased, or out-of-scope content.
- Score each output against this rubric in your own reasoning BEFORE choosing a verdict.

BE CONSERVATIVE — A FALSE "new is worse" IS THE COSTLY ERROR:
- Output "tie" whenever the two outputs are close, or when the difference is subjective, stylistic, or within normal model variation. Ties are the correct default.
- Only choose "new_better" or "old_better" when there is a CLEAR, STATEABLE difference on one or more rubric dimensions that you can name in the reason.
- If you are unsure, choose "tie". Do not manufacture a difference.

=== THE TWO OUTPUTS TO JUDGE (same input) ===
{{prompt}}

OUTPUT — strict JSON only, no prose, no code fences:
{"verdict": "old_better" | "new_better" | "tie", "reason": "<=200 chars naming the concrete rubric-based difference, or why it is a tie"}$judge$,
    updated_at = now()
WHERE job_type = 'model_compare.judge';

-- ===========================================================================
-- 2) model_compare.replay — the OLD-model replay vehicle (₹0 Max lane).
--    Glue prompt_template ({{prompt}}): the cron passes the source job's exact
--    assembled prompt as payload.prompt, and this job runs it UNCHANGED on the
--    model pinned by payload._model_override. output_target='job.result' → the
--    result is written ONLY to ai_jobs.result; it touches NO domain table, so a
--    replay can never have the source job's side effects.
-- ===========================================================================
INSERT INTO public.ai_job_types (
  job_type, title, description, lane, output_target, tool_set,
  provider, model_id, interactive, schedulable, allow_rule, enabled, input_schema, prompt_template
) VALUES (
  'model_compare.replay',
  'Model Compare · OLD-model Replay (shadow)',
  'SHADOW replay vehicle for the Feature A auto-compare model-quality loop. Re-runs a source job''s EXACT assembled input (payload.prompt) on the OLD model — the model is pinned per-job via payload._model_override={provider,model_id}, honored by fn_ai_claim. output_target=job.result means the result is written ONLY to ai_jobs.result and NEVER to any domain table, so replaying a remedial-plan/lesson-spine/etc. input can never overwrite real data. The captured OLD output is compared against the NEW output by a model_compare.judge job. Recommendation-only — no side effects, no revert.',
  'max', 'job.result', 'none',
  'anthropic', 'claude-sonnet-4-6',
  false, false, 'seat_owner', true,
  '[{"key":"prompt","type":"textarea","label":"Assembled prompt to replay on the OLD model","required":true}]'::jsonb,
  '{{prompt}}'
)
ON CONFLICT (job_type) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description, lane = EXCLUDED.lane,
  output_target = EXCLUDED.output_target, tool_set = EXCLUDED.tool_set,
  provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
  interactive = EXCLUDED.interactive, schedulable = EXCLUDED.schedulable,
  allow_rule = EXCLUDED.allow_rule, enabled = EXCLUDED.enabled,
  input_schema = EXCLUDED.input_schema, prompt_template = EXCLUDED.prompt_template,
  updated_at = now();

-- ===========================================================================
-- 3) model_switch_replays — the collect cron's durable state machine.
--    One row per (switch, source job). The cron advances each row:
--      pending    → discovered a fresh NEW-model source job for a collecting eval
--      replaying  → a model_compare.replay job is running the OLD model on it
--      judging    → OLD output captured; a model_compare.judge job is comparing
--      recorded   → verdict tallied into model_switch_evaluations via the RPC
--      skipped    → replay/judge failed irrecoverably, or input not replayable
--    input_prompt + new_output are captured up front so each stage is
--    self-contained and robust to ai_jobs being pruned.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.model_switch_replays (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id      uuid NOT NULL REFERENCES public.model_switch_evaluations(id) ON DELETE CASCADE,
  source_job_id  uuid NOT NULL,          -- the original NEW-model ai_job we are comparing
  input_prompt   text NOT NULL,          -- source payload.prompt — replayed verbatim on the OLD model
  new_output     text NOT NULL,          -- the NEW model's output (from the source job's result)
  old_output     text,                    -- the OLD model's output (captured when the replay completes)
  replay_job_id  uuid,                    -- the model_compare.replay ai_job (OLD-model run)
  judge_job_id   uuid,                    -- the model_compare.judge ai_job
  verdict        text CHECK (verdict IS NULL OR verdict IN ('old_better','new_better','tie')),
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','replaying','judging','recorded','skipped')),
  skip_reason    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (switch_id, source_job_id)       -- idempotent discovery: one replay per source job per switch
);
CREATE INDEX IF NOT EXISTS idx_model_switch_replays_switch
  ON public.model_switch_replays (switch_id);
CREATE INDEX IF NOT EXISTS idx_model_switch_replays_active
  ON public.model_switch_replays (status)
  WHERE status IN ('pending','replaying','judging');
COMMENT ON TABLE public.model_switch_replays IS
  'Feature A collect-loop state machine: one row per (model switch, source job). The model-compare-collect cron drives each row pending->replaying->judging->recorded, then tallies the verdict into model_switch_evaluations. Recommendation-only.';

-- RLS: super_admin/admin READ only. All writes go through the service_role cron
-- (service_role bypasses RLS). anon fully revoked. Mirrors the two substrate tables.
ALTER TABLE public.model_switch_replays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_switch_replays_read ON public.model_switch_replays;
CREATE POLICY model_switch_replays_read ON public.model_switch_replays
  FOR SELECT USING (is_super_admin() OR is_admin());

REVOKE ALL ON public.model_switch_replays FROM anon;

COMMIT;
