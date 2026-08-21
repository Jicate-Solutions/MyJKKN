-- 20260821111922_session_question_board.sql
-- Session question board — learners ASK, learners UPVOTE, the host ANSWERS.
--
-- WHY A NEW SHAPE, NOT A POLL KIND: in a poll the HOST asks and the audience picks.
-- Here the AUDIENCE asks and the AUDIENCE ranks. Content flows the opposite way, so
-- it gets its own tables rather than a `kind` on induction_session_poll_question.
--
-- WHY ONE SHARED PIECE: MyJKKN already carries six poll systems and five are dead
-- (ai_pulse_polls 0 rows, meeting_polls 0, pp_polls 0, lc_poll_votes 2). A seventh
-- per-module copy would repeat that. The board anchors polymorphically on
-- (host_type, host_id) so induction / AI Pulse / meetings all switch on the SAME code.
--
-- Conventions copied from the ONE live system (20260630210000 induction session polls):
--   * institution_id on the root row (multi-tenant), RLS on every table with a
--     super_admin-only direct-access policy, and ALL real access through SECURITY
--     DEFINER RPCs.
--   * learner identity is learners_profiles(id) — the same identity get_my_learner_id()
--     and induction_enrollment.learner_id use.
--   * learner_id lives on the question/vote row for ENFORCEMENT only. The room-facing
--     RPC never returns it, exactly as fn_induction_session_poll_totals anonymizes.
--   * updated_at touch trigger; NOTIFY pgrst at the end.
--
-- The eight decisions this implements (Director, 2026-08-21) are named inline at the
-- line that satisfies each, so a later reader can check them off against the code.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- D1: ONE board shape, switchable by any session type via (host_type, host_id).
-- D5: status DEFAULTS to 'open' — the board is ON everywhere the moment a host
--     opens it; there is no per-session enable flag and no staged rollout.
CREATE TABLE IF NOT EXISTS public.session_question_board (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_type       text NOT NULL CHECK (host_type IN ('induction','ai_pulse','meeting')),
  host_id         uuid NOT NULL,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (host_type, host_id)
);
CREATE INDEX IF NOT EXISTS idx_sqb_institution ON public.session_question_board(institution_id);

COMMENT ON TABLE public.session_question_board IS
  'One learner question board per session, anchored polymorphically on (host_type, host_id): host_id is an event_sessions.id for host_type=induction, and the cycle/meeting id for the other two. Access via DEFINER RPCs only.';

