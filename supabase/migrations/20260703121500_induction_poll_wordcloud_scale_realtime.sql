-- 20260703121500_induction_poll_wordcloud_scale_realtime.sql
-- Live Polls v2 for induction sessions (Lane A):
--   #2 New question kinds  : 'scale' (numeric 1..N, reuses the option-based vote
--                            path) and 'wordcloud' (free-text; options minted on
--                            demand inside the submit RPC, deduped case-insensitively).
--   #1 Anonymity-safe realtime : an AFTER trigger on the vote table that fires a
--                            realtime.send broadcast ping carrying ONLY poll_id
--                            (never vote content) on an unguessable per-poll topic.
--
-- No vote-table schema change. Two new nullable anchor-label columns on the
-- question table carry the optional scale end labels; everything else reuses the
-- existing option/vote plumbing so the 2,473 live votes are untouched.
-- Author: Lane A build agent. Date: 2026-07-03.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Extend the question-kind CHECK to the two new kinds.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.induction_session_poll_question
  DROP CONSTRAINT IF EXISTS induction_session_poll_question_kind_check;
ALTER TABLE public.induction_session_poll_question
  ADD CONSTRAINT induction_session_poll_question_kind_check
  CHECK (kind = ANY (ARRAY['single'::text, 'multi'::text, 'scale'::text, 'wordcloud'::text]));

