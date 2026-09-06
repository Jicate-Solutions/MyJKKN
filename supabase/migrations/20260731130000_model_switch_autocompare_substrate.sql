-- Feature A: auto-compare model-quality loop — SHADOW substrate (SCAFFOLDING ONLY)
-- Spec: specs/ai-model-autocompare-drain-shadowrun-prompt.md
-- Mirrors the proven SCF note-safety shadow-judge substrate
--   (supabase/migrations/20260719054000_scf_note_safety_judge_shadow_substrate.sql).
--
-- SHADOW ONLY / NON-FUNCTIONAL until (1) the Director applies this migration AND
-- (2) the Windows Max-lane drain learns to shadow-run the OLD model and enqueue a
-- model_compare.judge job (see the drain-artifact spec above). This migration
-- NEVER changes a live model_id and NEVER auto-reverts a switch — it only stores
-- verdict evidence for a human to act on. No auto-action anywhere in this file.

BEGIN;

-- ===========================================================================
-- 1) model_switch_evaluations — one row per "we changed the model for a job_type"
--    Tracks a rolling A/B tally (old model vs new model) until enough paired
--    comparisons land, then flips to a conservative verdict for a human to read.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.model_switch_evaluations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type           text NOT NULL,
  old_provider       text,
  old_model_id       text,
  new_provider       text,
  new_model_id       text,
  switched_at        timestamptz NOT NULL DEFAULT now(),
  switched_by        uuid,
  status             text NOT NULL DEFAULT 'collecting'
                       CHECK (status IN ('collecting','verdict_ready')),
  comparisons_target int  NOT NULL DEFAULT 20,
  comparisons_done   int  NOT NULL DEFAULT 0,
  new_wins           int  NOT NULL DEFAULT 0,
  old_wins           int  NOT NULL DEFAULT 0,
  ties               int  NOT NULL DEFAULT 0,
  -- evaluation-level verdict (distinct value set from the per-comparison judge verdict):
  verdict            text CHECK (verdict IS NULL OR verdict IN ('new_better','new_worse','tie')),
  verdict_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_model_switch_evals_collecting
  ON public.model_switch_evaluations (job_type) WHERE status = 'collecting';
COMMENT ON TABLE public.model_switch_evaluations IS
  'Feature A shadow substrate: one row per model switch on an ai_job_types.job_type. Accumulates paired old-vs-new judge comparisons until comparisons_done >= comparisons_target, then sets a conservative evaluation verdict. Recommendation-only — never reverts a switch.';

-- RLS: super_admin/admin READ only. No authenticated write policy → all writes go
-- through the service_role RPC below (service_role bypasses RLS). anon fully revoked.
ALTER TABLE public.model_switch_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_switch_evaluations_read ON public.model_switch_evaluations;
CREATE POLICY model_switch_evaluations_read ON public.model_switch_evaluations
  FOR SELECT USING (is_super_admin() OR is_admin());

REVOKE ALL ON public.model_switch_evaluations FROM anon;

-- ===========================================================================
-- 2) model_switch_comparisons — one row per paired judge verdict for a switch
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.model_switch_comparisons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id     uuid NOT NULL REFERENCES public.model_switch_evaluations(id) ON DELETE CASCADE,
  ai_job_id     uuid,
  old_output    text,
  new_output    text,
  judge_verdict text NOT NULL CHECK (judge_verdict IN ('old_better','new_better','tie')),
  reason        text,
  judged_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_model_switch_comparisons_switch
  ON public.model_switch_comparisons (switch_id);
COMMENT ON TABLE public.model_switch_comparisons IS
  'Feature A shadow substrate: one row per bias-controlled judge comparison of the OLD vs NEW model output for the same input, tallied into model_switch_evaluations.';

-- RLS: same as the parent table — admin read, service_role write, anon revoked.
ALTER TABLE public.model_switch_comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_switch_comparisons_read ON public.model_switch_comparisons;
CREATE POLICY model_switch_comparisons_read ON public.model_switch_comparisons
  FOR SELECT USING (is_super_admin() OR is_admin());

REVOKE ALL ON public.model_switch_comparisons FROM anon;

