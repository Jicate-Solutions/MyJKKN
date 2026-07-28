-- ============================================================================
-- Weekly personalized work-signal suggestion — AI drafts, the person verdicts
-- 2026-07-25 · Rank 5 of the CARRE operational arc (mirrors the AI-Max offload
-- template: ai_job_types Max-lane registration + draft store + RPC-only writes
-- + human verdict channel; canonical twin = curriculum.lesson_spine_generate +
-- fn_scf_set_verdict).
--
-- CONTRACT:
--   • AI drafts ONE kind, specific, actionable weekly suggestion per staff
--     member, grounded ONLY in their own measured work-signals (OD queue
--     depth, oldest waiting days, decisions made). Never a score, never a
--     rank, never compared to peers — same doctrine as fn_work_signals_for.
--   • NEVER auto-applied: the suggestion is text on the person's own
--     dashboard; only they see it, and only they verdict it (the SCF verdict
--     vocabulary: tried_helped / tried_no_change / not_tried). The verdict is
--     the learning signal for next week's prompt.
--   • Registration copies curriculum.lesson_spine_generate EXACTLY except
--     job_type/title/description — {{prompt}}-glue jobs need BOTH the
--     prompt-only input_schema AND prompt_template='{{prompt}}' or the Max
--     seat fails before calling the model (two receipts, 2026-07-23).
-- ============================================================================

-- 1) Job-type registration (₹0 Max lane).
INSERT INTO public.ai_job_types
  (job_type, title, description, lane, output_target, tool_set, provider,
   model_id, interactive, schedulable, allow_rule, enabled, input_schema, prompt_template)
VALUES
  ('worksignals.weekly_suggestion',
   'Work Signals · Weekly Suggestion',
   'Drafts ONE personalized, non-evaluative weekly suggestion per staff member from their own work-signals (OD queue, decisions). Draft lands on their dashboard; they verdict it. Never auto-applied, never ranked.',
   'max', 'job.result', 'none', 'anthropic',
   'sonnet', false, true, 'seat_owner', true,
   '[{"key":"prompt","type":"textarea","label":"Assembled prompt","required":true}]'::jsonb,
   '{{prompt}}')
ON CONFLICT (job_type) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      lane = EXCLUDED.lane,
      input_schema = EXCLUDED.input_schema,
      prompt_template = EXCLUDED.prompt_template;

-- 2) The suggestion store — one row per (person, week).
CREATE TABLE IF NOT EXISTS public.work_signal_suggestions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_profile_id uuid NOT NULL,
  subject_email      text NOT NULL,
  week_start         date NOT NULL,
  suggestion         text NOT NULL,
  ai_draft           jsonb,
  signals_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,
  human_verdict      text CHECK (human_verdict IN ('tried_helped','tried_no_change','not_tried')),
  human_verdict_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_profile_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_work_signal_suggestions_subject
  ON public.work_signal_suggestions (subject_profile_id, week_start DESC);

COMMENT ON TABLE public.work_signal_suggestions IS
  'Weekly AI-drafted, human-verdicted personal suggestions grounded in the subject''s own work-signals. Visible ONLY to the subject (and super_admin). Writes RPC-only; the verdict vocabulary mirrors fn_scf_set_verdict.';

ALTER TABLE public.work_signal_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_signal_suggestions_own ON public.work_signal_suggestions;
CREATE POLICY work_signal_suggestions_own ON public.work_signal_suggestions
  FOR SELECT USING (subject_profile_id = auth.uid() OR is_super_admin());
-- No INSERT/UPDATE/DELETE policies: the RPCs below are the only write paths.

REVOKE ALL ON public.work_signal_suggestions FROM anon, PUBLIC;
GRANT SELECT ON public.work_signal_suggestions TO authenticated;

-- 3) Draft writer — the cron collector only (service_role). Never 'approved',
--    never auto-applied: it writes TEXT the subject alone can see and verdict.
CREATE OR REPLACE FUNCTION public.fn_work_signal_suggestion_upsert(
  p_subject_profile_id uuid,
  p_subject_email text,
  p_week_start date,
  p_suggestion text,
  p_ai_draft jsonb DEFAULT NULL,
  p_signals_snapshot jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_subject_profile_id IS NULL OR COALESCE(trim(p_suggestion), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bad_input');
  END IF;

  INSERT INTO public.work_signal_suggestions
    (subject_profile_id, subject_email, week_start, suggestion, ai_draft, signals_snapshot)
  VALUES
    (p_subject_profile_id, lower(p_subject_email), p_week_start, trim(p_suggestion),
     p_ai_draft, COALESCE(p_signals_snapshot, '{}'::jsonb))
  ON CONFLICT (subject_profile_id, week_start) DO UPDATE
    SET suggestion = EXCLUDED.suggestion,
        ai_draft = EXCLUDED.ai_draft,
        signals_snapshot = EXCLUDED.signals_snapshot,
        updated_at = now()
    -- A verdicted week is settled: never overwrite what a human already judged.
    WHERE work_signal_suggestions.human_verdict IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_work_signal_suggestion_upsert(uuid, text, date, text, jsonb, jsonb) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_work_signal_suggestion_upsert(uuid, text, date, text, jsonb, jsonb) TO service_role;

-- 4) The verdict channel — the SUBJECT only (mirrors fn_scf_set_verdict).
CREATE OR REPLACE FUNCTION public.fn_work_signal_suggestion_verdict(
  p_id uuid,
  p_verdict text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n int;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF p_verdict NOT IN ('tried_helped','tried_no_change','not_tried') THEN
    RETURN false;
  END IF;

  UPDATE public.work_signal_suggestions
     SET human_verdict = p_verdict,
         human_verdict_at = now(),
         updated_at = now()
   WHERE id = p_id
     AND subject_profile_id = v_uid;   -- only your own suggestion

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_work_signal_suggestion_verdict(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_work_signal_suggestion_verdict(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
