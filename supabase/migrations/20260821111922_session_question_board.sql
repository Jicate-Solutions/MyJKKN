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
-- Terms in ANY script are matched, Tamil included — the seed is English only because
-- that is what can be reviewed here; a Tamil set must be curated into this table by a
-- native speaker rather than guessed at in a migration.
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
DECLARE
  -- Word separators: ASCII whitespace and ASCII punctuation, and NOTHING else. Every
  -- character from U+0080 up survives, so a Tamil question reaches the match instead of
  -- being erased before it. The class this replaces was [^a-z0-9], which normalised a
  -- whole Tamil question down to the empty string — in a Tamil Nadu institution the
  -- check could therefore only ever see English.
  --   * literal ASCII ranges, not [[:alnum:]]/[[:punct:]]: those are lc_ctype-dependent
  --     and classify Tamil letters and combining marks differently on macOS libc than on
  --     the Linux libc production runs, so the same question would be judged differently
  --     depending on where the SQL ran.
  --   * escaped (\t\n\v\f\r), not literal control bytes, so CRLF normalisation of this
  --     file cannot silently rewrite the class.
  c_sep constant text := '[\t\n\v\f\r -/:-@[-`{-~]+';
  v_norm text; v_hit text;
BEGIN
  -- collapse every separator run to a single space, and pad the ends, so '% <term> %'
  -- is a true word-boundary test.
  v_norm := ' ' || regexp_replace(lower(coalesce(p_body, '')), c_sep, ' ', 'g') || ' ';
  -- The TERM is normalised the SAME way, so a curated term and the learner's text meet
  -- in one shape — otherwise a Tamil term keeping its combining marks could never equal
  -- a body that had lost them. A term that normalises to nothing is skipped: an
  -- all-punctuation row would become the pattern '%  %' and flag every question on the
  -- board. Normalising the term also strips % and _, so a curated term cannot smuggle
  -- in a LIKE wildcard.
  SELECT b.term INTO v_hit
  FROM public.session_question_blocked_term b
  CROSS JOIN LATERAL (SELECT btrim(regexp_replace(lower(b.term), c_sep, ' ', 'g')) AS t) n
  WHERE n.t <> '' AND v_norm LIKE '% ' || n.t || ' %'
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
-- NOT granted to authenticated: every caller is SECURITY DEFINER and runs as the
-- owner, so the grant changes no behaviour — but it WOULD let any signed-in user
-- probe "is learner X in the event behind board Y?" one boolean at a time. Same
-- disclosure-oracle shape as the 2-arg user_has_permission closed on 2026-08-19.
REVOKE EXECUTE ON FUNCTION public._fn_session_question_can_host(uuid) FROM authenticated;

