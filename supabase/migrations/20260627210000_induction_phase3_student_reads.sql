-- ============================================================================
-- Induction Phase 3 — student-facing read RPCs (the fresher's "my induction").
-- Added: 2026-06-27
--
-- The student page /learners/my-induction needs two reads that the existing
-- coordinator RPCs don't provide:
--   1. fn_induction_my_enrollments() — "which induction(s) am I in?" (entry
--      point) + my completion rollup + my profile-completion snapshot (drives
--      the Day-10 "finish your profile" nudge). One round-trip = everything the
--      header + nudge need.
--   2. fn_induction_my_feedback(event_id) — my OWN prior per-session ratings, so
--      the rating widget shows "you rated this 4/5" and pre-fills.
--
-- Reads stay on the gated DEFINER-RPC perimeter (module convention: "all
-- reads/writes go through gated DEFINER RPCs via InductionService"), NOT raw
-- table queries. Session schedule reuses the EXISTING fn_induction_list_sessions
-- (already student-batch-filtered); submit reuses fn_induction_submit_feedback.
--
-- Security (CLAUDE.md): STABLE SECURITY DEFINER SET search_path=public +
-- explicit REVOKE EXECUTE FROM anon, PUBLIC (Supabase default-grants anon
-- EXECUTE on every new function) + GRANT TO authenticated. RETURNS TABLE with
-- every projected column cast to its declared type (the secdef-returns-table
-- discipline — verify under an AUTHENTICATED render, not a mgmt-API select).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fn_induction_my_enrollments — the calling learner's induction(s).
--    Empty (not an error) when the caller is not a learner or has no enrollment
--    → the page renders a graceful empty state. Profile-completion mirrors
--    calculateProfileCompleteness() in lib/services/learner-profile-service.ts
--    (4 required fields: college_email, academic_year_id, semester_id,
--    section_id); kept in SQL so the nudge % is server-computed in one call.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_enrollments()
RETURNS TABLE (
  event_id               UUID,
  event_name             TEXT,
  institution_id         UUID,
  institution_name       TEXT,
  start_date             DATE,
  end_date               DATE,
  status                 TEXT,
  batch_id               UUID,
  batch_label            TEXT,
  sessions_total         INTEGER,
  sessions_attended      INTEGER,
  attendance_pct         NUMERIC,
  participation_complete BOOLEAN,
  value_score_avg        NUMERIC,
  is_profile_complete    BOOLEAN,
  profile_fields_total   INTEGER,
  profile_fields_filled  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_enrollments: not authenticated';
  END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN;  -- not a learner → empty set (graceful, not an error)
  END IF;

  RETURN QUERY
  SELECT
    e.id::uuid,
    e.name::text,
    e.institution_id::uuid,
    i.name::text,
    e.start_date::date,
    e.end_date::date,
    e.status::text,
    ie.batch_id::uuid,
    b.label::text,
    COALESCE(c.sessions_total, 0)::integer,
    COALESCE(c.sessions_attended, 0)::integer,
    COALESCE(c.attendance_pct, 0)::numeric,
    COALESCE(c.participation_complete, false)::boolean,
    c.value_score_avg::numeric,
    COALESCE(lp.is_profile_complete, false)::boolean,
    4::integer,
    (
      (lp.college_email   IS NOT NULL AND btrim(lp.college_email) <> '')::int +
      (lp.academic_year_id IS NOT NULL)::int +
      (lp.semester_id      IS NOT NULL)::int +
      (lp.section_id       IS NOT NULL)::int
    )::integer
  FROM public.induction_enrollment ie
  JOIN public.events             e  ON e.id = ie.event_id
  JOIN public.institutions       i  ON i.id = e.institution_id
  LEFT JOIN public.induction_batches    b ON b.id = ie.batch_id
  LEFT JOIN public.induction_completion c ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
  LEFT JOIN public.learners_profiles    lp ON lp.id = ie.learner_id
  WHERE ie.learner_id = v_learner
  ORDER BY e.start_date DESC NULLS LAST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_enrollments() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_enrollments() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. fn_induction_my_feedback — the caller's own prior ratings for an event's
--    sessions (so the rating widget pre-fills + shows "already rated").
--    event_session_feedback carries event_id directly → no join needed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_feedback(p_event_id UUID)
RETURNS TABLE (
  session_id UUID,
  rating     INTEGER,
  comment    TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_feedback: not authenticated';
  END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT f.session_id::uuid, f.rating::integer, f.comment::text
  FROM public.event_session_feedback f
  WHERE f.event_id = p_event_id
    AND f.learner_id = v_learner;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_feedback(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_feedback(UUID) TO authenticated;