-- ===========================================================================
-- 3) ai_job_type — the model-compare judge, on the ₹0 Max lane.
--    Shape mirrors the RCLTP remedial-plan registration
--    (20260723060000_rcltp_remedial_plan_draft_loop.sql): explicit provider +
--    model_id, interactive=false, output_target=job.result, tool_set='none'.
--    prompt_template carries THE JUDGE PROMPT (bias-controlled + conservative).
-- ===========================================================================
INSERT INTO public.ai_job_types (
  job_type, title, description, lane, output_target, tool_set,
  provider, model_id, interactive, schedulable, allow_rule, enabled, input_schema, prompt_template
) VALUES (
  'model_compare.judge',
  'Model Compare · Quality Judge (shadow)',
  'SHADOW judge for the Feature A auto-compare model-quality loop. Given the OLD-model and NEW-model outputs for the SAME job input, decides which output better serves the job''s purpose against an absolute quality rubric (NOT by position). Returns strict JSON {verdict,reason}. Recommendation-only — the verdict is tallied into model_switch_evaluations via fn_model_switch_record_comparison; it NEVER reverts a live model switch. Conservative by design: a false "new is worse" would nag the Director, so ties are preferred when the difference is not clear.',
  'max', 'job.result', 'none',
  'anthropic', 'claude-sonnet-4-6',
  false, false, 'seat_owner', true,
  '[{"key":"prompt","type":"textarea","label":"Assembled prompt (OLD_OUTPUT + NEW_OUTPUT for the same input)","required":true}]'::jsonb,
  $judge$You are a strict, impartial quality judge comparing two AI outputs produced for the SAME input by two different models. One output was produced by the OLD (previously-used) model; the other by the NEW (just-switched-to) model. Your job is to decide which output better serves the purpose of the job, so a human can tell whether the model switch helped or hurt.

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

OUTPUT — strict JSON only, no prose, no code fences:
{"verdict": "old_better" | "new_better" | "tie", "reason": "<=200 chars naming the concrete rubric-based difference, or why it is a tie"}$judge$
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
-- 4) fn_model_switch_record_comparison — the drain/cron persists one paired
--    verdict, increments the matching counter, and (when the target is reached)
--    flips the evaluation to a CONSERVATIVE verdict for a human to read.
--
--    Required signature is (p_switch_id, p_verdict); the trailing detail params
--    are optional (DEFAULT NULL) so the drain can also persist the paired
--    outputs/reason/job id into the comparison row without a second call. The
--    2-arg form fn_model_switch_record_comparison(uuid, text) stays valid.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.fn_model_switch_record_comparison(
  p_switch_id  uuid,
  p_verdict    text,
  p_ai_job_id  uuid    DEFAULT NULL,
  p_old_output text    DEFAULT NULL,
  p_new_output text    DEFAULT NULL,
  p_reason     text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_eval   public.model_switch_evaluations%ROWTYPE;
  v_margin int;
  v_new_verdict text;
BEGIN
  IF p_verdict NOT IN ('old_better','new_better','tie') THEN
    RAISE EXCEPTION 'fn_model_switch_record_comparison: bad verdict %', p_verdict;
  END IF;

  -- Lock the evaluation row so concurrent drain writers serialize (accurate tally).
  SELECT * INTO v_eval
  FROM public.model_switch_evaluations
  WHERE id = p_switch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_model_switch_record_comparison: unknown switch_id %', p_switch_id;
  END IF;

  -- Persist the paired comparison (evidence row).
  INSERT INTO public.model_switch_comparisons
    (switch_id, ai_job_id, old_output, new_output, judge_verdict, reason)
  VALUES
    (p_switch_id, p_ai_job_id, p_old_output, p_new_output, p_verdict, p_reason);

  -- Idempotency guard: once a verdict is set, stop tallying (don't move the goalposts).
  IF v_eval.status = 'verdict_ready' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_eval.status, 'verdict', v_eval.verdict,
                              'note', 'already finalized; comparison stored but not tallied');
  END IF;

  -- Increment the matching counter + the total.
  UPDATE public.model_switch_evaluations
     SET comparisons_done = comparisons_done + 1,
         old_wins = old_wins + (CASE WHEN p_verdict = 'old_better' THEN 1 ELSE 0 END),
         new_wins = new_wins + (CASE WHEN p_verdict = 'new_better' THEN 1 ELSE 0 END),
         ties     = ties     + (CASE WHEN p_verdict = 'tie'        THEN 1 ELSE 0 END),
         updated_at = now()
   WHERE id = p_switch_id
  RETURNING * INTO v_eval;

  -- Not enough evidence yet → keep collecting.
  IF v_eval.comparisons_done < v_eval.comparisons_target THEN
    RETURN jsonb_build_object('ok', true, 'status', 'collecting',
                              'comparisons_done', v_eval.comparisons_done,
                              'comparisons_target', v_eval.comparisons_target);
  END IF;

  -- Enough evidence → decide CONSERVATIVELY.
  -- "new_worse" only when the OLD model wins by a CLEAR margin. A tie is the safe default:
  -- a false "new is worse" would nag the Director, so we demand a real gap in either direction.
  v_margin := GREATEST(3, v_eval.comparisons_target / 5);  -- e.g. target 20 → margin 4
  IF (v_eval.old_wins - v_eval.new_wins) >= v_margin THEN
    v_new_verdict := 'new_worse';
  ELSIF (v_eval.new_wins - v_eval.old_wins) >= v_margin THEN
    v_new_verdict := 'new_better';
  ELSE
    v_new_verdict := 'tie';
  END IF;

  UPDATE public.model_switch_evaluations
     SET status = 'verdict_ready',
         verdict = v_new_verdict,
         verdict_at = now(),
         updated_at = now()
   WHERE id = p_switch_id
  RETURNING * INTO v_eval;

  RETURN jsonb_build_object('ok', true, 'status', 'verdict_ready', 'verdict', v_new_verdict,
                            'old_wins', v_eval.old_wins, 'new_wins', v_eval.new_wins,
                            'ties', v_eval.ties, 'margin', v_margin);
END;
$$;

-- service_role ONLY: this RPC is written solely by the Windows Max-lane drain /
-- cron (service_role, which bypasses grants). It is a SYSTEM writer, NOT an
-- authenticated user action. Granting authenticated would let any logged-in user
-- forge comparison rows and poison the switch verdict (e.g. fake a "new_worse" to
-- force a model revert). anon/PUBLIC/authenticated all revoked; service_role only.
REVOKE EXECUTE ON FUNCTION public.fn_model_switch_record_comparison(uuid,text,uuid,text,text,text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_model_switch_record_comparison(uuid,text,uuid,text,text,text) TO service_role;

COMMIT;
