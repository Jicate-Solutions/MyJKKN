-- ============================================================================
-- Fresher Induction — Resource-person self-view of their session's feedback
-- File: 20260629140000_induction_my_session_feedback.sql | Date: 2026-06-29
-- Spec: B(a) of the session-effectiveness program (continuation 2026-06-29).
--
-- WHAT: let a CREDITED resource person (event_session_speakers.profile_id = me)
-- see THEIR OWN session's per-session feedback (avg + count + comments) WITHOUT
-- granting induction.view. The existing coordinator summary
-- (fn_induction_session_feedback_summary, phase 2b) requires
-- induction.view + institution access — a plain resource person (staff or a
-- senior-student presenter) has neither. This adds two speakership-gated DEFINER
-- readers, the per-actor lane of the feedback signal:
--   1. fn_induction_my_sessions_feedback()      — sessions I led + avg + count
--   2. fn_induction_my_session_comments(uuid)   — anonymized comments for ONE of
--                                                 my sessions
--
-- ACCESS PRIMITIVE: "are you a credited speaker on this session?" — NOT a role,
-- NOT induction.view. This reuses the exact self-scope already in the
-- event_session_speakers RLS (profile_id = auth.uid()), so it grants no wider
-- visibility than "the sessions I personally led."
--
-- ANONYMITY: a k>=3 floor (matches scf_live_pulse decision #2 and the loop's
-- >=3-responses rule). avg_rating + comments are SUPPRESSED below 3 responses so
-- a fresher who rated a staff member can't be de-anonymised by a 1–2 response
-- reveal. response_count is always returned (a count exposes neither who nor what).
--
-- No admin bypass here by design: super/admin/coordinators read the program-wide
-- picture via fn_induction_session_feedback_summary; these two fns are purely the
-- resource person's OWN-sessions lane (an admin calling them sees only the
-- sessions they personally presented).
-- ============================================================================

-- ── 1. Sessions I led, each with its feedback summary (k>=3 floor) ───────────
CREATE OR REPLACE FUNCTION public.fn_induction_my_sessions_feedback()
RETURNS TABLE (
  session_id      uuid,
  event_id        uuid,
  event_name      text,
  title           text,
  day_number      integer,
  start_at        timestamptz,
  venue_text      text,
  response_count  integer,
  avg_rating      numeric,    -- NULL when suppressed (< k responses)
  suppressed      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_k constant int := 3;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_sessions_feedback: not authenticated';
  END IF;

  RETURN QUERY
  WITH my_sessions AS (
    -- only sessions where I am a credited resource person
    SELECT es.id, es.event_id, es.title, es.day_number, es.start_at, es.venue_text
    FROM public.event_session_speakers sp
    JOIN public.event_sessions es ON es.id = sp.session_id
    WHERE sp.profile_id = auth.uid()
  ),
  fb AS (
    SELECT f.session_id, count(*)::int AS n, round(avg(f.rating), 2) AS avg_r
    FROM public.event_session_feedback f
    WHERE f.session_id IN (SELECT id FROM my_sessions)
    GROUP BY f.session_id
  )
  SELECT ms.id, ms.event_id, ev.name, ms.title, ms.day_number, ms.start_at, ms.venue_text,
         COALESCE(fb.n, 0)::int                                          AS response_count,
         CASE WHEN COALESCE(fb.n, 0) >= v_k THEN fb.avg_r ELSE NULL END  AS avg_rating,
         (COALESCE(fb.n, 0) < v_k)                                       AS suppressed
  FROM my_sessions ms
  JOIN public.events ev ON ev.id = ms.event_id
  LEFT JOIN fb ON fb.session_id = ms.id
  ORDER BY ms.start_at DESC NULLS LAST;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_sessions_feedback() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_sessions_feedback() TO authenticated;

COMMENT ON FUNCTION public.fn_induction_my_sessions_feedback() IS
  'Resource-person self-view: the sessions the caller is a CREDITED speaker on (event_session_speakers.profile_id = auth.uid()) with each session''s feedback avg + count. k>=3 anonymity floor (avg NULL + suppressed=true below 3 responses). No induction.view required. authenticated only.';

-- ── 2. Anonymized comments for ONE of my sessions (k>=3 floor) ───────────────
CREATE OR REPLACE FUNCTION public.fn_induction_my_session_comments(p_session_id uuid)
RETURNS TABLE (
  rating      integer,
  comment     text,
  created_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_k constant int := 3; v_is_speaker boolean; v_n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_session_comments: not authenticated';
  END IF;

  -- speakership gate: only a credited resource person of THIS session. No
  -- induction.view required; admins read the program-wide picture elsewhere.
  SELECT EXISTS (
    SELECT 1 FROM public.event_session_speakers sp
    WHERE sp.session_id = p_session_id AND sp.profile_id = auth.uid()
  ) INTO v_is_speaker;
  IF NOT v_is_speaker THEN
    RAISE EXCEPTION 'fn_induction_my_session_comments: not a credited resource person of this session';
  END IF;

  -- k>=3 anonymity floor: no comments until >=3 responses (protects the fresher).
  SELECT count(*)::int INTO v_n
  FROM public.event_session_feedback f WHERE f.session_id = p_session_id;
  IF v_n < v_k THEN
    RETURN;  -- suppressed; the caller renders "need >=3 responses to show comments"
  END IF;

  RETURN QUERY
  SELECT f.rating, f.comment, f.created_at
  FROM public.event_session_feedback f
  WHERE f.session_id = p_session_id
    AND f.comment IS NOT NULL
    AND btrim(f.comment) <> ''
  ORDER BY f.created_at DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_session_comments(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_session_comments(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_induction_my_session_comments(uuid) IS
  'Resource-person self-view of one of THEIR sessions'' anonymized comments (rating + comment text only, no learner identity). Speakership-gated (must be a credited speaker on p_session_id); k>=3 anonymity floor (returns no rows below 3 responses). authenticated only.';

NOTIFY pgrst, 'reload schema';
