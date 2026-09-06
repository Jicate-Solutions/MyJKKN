-- 20260704130000_induction_poll_export_rpc.sql
-- Host-side Excel export for a session poll: one row per (learner x question)
-- WITH the selected option labels (the ballots) and full learner details.
-- This is a deliberate widening of fn_induction_session_poll_responders (which
-- returns identity but never ballots): the export is host-only, behind the same
-- gate as every other host poll RPC (_fn_induction_can_manage_session_pulse =
-- credited speaker OR induction.manage+institution OR admin). Learner-facing
-- totals RPCs stay anonymized (k>=3) — this does not touch them.

CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_export(p_poll_id uuid)
RETURNS TABLE (
  learner_id uuid,
  register_number text,
  roll_number text,
  learner_name text,
  gender text,
  student_email text,
  student_mobile text,
  institution_name text,
  degree_name text,
  program_name text,
  batch_name text,
  question_id uuid,
  question_position integer,
  question_prompt text,
  question_kind text,
  option_labels text[],
  answered_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_poll_export: not authenticated'; END IF;
  SELECT p.session_id INTO v_session FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_session IS NULL OR NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_export: not allowed'; END IF;

  RETURN QUERY
  SELECT v.learner_id,
         lp.register_number::text,
         lp.roll_number::text,
         trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.gender::text,
         lp.student_email::text,
         lp.student_mobile::text,
         i.name::text,
         d.degree_name::text,
         pr.program_name::text,
         b.batch_name::text,
         q.id,
         q.position,
         q.prompt::text,
         q.kind::text,
         array_agg(o.label ORDER BY o.position)::text[],
         max(v.created_at)
  FROM public.induction_session_poll_vote v
  JOIN public.induction_session_poll_question q ON q.id = v.question_id
  JOIN public.induction_session_poll_option  o ON o.id = v.option_id
  JOIN public.learners_profiles lp ON lp.id = v.learner_id
  LEFT JOIN public.institutions i  ON i.id  = lp.institution_id
  LEFT JOIN public.degrees d       ON d.id  = lp.degree_id
  LEFT JOIN public.programs pr     ON pr.id = lp.program_id
  LEFT JOIN public.batches b       ON b.id  = lp.batch_id
  WHERE v.poll_id = p_poll_id
  GROUP BY v.learner_id, lp.register_number, lp.roll_number, lp.first_name, lp.last_name,
           lp.gender, lp.student_email, lp.student_mobile, i.name, d.degree_name,
           pr.program_name, b.batch_name, q.id, q.position, q.prompt, q.kind
  ORDER BY lp.register_number NULLS LAST, q.position;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_export(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_export(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
