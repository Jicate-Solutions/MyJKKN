-- 20260702060000_induction_poll_coordinator_flow.sql
-- Coordinator-controlled question flow for induction session polls (Mentimeter-style).
-- The host now decides which ONE question is live: learners only ever receive the
-- current question (server-enforced, not a UI trick), answer it, then watch its live
-- counts (k>=3 suppression) while waiting for the coordinator to advance.
--   * induction_session_poll.current_question_id — the question currently shown.
--   * fn_induction_open_session_poll — rebuilt: opening defaults current question to Q1.
--   * fn_induction_set_current_poll_question — NEW host RPC to move next/back; each
--     advance also resets the 240-min lazy auto-close (an active host keeps it alive).
--   * fn_induction_get_session_poll — rebuilt: includes current_question_id.
--   * fn_induction_get_poll_for_answering — rebuilt: returns ONLY the current question
--     (+ index/total), my_answers filtered to it.
--   * fn_induction_poll_question_totals_for_learner — NEW learner RPC: live counts for
--     the current question only, suppressed until 3 distinct responders.

ALTER TABLE public.induction_session_poll
  ADD COLUMN IF NOT EXISTS current_question_id uuid
  REFERENCES public.induction_session_poll_question(id) ON DELETE SET NULL;

-- Rebuilt from live definition (advisory-lock + issued_at/auto_close behavior kept);
-- adds: default the live question to the first one when opening.
CREATE OR REPLACE FUNCTION public.fn_induction_open_session_poll(p_session_id uuid)
RETURNS induction_session_poll LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
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
  SET status='open', issued_at=coalesce(issued_at, now()), auto_close_at = now() + interval '240 minutes',
      current_question_id = coalesce(current_question_id,
        (SELECT q.id FROM public.induction_session_poll_question q
          WHERE q.poll_id = induction_session_poll.id ORDER BY q.position LIMIT 1)),
      updated_at=now()
  WHERE id = v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) TO authenticated;

-- NEW: coordinator picks which question is live (next/back/jump). Open polls only.
CREATE OR REPLACE FUNCTION public.fn_induction_set_current_poll_question(p_poll_id uuid, p_question_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_session uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_set_current_poll_question: not authenticated'; END IF;
  SELECT p.session_id, p.status INTO v_session, v_status
  FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_session IS NULL OR NOT public._fn_induction_can_manage_session_pulse(v_session) THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: not allowed'; END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: poll is not open'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question q
                 WHERE q.id = p_question_id AND q.poll_id = p_poll_id) THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: question not in poll'; END IF;
  -- Advancing is host activity: also push the lazy auto-close window forward.
  UPDATE public.induction_session_poll
  SET current_question_id = p_question_id, auto_close_at = now() + interval '240 minutes', updated_at = now()
  WHERE id = p_poll_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_set_current_poll_question(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_set_current_poll_question(uuid, uuid) TO authenticated;

-- Rebuilt from live definition; adds current_question_id to the payload.
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
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes,
    'current_question_id', v_p.current_question_id, 'questions', v_questions);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) TO authenticated;

-- Rebuilt: a learner now receives ONLY the coordinator's current question (plus its
-- 1-based index and the total), never the full questionnaire.
CREATE OR REPLACE FUNCTION public.fn_induction_get_poll_for_answering(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; v_current uuid; v_question jsonb; v_mine jsonb; v_index int; v_total int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not allowed'; END IF;

  SELECT p.current_question_id INTO v_current FROM public.induction_session_poll p WHERE p.id = p_poll_id;

  SELECT count(*)::int INTO v_total FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id;

  IF v_current IS NOT NULL THEN
    SELECT jsonb_build_object(
             'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
             'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                         FROM public.induction_session_poll_option o WHERE o.question_id = q.id)),
           (SELECT count(*)::int FROM public.induction_session_poll_question q2
             WHERE q2.poll_id = p_poll_id AND q2.position <= q.position)
    INTO v_question, v_index
    FROM public.induction_session_poll_question q WHERE q.id = v_current AND q.poll_id = p_poll_id;
  END IF;

  SELECT coalesce(jsonb_object_agg(question_id, opts),'{}'::jsonb) INTO v_mine FROM (
    SELECT question_id, jsonb_agg(option_id) AS opts
    FROM public.induction_session_poll_vote
    WHERE poll_id = p_poll_id AND learner_id = v_learner AND question_id = v_current
    GROUP BY question_id
  ) m;

  RETURN jsonb_build_object('poll_id', p_poll_id,
    'questions', CASE WHEN v_question IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_question) END,
    'my_answers', v_mine,
    'current_question_id', v_current, 'question_index', v_index, 'question_total', v_total);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) TO authenticated;

-- NEW: live counts of the CURRENT question for learners (aggregate only, k>=3 floor —
-- counts stay null until 3 distinct learners have answered that question).
CREATE OR REPLACE FUNCTION public.fn_induction_poll_question_totals_for_learner(p_poll_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_learner uuid; v_current uuid; v_responders int; v_options jsonb; v_prompt text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_poll_question_totals_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_poll_question_totals_for_learner: not allowed'; END IF;

  SELECT p.current_question_id INTO v_current FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_current IS NULL THEN RETURN NULL; END IF;

  SELECT q.prompt INTO v_prompt FROM public.induction_session_poll_question q WHERE q.id = v_current;
  SELECT count(DISTINCT v.learner_id)::int INTO v_responders
  FROM public.induction_session_poll_vote v WHERE v.question_id = v_current;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'label', o.label,
           'count', CASE WHEN v_responders >= 3
                         THEN (SELECT count(*) FROM public.induction_session_poll_vote v
                                WHERE v.question_id = v_current AND v.option_id = o.id)
                         ELSE NULL END
         ) ORDER BY o.position),'[]'::jsonb)
  INTO v_options FROM public.induction_session_poll_option o WHERE o.question_id = v_current;

  RETURN jsonb_build_object('question_id', v_current, 'prompt', v_prompt,
    'response_count', v_responders, 'suppressed', v_responders < 3, 'options', v_options);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_poll_question_totals_for_learner(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_poll_question_totals_for_learner(uuid) TO authenticated;

-- Backfill: any already-open poll starts at its first question.
UPDATE public.induction_session_poll p
SET current_question_id = (SELECT q.id FROM public.induction_session_poll_question q
                            WHERE q.poll_id = p.id ORDER BY q.position LIMIT 1)
WHERE p.status = 'open' AND p.current_question_id IS NULL;

NOTIFY pgrst, 'reload schema';
