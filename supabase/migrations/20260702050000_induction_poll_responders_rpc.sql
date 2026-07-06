-- 20260702050000_induction_poll_responders_rpc.sql
-- Host-side "who answered" list for a session poll's live count analytics.
-- Deliberate design change from the original anonymized-only totals: the HOST
-- (credited speaker / induction.manage / admin — same gate as the pulse) can now
-- see WHICH learners responded (register no + name), but still NOT their ballots:
-- this returns responder identity + how many questions they answered, never
-- option choices. fn_induction_session_poll_totals stays fully anonymized.

CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_responders(p_poll_id uuid)
RETURNS TABLE (learner_id uuid, register_number text, roll_number text,
               learner_name text, questions_answered bigint, answered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_poll_responders: not authenticated'; END IF;
  SELECT p.session_id INTO v_session FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_session IS NULL OR NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_responders: not allowed'; END IF;

  RETURN QUERY
  SELECT v.learner_id,
         lp.register_number::text,
         lp.roll_number::text,
         trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         count(DISTINCT v.question_id),
         max(v.created_at)
  FROM public.induction_session_poll_vote v
  JOIN public.learners_profiles lp ON lp.id = v.learner_id
  WHERE v.poll_id = p_poll_id
  GROUP BY v.learner_id, lp.register_number, lp.roll_number, lp.first_name, lp.last_name
  ORDER BY max(v.created_at) DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_responders(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_responders(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