-- Optional display-only anchor labels for a SCALE question (e.g. "Strongly
-- disagree" .. "Strongly agree"). The option labels themselves stay pure numbers.
ALTER TABLE public.induction_session_poll_question
  ADD COLUMN IF NOT EXISTS scale_min_label text,
  ADD COLUMN IF NOT EXISTS scale_max_label text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Case-insensitive per-question option uniqueness — the anchor that lets the
--    wordcloud submit path UPSERT one option row per distinct word. Scoped to
--    WORDCLOUD options only (is_wordcloud flag) so single/multi/scale host options
--    are NOT constrained (two options may legitimately differ only by letter case,
--    e.g. IT/it) and the index can never abort on pre-existing choice labels.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.induction_session_poll_option
  ADD COLUMN IF NOT EXISTS is_wordcloud boolean NOT NULL DEFAULT false;
-- Replace any prior table-wide index with the wordcloud-scoped partial one.
DROP INDEX IF EXISTS public.induction_session_poll_option_qlabel_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS induction_session_poll_option_qlabel_uidx
  ON public.induction_session_poll_option (question_id, lower(label))
  WHERE is_wordcloud;

-- Vote de-dup already exists as unique(question_id, option_id, learner_id) on the vote
-- table, so a learner can never hold two identical rows. The submit RPC's INSERT ...
-- ON CONFLICT DO NOTHING (below) infers that constraint by column-set, making a
-- double-click / retry / realtime re-fire a graceful no-op instead of a 500. Drop the
-- redundant duplicate index if a prior apply of this migration created one.
DROP INDEX IF EXISTS public.induction_session_poll_vote_qlo_uidx;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Host build RPC — accept scale/wordcloud. Scale questions carry generated
--    numeric options (built client-side) through the normal option path; wordcloud
--    questions own NO host options (they are minted by the submit RPC), so their
--    option set is left entirely alone here.
-- ─────────────────────────────────────────────────────────────────────────────
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
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Learner vote RPC — scale votes reuse the single-choice option path; wordcloud
--    votes normalize the submitted text, UPSERT the matching option row, then
--    record one ballot referencing it (re-submit replaces the learner's word).
-- ─────────────────────────────────────────────────────────────────────────────
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
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Learner read RPC — now returns kind (so the UI picks text-input vs choices
--    vs scale) plus the scale anchor labels for the current question.
-- ─────────────────────────────────────────────────────────────────────────────
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
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Host totals RPC — add kind + scale anchor labels so the presenter can render
--    scale (weighted average + distribution) and wordcloud surfaces. Counts and
--    the response tallies are unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Host builder-reload RPC — add kind is already present; add scale anchor
--    labels so the builder re-hydrates the scale range/labels on re-open.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_get_session_poll(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_p public.induction_session_poll; v_questions jsonb; v_has_votes boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_get_session_poll: not authenticated'; END IF;
  IF NOT public._fn_induction_can_manage_session_pulse(p_session_id) THEN
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Anonymity-safe realtime broadcast. A per-row trigger on the vote table fires
--    realtime.send with a payload carrying ONLY poll_id (never vote content) on an
--    unguessable per-poll topic 'induction_poll:<poll_uuid>'. private=true: the
--    receive RLS policy below scopes each subscribe to the poll's enrolled learners
--    and the session host, and the payload never carries vote content or identity.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_induction_poll_vote_broadcast()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_poll uuid;
BEGIN
  v_poll := COALESCE(NEW.poll_id, OLD.poll_id);
  IF v_poll IS NOT NULL THEN
    -- A broadcast failure (realtime schema / permission / availability hiccup) must
    -- NEVER roll back the vote — voting is the critical path; the ping is best-effort.
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('poll_id', v_poll),       -- payload: poll_id ONLY
        'vote',                                       -- event
        'induction_poll:' || v_poll::text,            -- topic (unguessable UUID)
        true                                          -- private=true: receive RLS scopes it to the poll's learners/host
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;   -- vote row already written; the realtime ping is optional
    END;
  END IF;
  RETURN NULL;   -- AFTER trigger, return value ignored
END $function$;

DROP TRIGGER IF EXISTS trg_induction_poll_vote_broadcast ON public.induction_session_poll_vote;
CREATE TRIGGER trg_induction_poll_vote_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON public.induction_session_poll_vote
  FOR EACH ROW EXECUTE FUNCTION public.fn_induction_poll_vote_broadcast();

-- Receive policy (private=true): a client may subscribe to induction_poll:<pollId>
-- ONLY if it is an enrolled learner who can answer that poll OR the session's host.
-- This closes the cross-tenant subscribe channel — knowing the topic UUID is no
-- longer sufficient. Evaluated once per subscribe; get_my_learner_id() is NULL for a
-- staff host, so the learner check fails cleanly and the manage check authorizes
-- them. If this (wrongly) denies, the client silently falls back to interval polling,
-- so delivery can only degrade, never break.
DROP POLICY IF EXISTS "induction_poll_realtime_receive" ON realtime.messages;
CREATE POLICY "induction_poll_realtime_receive" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    topic LIKE 'induction_poll:%'
    AND EXISTS (
      SELECT 1 FROM public.induction_session_poll p
      WHERE p.id = NULLIF(split_part(topic, ':', 2), '')::uuid
        AND ( public._fn_induction_learner_can_answer_poll(p.id, public.get_my_learner_id())
              OR public._fn_induction_can_manage_session_pulse(p.session_id) )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Lock down execute grants on every CHANGED SECURITY DEFINER RPC (anon must
--    never call these). The trigger function gets no grant — it is invoked by the
--    trigger, not by clients.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_upsert_session_poll(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_poll_response(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_poll_for_answering(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_poll_totals(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_get_session_poll(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_induction_poll_vote_broadcast() FROM anon, PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Learner live-totals RPC — made WORDCLOUD-AWARE (anonymity fix). Words are
--     stored as option labels, so the generic per-option payload would ship every
--     learner's raw word to every other learner (Network-tab readable) below the
--     k>=3 floor. For wordcloud we return NO options to learners: the aggregate
--     cloud lives only on the presenter/projector. Choice/scale behaviour is the
--     exact pre-existing logic, unchanged.
-- ─────────────────────────────────────────────────────────────────────────────
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
  IF v_learner IS NULL OR NOT public._fn_induction_learner_can_answer_poll(p_poll_id, v_learner) THEN
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
