-- 20260917175304_session_question_unanswered_counts.sql
-- ONE batched read of "how many questions are still waiting" for every board on a page.
--
-- WHY THIS EXISTS. Measured on production 2026-09-17: the shared session question board
-- holds 77 learner questions across 13 boards, asked 3–16 September, and NOT ONE has
-- ever been answered — `answered_at` is NULL on all 77 rows, and `state` is 'visible' on
-- all 77. That is not a host ignoring the room. The host trigger in
-- session-question-dialog.tsx is a plain ghost icon with no count, rendered as one icon
-- among five on each session row, byte-identical whether 0 questions are waiting or 32
-- (one real board carries 32). A host is never told anyone asked.
--
-- The fix is a number on that icon, so the host has to be told something is waiting
-- rather than go looking. That needs a count, and the session list renders up to 42 rows
-- on the biggest live induction — one call per row would be 42 round trips to paint a
-- badge. This function answers for the whole page in ONE call.
--
-- WHY AN RPC AND NOT A DIRECT SELECT. session_question_board and session_question both
-- carry RLS whose only direct-access policy is super_admin (20260821111922), by design:
-- all real access is through SECURITY DEFINER RPCs. An ordinary host reading the tables
-- directly gets zero rows. A DEFINER function is the only route.
--
-- WHY AN ARRAY ARGUMENT AND NOT PostgREST `.in()`. PostgREST encodes `.in()` values into
-- the query string, and this repo has a measured cliff at ~680 uuids where the gateway
-- returns 400 and the supabase-js caller silently degrades to an empty lookup
-- (scripts/ci/check-postgrest-in-chunks + its guard workflow). An RPC posts its
-- arguments in the body, so session-id count never becomes URL length.
--
-- WHAT "UNANSWERED" MEANS HERE: state = 'visible' AND answered_at IS NULL.
--   * `state = 'visible'`  excludes blocked and dismissed — a question the host has
--     already dealt with must not keep nagging.
--   * `answered_at IS NULL` and NOT `state <> 'answered'` is the load-bearing half.
--     answered_at is STICKY on purpose (see fn_session_question_set_state's own comment):
--     a host who answers a question and later dismisses it, or puts it back on the board
--     for the room to read, does not erase the fact that it WAS answered. Filtering on
--     `state` alone would resurrect such a question into the waiting count the moment it
--     went back to 'visible', and the host would be nagged to answer something they
--     already answered. The sticky column is what makes "waiting" mean never-answered.
--
-- ANONYMITY. This returns counts and board ids only — no body, no nickname, no
-- learner_id, no name. The room stays anonymous and the list view learns nothing about
-- WHO asked; the real name remains available only inside fn_session_question_host_list,
-- which the host dialog already calls.

-- ─────────────────────────────────────────────────────────────────────────────
-- How many questions are still waiting on each of these sessions' boards?
--
-- Returns a jsonb ARRAY, one element per board the caller may host:
--   { host_id, board_id, status, unanswered_count }
-- Boards with a zero count ARE returned (the caller decides whether to render a
-- badge); a host_id with no board yet is simply absent, because no board means no
-- questions. An id the caller may NOT host is absent too — the per-board authority
-- predicate is part of the WHERE clause, so this cannot become a way to learn that a
-- session you do not run has questions on it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_session_question_unanswered_counts(
  p_host_type text,
  p_host_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_session_question_unanswered_counts: not authenticated';
  END IF;
  IF p_host_type IS NULL OR p_host_type NOT IN ('induction','ai_pulse','meeting') THEN
    RAISE EXCEPTION 'fn_session_question_unanswered_counts: unknown host_type';
  END IF;
  -- An empty page asks nothing. Returning '[]' rather than raising keeps a session list
  -- with no sessions from rendering an error banner over an empty schedule.
  IF p_host_ids IS NULL OR cardinality(p_host_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  -- Sanity bound, not a real limit: the largest live induction has 42 sessions
  -- (measured 2026-09-17). A caller asking for 500+ is a bug or a probe, and should
  -- hear about it rather than get a truncated answer that looks complete.
  IF cardinality(p_host_ids) > 500 THEN
    RAISE EXCEPTION 'fn_session_question_unanswered_counts: too many host ids (max 500)';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'host_id',          b.host_id,
           'board_id',         b.id,
           'status',           b.status,
           'unanswered_count', c.n
         ) ORDER BY c.n DESC), '[]'::jsonb)
  INTO v_rows
  FROM public.session_question_board b
  CROSS JOIN LATERAL (
    -- idx_sq_board_state (board_id, state) covers this; one index scan per board.
    SELECT count(*)::int AS n
    FROM public.session_question q
    WHERE q.board_id    = b.id
      AND q.state       = 'visible'
      AND q.answered_at IS NULL
  ) c
  WHERE b.host_type = p_host_type
    AND b.host_id = ANY (p_host_ids)
    -- Per-board authority, deliberately NOT hoisted to "can this caller manage the
    -- event". A resource person operates only on the sessions they are assigned to
    -- (_fn_induction_can_manage_session_pulse), so an event-level check would hand
    -- them counts for sessions they cannot open. The UNIQUE (host_type, host_id) index
    -- filters first; this runs on the handful of rows that survive.
    AND coalesce(public._fn_session_question_can_host(b.id), false);

  RETURN v_rows;
END $fn$;

COMMENT ON FUNCTION public.fn_session_question_unanswered_counts(text, uuid[]) IS
  'Waiting-question counts for many boards in one call, for the host session list badge. "Waiting" = state=''visible'' AND answered_at IS NULL (answered_at is sticky, so an answered-then-dismissed question never returns to the count). Returns counts only — never a body, nickname or learner identity. Per-board authority via _fn_session_question_can_host.';

REVOKE EXECUTE ON FUNCTION public.fn_session_question_unanswered_counts(text, uuid[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_session_question_unanswered_counts(text, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
