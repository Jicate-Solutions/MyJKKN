-- ============================================================================
-- 20260703003800_scf_confirmation_rollup.sql
-- SCF "show the split" — admin-scoped aggregate of post-class-feedback
-- attendance confirmation. VISIBILITY-ONLY: read-only over student_attendance +
-- session_feedback; does NOT touch attendance_data, the official attendance %,
-- or any eligibility. Powers 2 dashboard cards (Feedback-Confirmed /
-- Present-Pending) gated in the UI on session_feedback.gate_mode != 'off'.
--
-- Semantics mirror fn_scf_confirmation_status EXACTLY (same "confirmed" meaning
-- everywhere): a Present mark is CONFIRMED iff a session_feedback row exists for
-- (student_id, attendance_date, period_id). student_id in the blob and in
-- session_feedback = learners_profiles.id.
--
-- Access mirrors the student_attendance dashboard SELECT RLS policy
-- (student_attendance_select_dashboard_institution_access) so the aggregate
-- shows exactly the rows the caller could already see:
--   is_super_admin() OR is_admin()
--   OR (user_has_permission('academic.attendance.dashboard.view')
--       AND role_has_institution_access(institution_id))
--
-- Two-bucket pending uses a class-end anchor (attendance_date + period end_time,
-- IST wall-clock) vs now() in Asia/Kolkata, split at p_window_hours (default 48,
-- = session_feedback.window_hours policy; the service passes the live value).
-- 2026-07-03.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_scf_confirmation_rollup(
  p_from           date,
  p_to             date,
  p_institution_id uuid    DEFAULT NULL,
  p_program_id     uuid    DEFAULT NULL,
  p_department_id  uuid    DEFAULT NULL,
  p_section_id     uuid    DEFAULT NULL,
  p_window_hours   integer DEFAULT 48
)
RETURNS TABLE (
  total_present   bigint,
  confirmed       bigint,
  pending_within  bigint,
  pending_overdue bigint,
  sessions        bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_confirmation_rollup: not authenticated';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('academic.attendance.dashboard.view')) THEN
    RAISE EXCEPTION 'fn_scf_confirmation_rollup: not authorized';
  END IF;

  RETURN QUERY
  WITH present_marks AS (
    -- DISTINCT: a student listed twice in one period's students[] must not
    -- inflate the counts (one Present mark per learner per session).
    SELECT DISTINCT
      sa.attendance_date,
      sa.timetable_id,
      sa.section_id,
      period.key                         AS period_id,
      (st ->> 'student_id')::uuid        AS student_id,
      -- class-end wall-clock (IST): date + period end_time. Guard the ::time
      -- cast — the blob mixes 24h ("10:00:00") and 12h/meridian ("3:00 PM")
      -- formats (both parse via ::time), so accept both and fall back to
      -- end-of-day only on genuine garbage; one bad value must not fail the
      -- entire rollup.
      (sa.attendance_date
        + CASE
            WHEN (period.value ->> 'end_time') ~*
                 '^\s*[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?\s*(am|pm)?\s*$'
              THEN (period.value ->> 'end_time')::time
            ELSE TIME '23:59:59'
          END
      )                                  AS session_end_local
    FROM public.student_attendance sa
    CROSS JOIN LATERAL jsonb_each(sa.attendance_data)                       AS period
    CROSS JOIN LATERAL jsonb_array_elements(
                         COALESCE(period.value -> 'students', '[]'::jsonb)) AS st
    WHERE sa.attendance_date BETWEEN p_from AND p_to
      AND (st ->> 'status') = 'Present'
      -- Guard the ::uuid cast: skip malformed/empty student_id so a single bad
      -- blob row cannot raise and fail the ENTIRE institution/date rollup.
      AND (st ->> 'student_id') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND (p_institution_id IS NULL OR sa.institution_id = p_institution_id)
      AND (p_program_id     IS NULL OR sa.program_id     = p_program_id)
      AND (p_department_id  IS NULL OR sa.department_id  = p_department_id)
      AND (p_section_id     IS NULL OR sa.section_id     = p_section_id)
      AND (is_super_admin() OR is_admin()
           OR role_has_institution_access(sa.institution_id))
  ),
  scored AS (
    SELECT
      pm.*,
      -- Confirmed = a session_feedback row for this session. period_id (the
      -- attendance_data JSONB key) is NOT globally unique (834/1340 keys are
      -- shared across rows), and 32 (student,date,period_id) tuples are Present
      -- in >1 row — so we ALSO scope on timetable_id to avoid one feedback row
      -- confirming two present marks (over-count). timetable_id is 100%
      -- populated on session_feedback; adding it leaves the current confirmed
      -- count unchanged (1120 = 1120) while hardening against the latent
      -- multi-row case. (Canonical fn_scf_confirmation_status is learner-scoped,
      -- where this collision cannot arise, so it needs only period_id.)
      EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = pm.student_id
          AND f.attendance_date = pm.attendance_date
          AND f.period_id       = pm.period_id
          AND f.timetable_id    = pm.timetable_id
      ) AS is_confirmed
    FROM present_marks pm
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE is_confirmed)::bigint,
    count(*) FILTER (
      WHERE NOT is_confirmed
        AND (now() AT TIME ZONE 'Asia/Kolkata')
            <= session_end_local + make_interval(hours => p_window_hours)
    )::bigint,
    count(*) FILTER (
      WHERE NOT is_confirmed
        AND (now() AT TIME ZONE 'Asia/Kolkata')
            >  session_end_local + make_interval(hours => p_window_hours)
    )::bigint,
    count(DISTINCT (attendance_date, timetable_id, section_id, period_id))::bigint
  FROM scored;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.fn_scf_confirmation_rollup(date,date,uuid,uuid,uuid,uuid,integer)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.fn_scf_confirmation_rollup(date,date,uuid,uuid,uuid,uuid,integer)
  TO authenticated;