-- May THIS learner READ this board — irrespective of whether it is still taking
-- questions? Induction reuses the poll rule (enrolled in the event + the session applies
-- to their batch); the other host types scope on the board's institution, which for a
-- learner role resolves to their own institution.
--
-- Split out from _can_participate on purpose. MEMBERSHIP ("this board is mine to read")
-- and OPEN-NESS ("this board is still taking questions") are two different questions, and
-- fusing them is what made a closed board vanish from the learner's screen with no
-- message — CLAUDE.md #27 — taking the answers to their own questions with it. Read paths
-- ask this one; write paths ask _can_participate.
-- Named to the repo's `fn_<domain>_can_<verb>` authority-helper family on purpose: that
-- is the shape check-secdef-anon-revoke.mjs recognises as a real authorization predicate,
-- and this is the predicate now gating fn_session_question_boards_for_learner.
CREATE OR REPLACE FUNCTION public._fn_session_question_can_read(p_board_id uuid, p_learner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_host_type text; v_host_id uuid; v_inst uuid;
BEGIN
  IF p_learner IS NULL OR p_board_id IS NULL THEN RETURN false; END IF;
  SELECT b.host_type, b.host_id, b.institution_id
    INTO v_host_type, v_host_id, v_inst
  FROM public.session_question_board b WHERE b.id = p_board_id;
  IF v_host_type IS NULL THEN RETURN false; END IF;

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
REVOKE EXECUTE ON FUNCTION public._fn_session_question_can_read(uuid, uuid) FROM anon, PUBLIC;
-- NOT granted to authenticated, for the same disclosure-oracle reason as the predicates
-- below: every caller is SECURITY DEFINER and runs as the owner, so the grant would buy
-- nothing except a way to probe "is learner X in the event behind board Y?".
REVOKE EXECUTE ON FUNCTION public._fn_session_question_can_read(uuid, uuid) FROM authenticated;

-- May THIS learner WRITE to THIS board — post a question or cast an upvote? Audience
-- membership AND the board still being open. Unchanged in meaning; it now names the two
-- halves separately so a read path can ask for only the first.
CREATE OR REPLACE FUNCTION public._fn_session_question_can_participate(p_board_id uuid, p_learner uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_status text;
BEGIN
  IF p_learner IS NULL OR p_board_id IS NULL THEN RETURN false; END IF;
  SELECT b.status INTO v_status FROM public.session_question_board b WHERE b.id = p_board_id;
  IF v_status IS DISTINCT FROM 'open' THEN RETURN false; END IF;
  RETURN coalesce(public._fn_session_question_can_read(p_board_id, p_learner), false);
END $fn$;
REVOKE EXECUTE ON FUNCTION public._fn_session_question_can_participate(uuid, uuid) FROM anon, PUBLIC;
-- NOT granted to authenticated: every caller is SECURITY DEFINER and runs as the
-- owner, so the grant changes no behaviour — but it WOULD let any signed-in user
-- probe "is learner X in the event behind board Y?" one boolean at a time. Same
-- disclosure-oracle shape as the 2-arg user_has_permission closed on 2026-08-19.
REVOKE EXECUTE ON FUNCTION public._fn_session_question_can_participate(uuid, uuid) FROM authenticated;

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
    IF NOT coalesce(public._fn_session_question_can_host(v_board), false) THEN
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
  IF NOT coalesce(public._fn_session_question_can_host(p_board_id), false) THEN
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
  IF NOT coalesce(public._fn_session_question_can_host(v_board), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the session host can do that.'); END IF;

  UPDATE public.session_question
  SET state           = p_state,
      moderation_note = CASE WHEN p_state = 'visible' THEN NULL ELSE coalesce(p_note, moderation_note) END,
      -- STICKY ON PURPOSE. A host who answers a question and later dismisses it must
      -- not erase the fact that it WAS answered: D4's success test (>=3 sessions with
      -- an answered learner question in a month) is measured from this column, and a
      -- metric an ordinary host action can destroy is not a metric. Same class as the
      -- status='active' filter that once zeroed the CAC funnel — record what was EVER
      -- true, and let `state` carry what is true NOW.
      answered_at     = CASE WHEN p_state = 'answered' THEN coalesce(answered_at, now())    ELSE answered_at END,
      answered_by     = CASE WHEN p_state = 'answered' THEN coalesce(answered_by, auth.uid()) ELSE answered_by END
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
  IF NOT coalesce(public._fn_session_question_can_host(p_board_id), false) THEN
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
-- only boards this learner actually belongs to. (Induction is the host type with a
-- shared membership join; ai_pulse / meeting boards are reached from their own page with
-- a known board id.)
-- A CLOSED board is still listed, carrying status='closed'. It is how a learner reaches
-- the answer to the question they asked after the host has wrapped the session up;
-- dropping it here is what made the board disappear without a word. The caller renders it
-- read-only from `status` — see session-question-board.tsx.
-- Return signature changed 2026-08-21 (status added), and PostgreSQL cannot CREATE OR
-- REPLACE across a changed RETURNS TABLE — drop first so a re-apply works.
DROP FUNCTION IF EXISTS public.fn_session_question_boards_for_learner();
CREATE OR REPLACE FUNCTION public.fn_session_question_boards_for_learner()
RETURNS TABLE (board_id uuid, host_type text, host_id uuid, title text, day_number integer,
               status text, question_count bigint, my_question_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_learner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_session_question_boards_for_learner: not authenticated'; END IF;
  v_learner := public.get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT b.id, b.host_type, b.host_id, es.title, es.day_number, b.status,
         (SELECT count(*) FROM public.session_question q
           WHERE q.board_id = b.id AND q.state IN ('visible','answered')),
         (SELECT count(*) FROM public.session_question q
           WHERE q.board_id = b.id AND q.learner_id = v_learner)
  FROM public.session_question_board b
  JOIN public.event_sessions es ON es.id = b.host_id
  JOIN public.induction_enrollment ie
    ON ie.event_id = es.event_id AND ie.learner_id = v_learner
  WHERE b.host_type = 'induction'
    AND (es.batch_id IS NULL OR es.batch_id = ie.batch_id)
    -- the same membership rule the room uses, asserted here rather than left to the join
    AND public._fn_session_question_can_read(b.id, v_learner)
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
  -- can_ask is about WRITING, and it goes false the moment the host closes the board.
  -- The gate below must NOT be that question, or closing a board deletes it from every
  -- learner's screen — including the answers to the questions they asked, which is the
  -- one thing this feature is measured on. Read access is audience membership, which a
  -- close does not revoke.
  v_can_ask := coalesce(public._fn_session_question_can_participate(p_board_id, v_learner), false);
  -- the gate calls the host predicate HERE, in the IF itself: a predicate that is only
  -- assigned to a variable authorises nobody, it just records an answer.
  IF NOT (coalesce(public._fn_session_question_can_read(p_board_id, v_learner), false)
          OR coalesce(public._fn_session_question_can_host(p_board_id), false)) THEN
    RAISE EXCEPTION 'fn_session_question_room: not allowed'; END IF;
  v_is_host := coalesce(public._fn_session_question_can_host(p_board_id), false);

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
--   D6 the auto-check FAILS OPEN — genuinely, which needs two mechanisms, not one:
--      (a) lock_timeout, set transaction-locally right before the check. An unreachable
--          checker in practice means its term list is lock-held (an admin curating it, a
--          stalled ALTER), and lock_timeout is armed per lock acquisition, so it raises
--          lock_not_available (55P03) in milliseconds — an ORDINARY, catchable error.
--      (b) an explicit `WHEN query_canceled` handler. This is the one that matters:
--          statement_timeout raises 57014, and PL/pgSQL's `WHEN OTHERS` DOES NOT MATCH
--          57014 (it is excluded by the language, along with assert_failure). The
--          previous version relied on `WHEN OTHERS` alone, so the exact failure it named
--          — a checker that runs out of time — sailed straight through it and aborted the
--          whole call. Verified: with the term list locked and a 1s budget, the learner's
--          question was LOST, not shown. Naming query_canceled is what makes the handler
--          able to fire at all.
--      Either way the question is inserted state='visible' and marked in
--      moderation_note as posted-unchecked, so the host can review what the checker never
--      saw. A board that goes blank mid-session is never trusted again, so a checker
--      fault must never swallow a learner's question.
--      What is still NOT survivable, honestly: the whole RPC being killed (the caller's
--      statement budget expiring across the entire call, or the connection dropping). At
--      that point no line of this function runs, the client gets an error, and the UI
--      renders it — a told failure the learner can retry, not a silent loss.
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
  v_verdict jsonb; v_prev_lock_timeout text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please sign in to ask a question.'); END IF;
  v_learner := public.get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only learners can post to the question board.'); END IF;
  IF NOT coalesce(public._fn_session_question_can_participate(p_board_id, v_learner), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This question board is closed, or it is not open to you.'); END IF;

  v_body := btrim(coalesce(p_body, ''));
  IF length(v_body) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please type your question first.'); END IF;
  IF length(v_body) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Please keep your question under 500 characters.'); END IF;

  v_prev_lock_timeout := current_setting('lock_timeout', true);
  BEGIN
    -- Unlike statement_timeout — which PostgreSQL arms when the TOP-LEVEL statement
    -- begins, so setting it here cannot re-arm it — lock_timeout is evaluated at each
    -- lock acquisition. Setting it here really does bound the check, and it turns the
    -- realistic "checker unavailable" case (its term list is lock-held) into
    -- lock_not_available, which an exception handler can actually catch.
    PERFORM set_config('lock_timeout', '250ms', true);
    v_verdict := public.fn_session_question_moderation_verdict(v_body);
    IF coalesce((v_verdict->>'blocked')::boolean, false) THEN
      v_state := 'blocked';
      v_note  := v_verdict->>'note';
    END IF;
  EXCEPTION
    WHEN query_canceled THEN
      -- 57014. Named EXPLICITLY because `WHEN OTHERS` does not match it — that omission
      -- is what silently discarded a learner's question when the checker ran long.
      -- Narrow cost of naming it: a DBA cancelling this backend during the few
      -- milliseconds inside the check is absorbed here instead of ending the call.
      v_state := 'visible';
      v_note  := 'auto-check did not finish in time — posted unchecked';
    WHEN OTHERS THEN
      -- lock_not_available, a missing or broken checker, an unreadable term list.
      v_state := 'visible';
      v_note  := 'auto-check unavailable — posted unchecked';
  END;
  PERFORM set_config('lock_timeout', coalesce(nullif(v_prev_lock_timeout, ''), '0'), true);

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
  IF NOT coalesce(public._fn_session_question_can_participate(v_board, v_learner), false) THEN
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
-- Return signature changed 2026-08-21 (ever-answered split out), and PostgreSQL cannot
-- CREATE OR REPLACE across a changed RETURNS TABLE — drop first so a re-apply works.
DROP FUNCTION IF EXISTS public.fn_session_question_answered_scoreboard(timestamptz);
CREATE OR REPLACE FUNCTION public.fn_session_question_answered_scoreboard(
  p_since timestamptz DEFAULT (now() - interval '30 days'))
RETURNS TABLE (board_id uuid, host_type text, host_id uuid, institution_id uuid,
               questions_asked bigint, questions_ever_answered bigint,
               questions_currently_answered bigint, first_answered_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_session_question_answered_scoreboard: not authenticated'; END IF;
  RETURN QUERY
  SELECT b.id, b.host_type, b.host_id, b.institution_id,
         count(q.id),
         -- EVER answered, not currently answered — see the sticky note on
         -- fn_session_question_set_state. A question answered then dismissed still
         -- counts toward D4, because it genuinely was answered.
         count(q.id) FILTER (WHERE q.answered_at IS NOT NULL),
         count(q.id) FILTER (WHERE q.state = 'answered'),
         min(q.answered_at) FILTER (WHERE q.answered_at IS NOT NULL)
  FROM public.session_question_board b
  JOIN public.session_question q ON q.board_id = b.id
  WHERE q.created_at >= p_since
    AND (public.is_super_admin() OR public.is_admin()
         OR coalesce(public.role_has_institution_access(b.institution_id), false))
  GROUP BY b.id, b.host_type, b.host_id, b.institution_id
  HAVING count(q.id) FILTER (WHERE q.answered_at IS NOT NULL) > 0
  ORDER BY min(q.answered_at) FILTER (WHERE q.answered_at IS NOT NULL) DESC;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.fn_session_question_answered_scoreboard(timestamptz) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_answered_scoreboard(timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