-- D8: nickname_seq is the number behind "Learner 7". It is minted PER BOARD in
--     arrival order, so it is stable for one learner inside one session and carries
--     NO meaning across sessions — the same person is a different number on the next
--     board, which is what keeps it from becoming a cross-session identifier.
-- D4: 'answered' is a first-class state (plus answered_at/answered_by) so
--     "sessions where a learner-asked question got answered" is one query on day one.
CREATE TABLE IF NOT EXISTS public.session_question (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id         uuid NOT NULL REFERENCES public.session_question_board(id) ON DELETE CASCADE,
  learner_id       uuid NOT NULL REFERENCES public.learners_profiles(id)      ON DELETE CASCADE,
  nickname_seq     int  NOT NULL,
  body             text NOT NULL,
  state            text NOT NULL DEFAULT 'visible'
                        CHECK (state IN ('visible','blocked','answered','dismissed')),
  moderation_note  text,
  answered_at      timestamptz,
  answered_by      uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sq_board_state   ON public.session_question(board_id, state);
CREATE INDEX IF NOT EXISTS idx_sq_board_learner ON public.session_question(board_id, learner_id);
CREATE INDEX IF NOT EXISTS idx_sq_answered      ON public.session_question(board_id) WHERE state = 'answered';

COMMENT ON TABLE public.session_question IS
  'A learner-submitted question. learner_id is for one-nickname-per-learner and own-question visibility ONLY — never returned by fn_session_question_room (the room sees "Learner <nickname_seq>"); the host sees the real name through fn_session_question_host_list.';

CREATE TABLE IF NOT EXISTS public.session_question_vote (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES public.session_question(id)      ON DELETE CASCADE,
  learner_id   uuid NOT NULL REFERENCES public.learners_profiles(id)     ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_sqv_question ON public.session_question_vote(question_id);

COMMENT ON TABLE public.session_question_vote IS
  'One upvote per learner per question (UNIQUE enforces it). learner_id is never exposed by the room RPC — only the count and the caller''s own my_vote flag.';

-- D3/D6: the abusive-content list is DATA, not code, so an institution can curate it
-- without a deploy. Seeded with a short, unambiguous English set; matching is on whole
-- words (see fn_session_question_moderation_verdict) so ordinary words containing a
-- term are not caught.
CREATE TABLE IF NOT EXISTS public.session_question_blocked_term (
  term        text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.session_question_blocked_term (term) VALUES
  ('fuck'),('fucking'),('shit'),('bitch'),('bastard'),('asshole'),('slut'),('whore'),('rape'),('retard')
ON CONFLICT (term) DO NOTHING;

-- touch updated_at (public.update_updated_at_column already exists repo-wide)
DROP TRIGGER IF EXISTS trg_sqb_touch ON public.session_question_board;
CREATE TRIGGER trg_sqb_touch BEFORE UPDATE ON public.session_question_board
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_sq_touch ON public.session_question;
CREATE TRIGGER trg_sq_touch BEFORE UPDATE ON public.session_question
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Anon lock + RLS. Written out per table rather than in a DO loop: a statement built
-- inside EXECUTE format() is a string, so the CI guards (check-table-anon-revoke.mjs)
-- cannot see it and neither can a reviewer grepping the file.
REVOKE ALL ON TABLE public.session_question_board FROM anon, PUBLIC;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_question_board TO authenticated;
ALTER  TABLE public.session_question_board ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_question_board_super_admin ON public.session_question_board;
CREATE POLICY session_question_board_super_admin ON public.session_question_board FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

REVOKE ALL ON TABLE public.session_question FROM anon, PUBLIC;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_question TO authenticated;
ALTER  TABLE public.session_question ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_question_super_admin ON public.session_question;
CREATE POLICY session_question_super_admin ON public.session_question FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

REVOKE ALL ON TABLE public.session_question_vote FROM anon, PUBLIC;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_question_vote TO authenticated;
ALTER  TABLE public.session_question_vote ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_question_vote_super_admin ON public.session_question_vote;
CREATE POLICY session_question_vote_super_admin ON public.session_question_vote FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

REVOKE ALL ON TABLE public.session_question_blocked_term FROM anon, PUBLIC;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_question_blocked_term TO authenticated;
ALTER  TABLE public.session_question_blocked_term ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_question_blocked_term_super_admin ON public.session_question_blocked_term;
CREATE POLICY session_question_blocked_term_super_admin ON public.session_question_blocked_term FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- D3: the auto-check. Whole-word match against the curated term list, so "class"
-- never trips on a term inside it. Returns {blocked, note} — it NEVER writes and
-- NEVER decides what the caller does with the verdict; fn_session_question_ask owns
-- the fail-open behaviour (D6).
CREATE OR REPLACE FUNCTION public.fn_session_question_moderation_verdict(p_body text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_norm text; v_hit text;
BEGIN
  -- collapse everything that is not a letter/digit to a single space, and pad the
  -- ends, so '% <term> %' is a true word-boundary test.
  v_norm := ' ' || regexp_replace(lower(coalesce(p_body, '')), '[^a-z0-9]+', ' ', 'g') || ' ';
  SELECT b.term INTO v_hit
  FROM public.session_question_blocked_term b
  WHERE v_norm LIKE '% ' || b.term || ' %'
  LIMIT 1;
  IF v_hit IS NOT NULL THEN
    RETURN jsonb_build_object('blocked', true, 'note', 'auto-check: matched a community-rules term');
  END IF;
  RETURN jsonb_build_object('blocked', false, 'note', NULL);
END $fn$;
-- Not granted to authenticated on purpose: this is an internal step of
-- fn_session_question_ask, which is SECURITY DEFINER and so calls it as the owner. A
-- signed-in caller with EXECUTE could probe the blocked-term list one word at a time.
REVOKE EXECUTE ON FUNCTION public.fn_session_question_moderation_verdict(text) FROM anon, authenticated, PUBLIC;

-- May the caller run this board as its host? For induction this delegates to the LIVE
-- generalized authority fn_live_poll_can_manage('induction_session', ...) rather than
-- inventing a parallel rule; for the other two host types the board's creator (the host
-- who switched it on) plus platform admins hold it.
CREATE OR REPLACE FUNCTION public._fn_session_question_can_host(p_board_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_host_type text; v_host_id uuid; v_created_by uuid;
BEGIN
  IF auth.uid() IS NULL OR p_board_id IS NULL THEN RETURN false; END IF;
  SELECT b.host_type, b.host_id, b.created_by
    INTO v_host_type, v_host_id, v_created_by
  FROM public.session_question_board b WHERE b.id = p_board_id;
  IF v_host_type IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin() OR public.is_admin() THEN RETURN true; END IF;
  IF v_created_by IS NOT NULL AND v_created_by = auth.uid() THEN RETURN true; END IF;
  IF v_host_type = 'induction' THEN
    RETURN coalesce(public.fn_live_poll_can_manage('induction_session', v_host_id), false);
  END IF;
  RETURN false;
END $fn$;
REVOKE EXECUTE ON FUNCTION public._fn_session_question_can_host(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_session_question_can_host(uuid) TO authenticated;

-- May THIS learner take part in THIS board? Induction reuses the poll rule (enrolled in
-- the event + the session applies to their batch); the other host types scope on the
-- board's institution, which for a learner role resolves to their own institution.
CREATE OR REPLACE FUNCTION public._fn_session_question_can_participate(p_board_id uuid, p_learner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_host_type text; v_host_id uuid; v_inst uuid; v_status text;
BEGIN
  IF p_learner IS NULL OR p_board_id IS NULL THEN RETURN false; END IF;
  SELECT b.host_type, b.host_id, b.institution_id, b.status
    INTO v_host_type, v_host_id, v_inst, v_status
  FROM public.session_question_board b WHERE b.id = p_board_id;
  IF v_host_type IS NULL OR v_status <> 'open' THEN RETURN false; END IF;

  IF v_host_type = 'induction' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.event_sessions es
      JOIN public.induction_enrollment ie
        ON ie.event_id = es.event_id AND ie.learner_id = p_learner
      WHERE es.id = v_host_id AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
    );
  END IF;
  RETURN coalesce(public.role_has_institution_access(v_inst), false);
END $fn$;
REVOKE EXECUTE ON FUNCTION public._fn_session_question_can_participate(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._fn_session_question_can_participate(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Host RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Switch the board on for a session (idempotent). D5: it is created 'open', so there
-- is no second "enable" step — opening the panel is switching it on.
CREATE OR REPLACE FUNCTION public.fn_session_question_board_ensure(
  p_host_type text, p_host_id uuid, p_institution_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_inst uuid; v_board uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_session_question_board_ensure: not authenticated'; END IF;
  IF p_host_type NOT IN ('induction','ai_pulse','meeting') THEN
    RAISE EXCEPTION 'fn_session_question_board_ensure: unknown host_type'; END IF;

  SELECT b.id INTO v_board FROM public.session_question_board b
  WHERE b.host_type = p_host_type AND b.host_id = p_host_id;
  IF v_board IS NOT NULL THEN
    IF NOT public._fn_session_question_can_host(v_board) THEN
      RAISE EXCEPTION 'fn_session_question_board_ensure: not authorized'; END IF;
    RETURN v_board;
  END IF;

  IF p_host_type = 'induction' THEN
    -- institution comes from the server, never the client (mirrors fn_induction_upsert_session_poll)
    SELECT ip.institution_id INTO v_inst
    FROM public.event_sessions es
    JOIN public.induction_programs ip ON ip.event_id = es.event_id
    WHERE es.id = p_host_id;
    IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_session_question_board_ensure: not an induction session'; END IF;
    IF NOT coalesce(public.fn_live_poll_can_manage('induction_session', p_host_id), false) THEN
      RAISE EXCEPTION 'fn_session_question_board_ensure: not authorized'; END IF;
  ELSE
    -- ai_pulse / meeting: no shared membership helper exists for these yet, so creation
    -- is held by platform admins or by a STAFF member (no learner identity) who already
    -- has access to that institution. The creator then becomes the board's host.
    v_inst := p_institution_id;
    IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_session_question_board_ensure: institution required'; END IF;
    IF NOT (public.is_super_admin() OR public.is_admin()
            OR (public.get_my_learner_id() IS NULL
                AND coalesce(public.role_has_institution_access(v_inst), false))) THEN
      RAISE EXCEPTION 'fn_session_question_board_ensure: not authorized'; END IF;
  END IF;

  INSERT INTO public.session_question_board (host_type, host_id, institution_id, created_by)
  VALUES (p_host_type, p_host_id, v_inst, auth.uid())
  ON CONFLICT (host_type, host_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_board;
  RETURN v_board;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_board_ensure(text, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_board_ensure(text, uuid, uuid) TO authenticated;

-- D2: the HOST end. Same questions as the room, PLUS who asked — name, register number,
-- learner_id — so the host can group one person's related questions and answer them.
CREATE OR REPLACE FUNCTION public.fn_session_question_host_list(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_status text; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_session_question_host_list: not authenticated'; END IF;
  IF NOT public._fn_session_question_can_host(p_board_id) THEN
    RAISE EXCEPTION 'fn_session_question_host_list: not authorized'; END IF;
  SELECT b.status INTO v_status FROM public.session_question_board b WHERE b.id = p_board_id;

  SELECT coalesce(jsonb_agg(x ORDER BY x_votes DESC, x_created ASC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
             'id', q.id,
             'nickname', 'Learner ' || q.nickname_seq,
             'body', q.body,
             'state', q.state,
             'moderation_note', q.moderation_note,
             'vote_count', (SELECT count(*) FROM public.session_question_vote v WHERE v.question_id = q.id),
             'created_at', q.created_at,
             'answered_at', q.answered_at,
             'learner_id', q.learner_id,
             'learner_name', nullif(trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), ''),
             'register_number', lp.register_number::text
           ) AS x,
           (SELECT count(*) FROM public.session_question_vote v WHERE v.question_id = q.id) AS x_votes,
           q.created_at AS x_created
    FROM public.session_question q
    JOIN public.learners_profiles lp ON lp.id = q.learner_id
    WHERE q.board_id = p_board_id
  ) s;

  RETURN jsonb_build_object('board_id', p_board_id, 'status', v_status, 'questions', v_rows);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_host_list(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_host_list(uuid) TO authenticated;

-- Host moves a question: answered (D4), dismissed, blocked (D6 — the host is the
-- remover of last resort), or back to visible.
CREATE OR REPLACE FUNCTION public.fn_session_question_set_state(
  p_question_id uuid, p_state text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_board uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Please sign in.'); END IF;
  IF p_state NOT IN ('visible','blocked','answered','dismissed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown state.'); END IF;
  SELECT q.board_id INTO v_board FROM public.session_question q WHERE q.id = p_question_id;
  IF v_board IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'That question no longer exists.'); END IF;
  IF NOT public._fn_session_question_can_host(v_board) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the session host can do that.'); END IF;

  UPDATE public.session_question
  SET state           = p_state,
      moderation_note = CASE WHEN p_state = 'visible' THEN NULL ELSE coalesce(p_note, moderation_note) END,
      answered_at     = CASE WHEN p_state = 'answered' THEN coalesce(answered_at, now()) ELSE NULL END,
      answered_by     = CASE WHEN p_state = 'answered' THEN coalesce(answered_by, auth.uid()) ELSE NULL END
  WHERE id = p_question_id;

  RETURN jsonb_build_object('success', true, 'error', NULL, 'state', p_state);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_set_state(uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_set_state(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_session_question_set_board_status(p_board_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Please sign in.'); END IF;
  IF p_status NOT IN ('open','closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown status.'); END IF;
  IF NOT public._fn_session_question_can_host(p_board_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the session host can do that.'); END IF;
  UPDATE public.session_question_board SET status = p_status WHERE id = p_board_id;
  RETURN jsonb_build_object('success', true, 'error', NULL, 'status', p_status);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_set_board_status(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_set_board_status(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Learner / room RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Discovery for the learner's own view. Mirrors fn_induction_session_poll_for_learner:
-- only boards this learner can actually take part in. (Induction is the host type with a
-- shared membership join; ai_pulse / meeting boards are reached from their own page with
-- a known board id.)
CREATE OR REPLACE FUNCTION public.fn_session_question_boards_for_learner()
RETURNS TABLE (board_id uuid, host_type text, host_id uuid, title text, day_number integer,
               question_count bigint, my_question_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_session_question_boards_for_learner: not authenticated'; END IF;
  v_learner := public.get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT b.id, b.host_type, b.host_id, es.title, es.day_number,
         (SELECT count(*) FROM public.session_question q
           WHERE q.board_id = b.id AND q.state IN ('visible','answered')),
         (SELECT count(*) FROM public.session_question q
           WHERE q.board_id = b.id AND q.learner_id = v_learner)
  FROM public.session_question_board b
  JOIN public.event_sessions es ON es.id = b.host_id
  JOIN public.induction_enrollment ie
    ON ie.event_id = es.event_id AND ie.learner_id = v_learner
  WHERE b.host_type = 'induction' AND b.status = 'open'
    AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
    -- same rule the room and write paths use, asserted here rather than left to the join
    AND public._fn_session_question_can_participate(b.id, v_learner)
  ORDER BY es.start_at NULLS LAST, es.day_number NULLS LAST;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_boards_for_learner() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_boards_for_learner() TO authenticated;

-- D2: the ROOM end. learner_id is NOT in the payload at any point — the room sees
-- "Learner <n>" and nothing else. A learner additionally sees their OWN blocked or
-- dismissed question (with the reason), which is how D7 reaches them after the fact.
CREATE OR REPLACE FUNCTION public.fn_session_question_room(p_board_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_learner uuid; v_can_ask boolean; v_is_host boolean;
        v_status text; v_host_type text; v_host_id uuid; v_seq int; v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_session_question_room: not authenticated'; END IF;
  SELECT b.status, b.host_type, b.host_id INTO v_status, v_host_type, v_host_id
  FROM public.session_question_board b WHERE b.id = p_board_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'fn_session_question_room: no such board'; END IF;

  v_learner := public.get_my_learner_id();
  v_can_ask := public._fn_session_question_can_participate(p_board_id, v_learner);
  -- the gate calls the host predicate HERE, in the IF itself: a predicate that is only
  -- assigned to a variable authorises nobody, it just records an answer.
  IF NOT (v_can_ask OR public._fn_session_question_can_host(p_board_id)) THEN
    RAISE EXCEPTION 'fn_session_question_room: not allowed'; END IF;
  v_is_host := public._fn_session_question_can_host(p_board_id);

  SELECT q.nickname_seq INTO v_seq FROM public.session_question q
  WHERE q.board_id = p_board_id AND q.learner_id = v_learner LIMIT 1;

  SELECT coalesce(jsonb_agg(x ORDER BY x_votes DESC, x_created ASC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
             'id', q.id,
             'nickname', 'Learner ' || q.nickname_seq,
             'body', q.body,
             'state', q.state,
             'vote_count', (SELECT count(*) FROM public.session_question_vote v WHERE v.question_id = q.id),
             'my_vote', EXISTS (SELECT 1 FROM public.session_question_vote v
                                 WHERE v.question_id = q.id AND v.learner_id = v_learner),
             'is_mine', (v_learner IS NOT NULL AND q.learner_id = v_learner),
             -- only ever shown back to the person who asked it
             'moderation_note', CASE WHEN v_learner IS NOT NULL AND q.learner_id = v_learner
                                     THEN q.moderation_note ELSE NULL END,
             'created_at', q.created_at
           ) AS x,
           (SELECT count(*) FROM public.session_question_vote v WHERE v.question_id = q.id) AS x_votes,
           q.created_at AS x_created
    FROM public.session_question q
    WHERE q.board_id = p_board_id
      AND (q.state IN ('visible','answered')
           OR (v_learner IS NOT NULL AND q.learner_id = v_learner))
  ) s;

  RETURN jsonb_build_object(
    'board_id', p_board_id, 'host_type', v_host_type, 'host_id', v_host_id,
    'status', v_status, 'can_ask', v_can_ask, 'is_host', v_is_host,
    'my_nickname', CASE WHEN v_seq IS NULL THEN NULL ELSE 'Learner ' || v_seq END,
    'questions', v_rows);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_room(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_room(uuid) TO authenticated;

-- The write path. Three decisions live here and are the reason it returns a result
-- object instead of raising:
--   D3 the question is posted INSTANTLY and auto-checked — there is no host approval queue.
--   D6 the auto-check FAILS OPEN. If it is slow (2s budget), errors, or the term list is
--      unreadable, the exception block leaves state='visible' and the question SHOWS. A
--      board that goes blank mid-session is never trusted again, so a checker fault must
--      never swallow a learner's question.
--   D7 a blocked learner is TOLD in general terms. The row is still written (the host can
--      review and restore it) and {success:false, error:...} comes back for the UI to
--      render — never a silent failure and never a silent redirect (CLAUDE.md #27).
--   D8 the per-board nickname is minted here under an advisory lock so two learners
--      posting at the same instant cannot land on the same number.
CREATE OR REPLACE FUNCTION public.fn_session_question_ask(p_board_id uuid, p_body text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_learner uuid; v_body text; v_seq int; v_id uuid;
  v_state text := 'visible'; v_note text := NULL;
  v_verdict jsonb; v_prev_timeout text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please sign in to ask a question.'); END IF;
  v_learner := public.get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only learners can post to the question board.'); END IF;
  IF NOT public._fn_session_question_can_participate(p_board_id, v_learner) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This question board is closed, or it is not open to you.'); END IF;

  v_body := btrim(coalesce(p_body, ''));
  IF length(v_body) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please type your question first.'); END IF;
  IF length(v_body) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please keep your question under 500 characters.'); END IF;

  v_prev_timeout := current_setting('statement_timeout', true);
  BEGIN
    -- a slow checker must not hold up the room; 2s then give up and show the question
    PERFORM set_config('statement_timeout', '2000', true);
    v_verdict := public.fn_session_question_moderation_verdict(v_body);
    IF coalesce((v_verdict->>'blocked')::boolean, false) THEN
      v_state := 'blocked';
      v_note  := v_verdict->>'note';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- D6 fail open: cancelled, errored, or unavailable checker => the question shows.
    v_state := 'visible';
    v_note  := NULL;
  END;
  PERFORM set_config('statement_timeout', coalesce(nullif(v_prev_timeout, ''), '0'), true);

  PERFORM pg_advisory_xact_lock(hashtext(p_board_id::text));
  SELECT q.nickname_seq INTO v_seq FROM public.session_question q
  WHERE q.board_id = p_board_id AND q.learner_id = v_learner LIMIT 1;
  IF v_seq IS NULL THEN
    SELECT coalesce(max(q.nickname_seq), 0) + 1 INTO v_seq
    FROM public.session_question q WHERE q.board_id = p_board_id;
  END IF;

  INSERT INTO public.session_question (board_id, learner_id, nickname_seq, body, state, moderation_note)
  VALUES (p_board_id, v_learner, v_seq, v_body, v_state, v_note)
  RETURNING id INTO v_id;

  IF v_state = 'blocked' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This may breach community rules, so it is not on the board. Reword it, or ask the host directly.',
      'question_id', v_id, 'state', v_state, 'nickname', 'Learner ' || v_seq);
  END IF;

  RETURN jsonb_build_object('success', true, 'error', NULL,
                            'question_id', v_id, 'state', v_state, 'nickname', 'Learner ' || v_seq);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_ask(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_ask(uuid, text) TO authenticated;

-- Upvote / take the upvote back. UNIQUE (question_id, learner_id) is the real guard;
-- this is the toggle around it. learner_id never leaves the function.
CREATE OR REPLACE FUNCTION public.fn_session_question_toggle_vote(p_question_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_learner uuid; v_board uuid; v_state text; v_deleted uuid; v_voted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please sign in to upvote.'); END IF;
  v_learner := public.get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only learners can upvote a question.'); END IF;

  SELECT q.board_id, q.state INTO v_board, v_state
  FROM public.session_question q WHERE q.id = p_question_id;
  IF v_board IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'That question is no longer on the board.'); END IF;
  IF v_state NOT IN ('visible','answered') THEN
    RETURN jsonb_build_object('success', false, 'error', 'That question is no longer on the board.'); END IF;
  IF NOT public._fn_session_question_can_participate(v_board, v_learner) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This question board is closed, or it is not open to you.'); END IF;

  DELETE FROM public.session_question_vote
  WHERE question_id = p_question_id AND learner_id = v_learner
  RETURNING id INTO v_deleted;

  IF v_deleted IS NULL THEN
    INSERT INTO public.session_question_vote (question_id, learner_id)
    VALUES (p_question_id, v_learner)
    ON CONFLICT (question_id, learner_id) DO NOTHING;
    v_voted := true;
  ELSE
    v_voted := false;
  END IF;

  RETURN jsonb_build_object('success', true, 'error', NULL, 'voted', v_voted,
    'vote_count', (SELECT count(*) FROM public.session_question_vote v WHERE v.question_id = p_question_id));
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_toggle_vote(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_toggle_vote(uuid) TO authenticated;

-- D4: the success test in one call — sessions where a learner-asked question actually
-- got ANSWERED. Count the rows in a 30-day window; three or more is the target.
CREATE OR REPLACE FUNCTION public.fn_session_question_answered_scoreboard(
  p_since timestamptz DEFAULT (now() - interval '30 days'))
RETURNS TABLE (board_id uuid, host_type text, host_id uuid, institution_id uuid,
               questions_asked bigint, questions_answered bigint, first_answered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_session_question_answered_scoreboard: not authenticated'; END IF;
  RETURN QUERY
  SELECT b.id, b.host_type, b.host_id, b.institution_id,
         count(q.id),
         count(q.id) FILTER (WHERE q.state = 'answered'),
         min(q.answered_at) FILTER (WHERE q.state = 'answered')
  FROM public.session_question_board b
  JOIN public.session_question q ON q.board_id = b.id
  WHERE q.created_at >= p_since
    AND (public.is_super_admin() OR public.is_admin()
         OR coalesce(public.role_has_institution_access(b.institution_id), false))
  GROUP BY b.id, b.host_type, b.host_id, b.institution_id
  HAVING count(q.id) FILTER (WHERE q.state = 'answered') > 0
  ORDER BY min(q.answered_at) FILTER (WHERE q.state = 'answered') DESC;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_answered_scoreboard(timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_answered_scoreboard(timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
