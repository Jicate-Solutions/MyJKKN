-- Live option counts for the poll presenter/coordinator surface.
-- fn_induction_session_poll_totals previously NULLed every option count until
-- k>=3 learners had responded (anonymity floor). This RPC is only callable by
-- poll managers (_fn_induction_can_manage_session_pulse: coordinators /
-- induction.manage / that session's speakers), and the presenter projects
-- aggregate bars only — never ballots or identities — so the floor hid live
-- results from the one audience that runs the poll. Counts are now always
-- returned; `suppressed` is kept in the payload (always false) so existing
-- clients keep parsing. Learner-facing RPCs are unchanged.

CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_totals(p_poll_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_p public.induction_session_poll; v_batch uuid; v_enrolled int; v_responses int;
  v_questions jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: not authenticated'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_totals: no such poll'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_p.session_id) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_totals: not authorized'; END IF;

  IF v_p.status = 'open' AND v_p.auto_close_at IS NOT NULL AND v_p.auto_close_at < now() THEN
    UPDATE public.induction_session_poll SET status='closed', updated_at=now() WHERE id = v_p.id;
    v_p.status := 'closed';
  END IF;

  SELECT es.batch_id INTO v_batch FROM public.event_sessions es WHERE es.id = v_p.session_id;
  SELECT count(*)::int INTO v_enrolled FROM public.induction_enrollment ie
  WHERE ie.event_id = v_p.event_id AND (v_batch IS NULL OR ie.batch_id = v_batch);

  SELECT count(DISTINCT learner_id)::int INTO v_responses
  FROM public.induction_session_poll_vote WHERE poll_id = v_p.id;

  SELECT coalesce(jsonb_agg(qx.obj ORDER BY qx.position),'[]'::jsonb) INTO v_questions FROM (
    SELECT q.position,
      jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
        'response_count', q_resp.cnt,
        'options', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label,
            'count', (SELECT count(*) FROM public.induction_session_poll_vote v WHERE v.option_id = o.id)
          ) ORDER BY o.position),'[]'::jsonb)
          FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
      ) AS obj
    FROM public.induction_session_poll_question q
    CROSS JOIN LATERAL (
      SELECT count(DISTINCT v.learner_id)::int AS cnt
      FROM public.induction_session_poll_vote v WHERE v.question_id = q.id
    ) q_resp
    WHERE q.poll_id = v_p.id
  ) qx;

  RETURN jsonb_build_object('status', v_p.status, 'auto_close_at', v_p.auto_close_at,
    'enrolled_count', v_enrolled, 'response_count', v_responses, 'suppressed', false,
    'questions', v_questions);
END $function$;
