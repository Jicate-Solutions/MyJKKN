-- 20260630210100_induction_session_polls_host_rpcs.sql
-- Host-side RPCs for induction session polls. SECURITY DEFINER + search_path=public,
-- anon-locked. Authorization reuses public._fn_induction_can_manage_session_pulse
-- (credited resource person OR coordinator with induction.manage + institution access OR admin).

-- Build/edit the poll structure (diff-upsert). Deletes blocked once votes exist.
CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session_poll(p_session_id uuid, p_questions jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event uuid; v_inst uuid; v_poll_id uuid;
  q jsonb; o jsonb; v_qid uuid; v_oid uuid;
  v_keep_q uuid[] := '{}'; v_keep_o uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authenticated'; END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst
  FROM public.event_sessions es JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not an induction session'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authorized'; END IF;

  INSERT INTO public.induction_session_poll (session_id, event_id, institution_id, created_by)
  VALUES (p_session_id, v_event, v_inst, auth.uid())
  ON CONFLICT (session_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_poll_id;

  FOR q IN SELECT value FROM jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) LOOP
    IF nullif(q->>'id','') IS NOT NULL THEN
      v_qid := (q->>'id')::uuid;
      UPDATE public.induction_session_poll_question
      SET prompt = q->>'prompt', kind = coalesce(q->>'kind','single'),
          position = coalesce((q->>'position')::int, 0)
      WHERE id = v_qid AND poll_id = v_poll_id;
    ELSE
      INSERT INTO public.induction_session_poll_question (poll_id, prompt, kind, position)
      VALUES (v_poll_id, q->>'prompt', coalesce(q->>'kind','single'), coalesce((q->>'position')::int,0))
      RETURNING id INTO v_qid;
    END IF;
    v_keep_q := array_append(v_keep_q, v_qid);

    v_keep_o := '{}';
    FOR o IN SELECT value FROM jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) LOOP
      IF nullif(o->>'id','') IS NOT NULL THEN
        v_oid := (o->>'id')::uuid;
        UPDATE public.induction_session_poll_option
        SET label = o->>'label', position = coalesce((o->>'position')::int,0)
        WHERE id = v_oid AND question_id = v_qid;
      ELSE
        INSERT INTO public.induction_session_poll_option (question_id, label, position)
        VALUES (v_qid, o->>'label', coalesce((o->>'position')::int,0))
        RETURNING id INTO v_oid;
      END IF;
      v_keep_o := array_append(v_keep_o, v_oid);
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM public.induction_session_poll_option opt
      JOIN public.induction_session_poll_vote v ON v.option_id = opt.id
      WHERE opt.question_id = v_qid AND NOT (opt.id = ANY(v_keep_o))
    ) THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot delete an option that already has votes'; END IF;
    DELETE FROM public.induction_session_poll_option
    WHERE question_id = v_qid AND NOT (id = ANY(v_keep_o));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.induction_session_poll_question qq
    JOIN public.induction_session_poll_vote v ON v.question_id = qq.id
    WHERE qq.poll_id = v_poll_id AND NOT (qq.id = ANY(v_keep_q))
  ) THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot delete a question that already has votes'; END IF;
  DELETE FROM public.induction_session_poll_question
  WHERE poll_id = v_poll_id AND NOT (id = ANY(v_keep_q));

  RETURN v_poll_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) TO authenticated;

-- Open (idempotent, advisory-locked, requires >=1 question).
CREATE OR REPLACE FUNCTION public.fn_induction_open_session_poll(p_session_id uuid)
RETURNS public.induction_session_poll LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_poll: not authorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('induction_poll|' || p_session_id::text));
  SELECT * INTO v_row FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: no poll for this session'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question WHERE poll_id = v_row.id) THEN
    RAISE EXCEPTION 'fn_induction_open_session_poll: add at least one question first'; END IF;
  UPDATE public.induction_session_poll
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = now() + interval '240 minutes', updated_at=now()
  WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_close_session_poll(p_poll_id uuid)
RETURNS public.induction_session_poll LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_poll: not authenticated'; END IF;
  SELECT session_id INTO v_session FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_session IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_poll: no such poll'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_close_session_poll: not authorized'; END IF;
  UPDATE public.induction_session_poll SET status='closed', updated_at=now()
  WHERE id = p_poll_id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_close_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_close_session_poll(uuid) TO authenticated;

-- Host fetch: full structure + status + has_votes.
CREATE OR REPLACE FUNCTION public.fn_induction_get_session_poll(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_get_session_poll: not authorized'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'position', q.position,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'position',o.position) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  SELECT EXISTS(SELECT 1 FROM public.induction_session_poll_vote WHERE poll_id = v_p.id) INTO v_has_votes;

  RETURN jsonb_build_object('id', v_p.id, 'session_id', v_p.session_id, 'status', v_p.status,
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes, 'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) TO authenticated;

-- Live anonymized totals (k>=3 floor). Lazy auto-close.
CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_totals(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p public.induction_session_poll; v_batch uuid; v_enrolled int; v_responses int;
  v_suppress boolean; v_k constant int := 3; v_questions jsonb;
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
  v_suppress := (v_responses < v_k);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
           'response_count', (SELECT count(DISTINCT learner_id) FROM public.induction_session_poll_vote v WHERE v.question_id = q.id),
           'options', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'label', o.label,
               'count', CASE WHEN v_suppress THEN NULL ELSE (SELECT count(*) FROM public.induction_session_poll_vote v WHERE v.option_id = o.id) END
             ) ORDER BY o.position),'[]'::jsonb)
             FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  RETURN jsonb_build_object('status', v_p.status, 'auto_close_at', v_p.auto_close_at,
    'enrolled_count', v_enrolled, 'response_count', v_responses, 'suppressed', v_suppress,
    'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
