-- 20260704100000_live_poll_engine_phase_a_rewire.sql
-- Phase A (rewire) of the Live Poll Engine generalization.
-- Spec: specs/live-poll-engine-generalization-2026-07-04.md
--
-- Foundation migration (20260704090000) added the polymorphic context + the two
-- dispatchers WITHOUT touching any RPC. This migration RE-POINTS each induction poll
-- RPC's authorization check at the dispatchers, so future contexts (class / CDC / HR
-- training) plug in at ONE place. For induction the dispatchers delegate to the exact
-- same resolvers, so behavior is BYTE-FOR-BYTE identical. Every RPC body below is
-- copied verbatim from prod pg_get_functiondef; ONLY the auth-gate line changed.
--
-- Parity contract (proven by the forced-rollback dry-run DO block in the apply step):
--   manage: fn_live_poll_can_manage('induction_session', ctx) == _fn_induction_can_manage_session_pulse(ctx)
--           (dispatcher is that resolver + a null-guard that already returns false)
--   answer: _fn_live_poll_learner_can_answer(poll, learner) == _fn_induction_learner_can_answer_poll(poll, learner)
--           requires the answer dispatcher's induction branch to include the batch-match
--           predicate (added below), because the resolver's audience = enrolled AND batch-match.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Answer dispatcher — add the induction batch-match so its audience EXACTLY
--    equals the resolver's audience portion. (No live caller yet, so replacing is
--    inert until the RPCs below are rewired in this same migration.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_live_poll_can_answer(p_context_type text, p_context_id uuid, p_learner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_context_id IS NULL OR p_learner IS NULL THEN RETURN false; END IF;
  CASE p_context_type
    WHEN 'induction_session' THEN
      -- audience = learner enrolled in the event that owns this session, AND (when the
      -- session is batch-scoped) in the matching batch. Mirrors the audience portion of
      -- _fn_induction_learner_can_answer_poll exactly.
      RETURN EXISTS (
        SELECT 1 FROM public.event_sessions es
        JOIN public.induction_enrollment ie ON ie.event_id = es.event_id AND ie.learner_id = p_learner
        WHERE es.id = p_context_id
          AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id));
    -- 'class_session'        -> Phase B (section students)
    -- 'cdc_training_session' -> Phase C (cdc_training_enrollments)
    -- 'hr_training_session'  -> Phase C (hr_training_enrollments)
    ELSE RETURN false;
  END CASE;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_live_poll_can_answer(text, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_live_poll_can_answer(text, uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Thin poll-keyed answer gate. The engine's answer RPCs are poll-keyed; the
--    dispatcher is context-keyed + audience-only. This wrapper resolves the poll's
--    context and open/visibility state, then delegates the audience test to the
--    dispatcher. Equals _fn_induction_learner_can_answer_poll for induction:
--      status='open' AND not-expired  (poll-level, context-agnostic — kept here)
--      AND audience-membership        (context-aware — delegated to dispatcher)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_live_poll_learner_can_answer(p_poll_id uuid, p_learner uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid;
BEGIN
  IF p_learner IS NULL THEN RETURN false; END IF;
  SELECT context_type, context_id INTO v_ctype, v_cid
  FROM public.induction_session_poll
  WHERE id = p_poll_id
    AND status = 'open'
    AND (auto_close_at IS NULL OR auto_close_at > now());
  IF v_cid IS NULL THEN RETURN false; END IF;   -- no such poll, or not open
  RETURN public.fn_live_poll_can_answer(v_ctype, v_cid, p_learner);
END $function$;
REVOKE EXECUTE ON FUNCTION public._fn_live_poll_learner_can_answer(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_live_poll_learner_can_answer(uuid, uuid) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- ANSWER-SIDE RPCs — swap _fn_induction_learner_can_answer_poll(poll, learner)
--                    ->  _fn_live_poll_learner_can_answer(poll, learner)
-- Bodies are otherwise verbatim.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_induction_submit_poll_response(p_poll_id uuid, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid; a jsonb; v_qid uuid; v_kind text; v_opts uuid[]; v_oid uuid; v_word text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_live_poll_learner_can_answer(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_submit_poll_response: not allowed'; END IF;

  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) LOOP
    v_qid := (a->>'question_id')::uuid;
    SELECT kind INTO v_kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = p_poll_id;
    IF v_kind IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: question not in poll'; END IF;

    -- WORDCLOUD: normalize (collapse whitespace, trim, cap 40), UPSERT the option
    -- row for that word (case-insensitive dedup), then record a single ballot.
    IF v_kind = 'wordcloud' THEN
      v_word := left(btrim(regexp_replace(coalesce(a->>'text',''), '\s+', ' ', 'g')), 40);
      IF v_word = '' THEN RAISE EXCEPTION 'fn_induction_submit_poll_response: empty word'; END IF;

      INSERT INTO public.induction_session_poll_option AS opt (question_id, label, position, is_wordcloud)
      VALUES (v_qid, v_word, (SELECT count(*) FROM public.induction_session_poll_option WHERE question_id = v_qid), true)
      ON CONFLICT (question_id, lower(label)) WHERE is_wordcloud
        DO UPDATE SET label = opt.label   -- no-op keep-first-casing update; just returns the existing id
      RETURNING opt.id INTO v_oid;

      DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND learner_id = v_learner;
      INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, learner_id)
      VALUES (p_poll_id, v_qid, v_oid, v_learner)
      ON CONFLICT (question_id, learner_id, option_id) DO NOTHING;
      CONTINUE;
    END IF;

    -- SINGLE / MULTI / SCALE: option-id ballots. Scale is single-select like 'single'.
    SELECT coalesce(array_agg((e)::uuid),'{}') INTO v_opts
    FROM jsonb_array_elements_text(coalesce(a->'option_ids','[]'::jsonb)) e;

    IF v_kind IN ('single','scale') AND array_length(v_opts,1) IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: single-choice needs exactly one option'; END IF;

    IF EXISTS (SELECT 1 FROM unnest(v_opts) x(oid)
               WHERE NOT EXISTS (SELECT 1 FROM public.induction_session_poll_option o WHERE o.id = x.oid AND o.question_id = v_qid)) THEN
      RAISE EXCEPTION 'fn_induction_submit_poll_response: option does not belong to question'; END IF;

    DELETE FROM public.induction_session_poll_vote WHERE question_id = v_qid AND learner_id = v_learner;
    FOREACH v_oid IN ARRAY v_opts LOOP
      INSERT INTO public.induction_session_poll_vote (poll_id, question_id, option_id, learner_id)
      VALUES (p_poll_id, v_qid, v_oid, v_learner)
      ON CONFLICT (question_id, learner_id, option_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_get_poll_for_answering(p_poll_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid; v_current uuid; v_question jsonb; v_mine jsonb; v_index int; v_total int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_live_poll_learner_can_answer(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_get_poll_for_answering: not allowed'; END IF;

  SELECT p.current_question_id INTO v_current FROM public.induction_session_poll p WHERE p.id = p_poll_id;

  SELECT count(*)::int INTO v_total FROM public.induction_session_poll_question q WHERE q.poll_id = p_poll_id;

  IF v_current IS NOT NULL THEN
    SELECT jsonb_build_object(
             'id', q.id, 'prompt', q.prompt, 'kind', q.kind,
             'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
             'options', CASE WHEN q.kind = 'wordcloud'
                          -- wordcloud: expose ONLY the caller's own submitted word (so the
                          -- banner can rehydrate it), NEVER the aggregate list of everyone's
                          -- words — that stays on the presenter/projector surface only.
                          THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                                FROM public.induction_session_poll_option o
                                WHERE o.question_id = q.id
                                  AND EXISTS (SELECT 1 FROM public.induction_session_poll_vote v
                                              WHERE v.question_id = q.id AND v.option_id = o.id AND v.learner_id = v_learner))
                          ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label) ORDER BY o.position),'[]'::jsonb)
                                FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
                        END),
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
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_poll_question_totals_for_learner(p_poll_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_learner uuid; v_current uuid; v_responders int; v_options jsonb; v_prompt text; v_kind text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_poll_question_totals_for_learner: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL OR NOT public._fn_live_poll_learner_can_answer(p_poll_id, v_learner) THEN
    RAISE EXCEPTION 'fn_induction_poll_question_totals_for_learner: not allowed'; END IF;

  SELECT p.current_question_id INTO v_current FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_current IS NULL THEN RETURN NULL; END IF;

  SELECT q.prompt, q.kind INTO v_prompt, v_kind FROM public.induction_session_poll_question q WHERE q.id = v_current;
  SELECT count(DISTINCT v.learner_id)::int INTO v_responders
  FROM public.induction_session_poll_vote v WHERE v.question_id = v_current;

  IF v_kind = 'wordcloud' THEN
    -- never surface the raw word list to learners; the presenter owns the cloud.
    v_options := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', o.id, 'label', o.label,
             'count', CASE WHEN v_responders >= 3
                           THEN (SELECT count(*) FROM public.induction_session_poll_vote v
                                  WHERE v.question_id = v_current AND v.option_id = o.id)
                           ELSE NULL END
           ) ORDER BY o.position),'[]'::jsonb)
    INTO v_options FROM public.induction_session_poll_option o WHERE o.question_id = v_current;
  END IF;

  RETURN jsonb_build_object('question_id', v_current, 'prompt', v_prompt,
    'response_count', v_responders, 'suppressed', v_responders < 3, 'options', v_options);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_poll_question_totals_for_learner(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_poll_question_totals_for_learner(uuid) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- MANAGE-SIDE RPCs — route the gate through fn_live_poll_can_manage.
--   session-keyed entry points (upsert/open/get_session_poll): pass
--     ('induction_session', p_session_id)  [session_id IS the induction context_id]
--   poll-keyed RPCs (close/set_current/totals/responders): resolve the poll's own
--     (context_type, context_id) and pass those, so a future class/training poll
--     managed through these same RPCs routes to its own authority automatically.
-- Bodies are otherwise verbatim.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session_poll(p_session_id uuid, p_questions jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event uuid; v_inst uuid; v_poll_id uuid;
  q jsonb; o jsonb; v_qid uuid; v_oid uuid; v_kind text;
  v_keep_q uuid[] := '{}'; v_keep_o uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authenticated'; END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst
  FROM public.event_sessions es JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: not an induction session'; END IF;
  IF NOT public.fn_live_poll_can_manage('induction_session', p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session_poll: not authorized'; END IF;

  INSERT INTO public.induction_session_poll (session_id, event_id, institution_id, created_by)
  VALUES (p_session_id, v_event, v_inst, auth.uid())
  ON CONFLICT (session_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_poll_id;

  FOR q IN SELECT value FROM jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) LOOP
    v_kind := coalesce(q->>'kind','single');
    IF nullif(q->>'id','') IS NOT NULL THEN
      v_qid := (q->>'id')::uuid;
      -- Kind is locked once votes exist: changing a voted question's kind would
      -- reinterpret its ballots (e.g. single/multi choice options rendered as cloud
      -- words). The UI enforces this too; make it a server-side invariant.
      IF EXISTS (SELECT 1 FROM public.induction_session_poll_vote WHERE question_id = v_qid)
         AND v_kind IS DISTINCT FROM (SELECT kind FROM public.induction_session_poll_question WHERE id = v_qid AND poll_id = v_poll_id) THEN
        RAISE EXCEPTION 'fn_induction_upsert_session_poll: cannot change the kind of question % after it has votes', v_qid;
      END IF;
      UPDATE public.induction_session_poll_question
      SET prompt = q->>'prompt', kind = v_kind,
          position = coalesce((q->>'position')::int, 0),
          scale_min_label = nullif(q->>'scale_min_label',''),
          scale_max_label = nullif(q->>'scale_max_label','')
      WHERE id = v_qid AND poll_id = v_poll_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: question id % is not in this poll', v_qid; END IF;
    ELSE
      INSERT INTO public.induction_session_poll_question (poll_id, prompt, kind, position, scale_min_label, scale_max_label)
      VALUES (v_poll_id, q->>'prompt', v_kind, coalesce((q->>'position')::int,0),
              nullif(q->>'scale_min_label',''), nullif(q->>'scale_max_label',''))
      RETURNING id INTO v_qid;
    END IF;
    v_keep_q := array_append(v_keep_q, v_qid);

    -- Wordcloud options are minted by fn_induction_submit_poll_response, never by
    -- the host. Leave voted words untouched so re-saving the prompt after votes is
    -- safe — but GC any vote-less options, so a question converted from single/multi
    -- to wordcloud doesn't keep its stale choice options (and orphaned freq-0 words
    -- from re-submits get cleaned up on the next host save).
    IF v_kind = 'wordcloud' THEN
      DELETE FROM public.induction_session_poll_option o
       WHERE o.question_id = v_qid
         AND NOT EXISTS (SELECT 1 FROM public.induction_session_poll_vote v WHERE v.option_id = o.id);
      CONTINUE;
    END IF;

    v_keep_o := '{}';
    FOR o IN SELECT value FROM jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) LOOP
      IF nullif(o->>'id','') IS NOT NULL THEN
        v_oid := (o->>'id')::uuid;
        UPDATE public.induction_session_poll_option
        SET label = o->>'label', position = coalesce((o->>'position')::int,0)
        WHERE id = v_oid AND question_id = v_qid;
        IF NOT FOUND THEN RAISE EXCEPTION 'fn_induction_upsert_session_poll: option id % is not in this question', v_oid; END IF;
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
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_open_session_poll(p_session_id uuid)
 RETURNS induction_session_poll
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_open_session_poll: not authenticated'; END IF;
  IF NOT public.fn_live_poll_can_manage('induction_session', p_session_id) THEN
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
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_open_session_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_get_session_poll(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_session_poll: not authenticated'; END IF;
  IF NOT public.fn_live_poll_can_manage('induction_session', p_session_id) THEN
    RAISE EXCEPTION 'fn_induction_get_session_poll: not authorized'; END IF;
  SELECT * INTO v_p FROM public.induction_session_poll WHERE session_id = p_session_id;
  IF v_p.id IS NULL THEN RETURN NULL; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'position', q.position,
           'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
           'options', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'position',o.position) ORDER BY o.position),'[]'::jsonb)
                       FROM public.induction_session_poll_option o WHERE o.question_id = q.id)
         ) ORDER BY q.position),'[]'::jsonb)
  INTO v_questions FROM public.induction_session_poll_question q WHERE q.poll_id = v_p.id;

  SELECT EXISTS(SELECT 1 FROM public.induction_session_poll_vote WHERE poll_id = v_p.id) INTO v_has_votes;

  RETURN jsonb_build_object('id', v_p.id, 'session_id', v_p.session_id, 'status', v_p.status,
    'auto_close_at', v_p.auto_close_at, 'has_votes', v_has_votes,
    'current_question_id', v_p.current_question_id, 'questions', v_questions);
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_close_session_poll(p_poll_id uuid)
 RETURNS induction_session_poll
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid; v_row public.induction_session_poll;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_poll: not authenticated'; END IF;
  SELECT context_type, context_id INTO v_ctype, v_cid FROM public.induction_session_poll WHERE id = p_poll_id;
  IF v_cid IS NULL THEN RAISE EXCEPTION 'fn_induction_close_session_poll: no such poll'; END IF;
  IF NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN
    RAISE EXCEPTION 'fn_induction_close_session_poll: not authorized'; END IF;
  UPDATE public.induction_session_poll SET status='closed', updated_at=now()
  WHERE id = p_poll_id RETURNING * INTO v_row;
  -- Class anchor state: a MANUAL close must also clear scf_live_pulse.is_open, so
  -- #1626 pulse consumers don't see a stale-open flag. (Auto-close in the totals RPC
  -- already does this; the manual path previously did not — state-drift fix.)
  IF v_ctype = 'class_session' THEN
    UPDATE public.scf_live_pulse SET is_open=false, updated_at=now() WHERE id = v_cid;
  END IF;
  RETURN v_row;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_close_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_close_session_poll(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_set_current_poll_question(p_poll_id uuid, p_question_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_set_current_poll_question: not authenticated'; END IF;
  SELECT p.context_type, p.context_id, p.status INTO v_ctype, v_cid, v_status
  FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_cid IS NULL OR NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: not allowed'; END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: poll is not open'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.induction_session_poll_question q
                 WHERE q.id = p_question_id AND q.poll_id = p_poll_id) THEN
    RAISE EXCEPTION 'fn_induction_set_current_poll_question: question not in poll'; END IF;
  UPDATE public.induction_session_poll
  SET current_question_id = p_question_id, auto_close_at = now() + interval '240 minutes', updated_at = now()
  WHERE id = p_poll_id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_set_current_poll_question(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_set_current_poll_question(uuid, uuid) TO authenticated;

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
  IF NOT public.fn_live_poll_can_manage(v_p.context_type, v_p.context_id) THEN
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
        'scale_min_label', q.scale_min_label, 'scale_max_label', q.scale_max_label,
        'response_count', q_resp.cnt,
        'options', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label, 'count', oc.cnt
          ) ORDER BY o.position),'[]'::jsonb)
          FROM public.induction_session_poll_option o
          CROSS JOIN LATERAL (SELECT count(*)::int AS cnt
                              FROM public.induction_session_poll_vote v WHERE v.option_id = o.id) oc
          WHERE o.question_id = q.id
            -- k>=3 anonymity floor for wordcloud words, enforced SERVER-SIDE (not only
            -- in the presenter): never ship a word to the host wire until >=3 learners
            -- typed it. single/multi/scale options are host-authored choices → all shown.
            AND (q.kind <> 'wordcloud' OR oc.cnt >= 3))
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
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_session_poll_responders(p_poll_id uuid)
 RETURNS TABLE(learner_id uuid, register_number text, roll_number text, learner_name text, questions_answered bigint, answered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ctype text; v_cid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_poll_responders: not authenticated'; END IF;
  SELECT p.context_type, p.context_id INTO v_ctype, v_cid FROM public.induction_session_poll p WHERE p.id = p_poll_id;
  IF v_cid IS NULL OR NOT public.fn_live_poll_can_manage(v_ctype, v_cid) THEN
    RAISE EXCEPTION 'fn_induction_session_poll_responders: not allowed'; END IF;

  -- k>=3 anonymity floor (spec #20): for a CLASS poll, withhold the named responder
  -- roster until >=3 distinct students have answered. At low N a named roster (even
  -- without the answer breakdown) narrows who-answered-what and de-anonymizes students
  -- to the teacher. Empty result → the "Who answered" list stays hidden in the UI.
  IF v_ctype = 'class_session'
     AND (SELECT count(DISTINCT v.learner_id)
          FROM public.induction_session_poll_vote v WHERE v.poll_id = p_poll_id) < 3 THEN
    RETURN;
  END IF;

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
END $function$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_responders(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_responders(uuid) TO authenticated;
