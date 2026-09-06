-- 20260630210200_induction_session_polls_learner_rpcs.sql
-- Learner-side RPCs for induction session polls. Gate: caller is a learner
-- (get_my_learner_id()), enrolled in the poll's event, session applies to their batch
-- (batch_id IS NULL OR = mine), and the poll is open. SECURITY DEFINER, anon-locked.

-- A learner's currently-open polls (enrolled + their batch), with already_answered.
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_for_learner()
RETURNS TABLE (poll_id uuid, session_id uuid, event_id uuid, event_name text, title text,
               day_number integer, auto_close_at timestamptz, already_answered boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_poll_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.session_id, p.event_id, ev.name, es.title, es.day_number, p.auto_close_at,
         EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.poll_id = p.id AND v.learner_id = v_learner)
  FROM public.induction_session_poll p
  JOIN public.event_sessions es ON es.id = p.session_id
  JOIN public.events ev         ON ev.id = p.event_id
  JOIN public.induction_enrollment ie ON ie.event_id = p.event_id AND ie.learner_id = v_learner
  WHERE p.status = 'open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
    AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
  ORDER BY p.issued_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_for_learner() TO authenticated;

-- helper: may THIS learner answer THIS poll? (enrolled + batch + open)
CREATE OR REPLACE FUNCTION public._fn_induction_learner_can_answer_poll(p_poll_id uuid, p_learner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.induction_session_poll p
    JOIN public.event_sessions es ON es.id = p.session_id
    JOIN public.induction_enrollment ie ON ie.event_id = p.event_id AND ie.learner_id = p_learner
    WHERE p.id = p_poll_id AND p.status='open' AND (p.auto_close_at IS NULL OR p.auto_close_at > now())
      AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
  ) INTO v_ok;
  RETURN coalesce(v_ok,false);
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_induction_learner_can_answer_poll(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_induction_learner_can_answer_poll(uuid, uuid) TO authenticated;

-- Questions/options to render + my prior answers (so I can change while open).
CREATE OR REPLACE FUNCTION public.fn_induction_get_poll_for_answering(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; v_questions jsonb; v_mine jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not allowed'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id;

  SELECT coalesce(jsonb_object_agg(question_id, opts),'{}'::jsonb) INTO v_mine FROM (
    SELECT question_id, jsonb_agg(option_id) AS opts
    FROM public.induction_session_poll_vote WHERE poll_id = p_poll_id AND learner_id = v_learner
    GROUP BY question_id
  ) m;

  RETURN jsonb_build_object('poll_id', p_poll_id, 'questions', v_questions, 'my_answers', v_mine);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) TO authenticated;

-- Submit/replace a learner's ballot. p_answers = [{question_id, option_ids:[...]}].
CREATE OR REPLACE FUNCTION public.fn_induction_submit_poll_response(p_poll_id uuid, p_answers jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; a jsonb; v_qid uuid; v_kind text; v_opts uuid[]; v_oid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_submit_poll_response: not allowed'; END IF;

  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) LOOP
    v_qid := (a->>'question_id')::uuid;
    SELECT kind INTO v_kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = p_poll_id;
    IF v_kind IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: question not in poll'; END IF;

    SELECT coalesce(array_agg((e)::uuid),'{}') INTO v_opts
    FROM jsonb_array_elements_text(coalesce(a->'option_ids','[]'::jsonb)) e;

    IF v_kind = 'single' AND array_length(v_opts,1) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: single-choice needs exactly one option'; END IF;

    IF EXISTS (SELECT 1 FROM unnest(v_opts) x(oid)
               WHERE NOT EXISTS (SELECT 1 FROM public.induction_session_poll_option o WHERE o.id = x.oid AND o.question_id = v_qid)) THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: option does not belong to question'; END IF;

    DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND learner_id = v_learner;
    FOREACH v_oid IN ARRAY v_opts LOOP
      INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, learner_id)
      VALUES (p_poll_id, v_qid, v_oid, v_learner);
    END LOOP;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
