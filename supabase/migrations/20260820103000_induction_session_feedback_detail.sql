-- ============================================================================
-- Fresher Induction — per-learner, per-session feedback detail (+ export source)
-- File: 20260820103000_induction_session_feedback_detail.sql | Date: 2026-08-20
--
-- WHY
--   The induction detail page could show per-session feedback AVERAGES
--   (fn_induction_session_feedback_summary) and one session's raw rows keyed by
--   learner_id only (fn_induction_session_feedback_roster, built to pre-fill the
--   volunteer kiosk dialog). Neither answers the coordinator's actual question:
--   "who said what, and what did they write?" — nor can either drive an export,
--   because the roster RPC returns no learner identity at all.
--
--   This adds the flat (learner × session) row source, shaped like
--   fn_induction_session_poll_export so the XLSX builder can mirror the poll one.
--
-- SCOPE NOTE (deliberate, do not widen casually)
--   The gate here is NARROWER than fn_induction_session_feedback_summary, which
--   also admits fn_induction_is_event_speaker. That RPC returns per-session
--   averages; this one returns named learners with college email and mobile. A
--   resource person assigned to one session must not be able to pull the whole
--   cohort's contact list out of a feedback screen. Coordinator scope only.
--
--   Induction session feedback is NOT anonymous by design — event_session_feedback
--   is uniquely keyed (session_id, learner_id) and the volunteer kiosk flow
--   (fn_induction_submit_feedback_proxy) records feedback ON BEHALF of a named
--   fresher. Exposing the author to a coordinator changes no promise made to the
--   learner; capture_method / is_self distinguish self-entered from proxy rows.
--
-- SECURITY (CLAUDE.md): STABLE SECURITY DEFINER, SET search_path = public, every
--   RETURNS TABLE column explicitly cast, REVOKE FROM anon/PUBLIC + GRANT TO
--   authenticated. Joins to the learner/session dimension are LEFT joins on
--   purpose: an INNER join would silently swallow a response whose learner or
--   session row was later deleted, and a vanished response is worse than an
--   unlabelled one.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_session_feedback_detail(
  p_event_id   UUID,
  p_session_id UUID DEFAULT NULL   -- NULL = every session in the induction
)
RETURNS TABLE (
  feedback_id       UUID,
  session_id        UUID,
  session_title     TEXT,
  day_number        INTEGER,
  session_start     TIMESTAMPTZ,
  learner_id        UUID,
  register_number   TEXT,
  roll_number       TEXT,
  learner_name      TEXT,
  gender            TEXT,
  student_email     TEXT,
  college_email     TEXT,
  student_mobile    TEXT,
  institution_name  TEXT,
  degree_name       TEXT,
  program_name      TEXT,
  department_name   TEXT,
  rating            INTEGER,
  comment           TEXT,
  capture_method    TEXT,
  is_self           BOOLEAN,
  submitted_by_name TEXT,
  submitted_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_feedback_detail: not authenticated';
  END IF;

  SELECT ip.institution_id INTO v_inst
  FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_session_feedback_detail: not an induction event';
  END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'fn_induction_session_feedback_detail: not authorized';
  END IF;

  RETURN QUERY
  SELECT
    f.id::uuid,
    f.session_id::uuid,
    s.title::text,
    s.day_number::integer,
    s.start_at::timestamptz,
    f.learner_id::uuid,
    lp.register_number::text,
    lp.roll_number::text,
    NULLIF(btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')), '')::text,
    lp.gender::text,
    lp.student_email::text,
    lp.college_email::text,
    lp.student_mobile::text,
    i.name::text,
    d.degree_name::text,
    pr.program_name::text,
    dep.department_name::text,
    f.rating::integer,
    f.comment::text,
    f.capture_method::text,
    (f.submitted_by IS NULL)::boolean,
    sb.full_name::text,
    f.created_at::timestamptz,
    f.updated_at::timestamptz
  FROM public.event_session_feedback f
  LEFT JOIN public.event_sessions    s   ON s.id   = f.session_id
  LEFT JOIN public.learners_profiles lp  ON lp.id  = f.learner_id
  LEFT JOIN public.institutions      i   ON i.id   = lp.institution_id
  LEFT JOIN public.degrees           d   ON d.id   = lp.degree_id
  LEFT JOIN public.programs          pr  ON pr.id  = lp.program_id
  LEFT JOIN public.departments       dep ON dep.id = lp.department_id
  LEFT JOIN public.profiles          sb  ON sb.id  = f.submitted_by
  WHERE f.event_id = p_event_id
    AND (p_session_id IS NULL OR f.session_id = p_session_id)
  -- Freshers frequently have no register/roll number yet (they are assigned after
  -- admission closes), so name is a real tiebreaker here, not decoration.
  ORDER BY s.day_number NULLS LAST, s.session_order NULLS LAST, s.start_at NULLS LAST,
           lp.register_number NULLS LAST, lp.roll_number NULLS LAST,
           lp.first_name NULLS LAST, lp.last_name NULLS LAST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_session_feedback_detail(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_session_feedback_detail(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_induction_session_feedback_detail(UUID, UUID) IS
  'Flat (learner x session) induction feedback rows with full learner identity — powers the '
  '"Session feedback" browser and its XLSX export. Coordinator scope only (narrower than '
  'fn_induction_session_feedback_summary, which admits session speakers to the averages).';
