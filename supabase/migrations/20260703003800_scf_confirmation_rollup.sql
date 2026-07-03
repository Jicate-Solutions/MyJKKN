-- ============================================================================
-- 20260703003800_scf_confirmation_rollup.sql
-- SCF "show the split" — admin-scoped aggregate of post-class-feedback
-- attendance confirmation. VISIBILITY-ONLY: read-only over student_attendance +
-- session_feedback; does NOT touch attendance_data, the official attendance %,
-- or any eligibility. Powers dashboard cards (Feedback-Confirmed /
-- Present-Pending / Overdue) gated in the UI on session_feedback.gate_mode.
--
-- Semantics mirror fn_scf_confirmation_status EXACTLY (same "confirmed" meaning
-- everywhere): a Present mark is CONFIRMED iff a session_feedback row exists for
-- (student_id, attendance_date, period_id). student_id in the blob and in
-- session_feedback = learners_profiles.id. period-only match is deliberate — a
-- feedback row's timetable_id can legitimately differ for a rescheduled class,
-- so scoping the join on timetable_id would UNDERCOUNT genuine confirmations.
-- Verified equal to a timetable-scoped join on current prod data.
--
-- Access mirrors the student_attendance dashboard SELECT RLS policy
-- (student_attendance_select_dashboard_institution_access) so the aggregate
-- shows exactly the rows the caller could already see.
--
-- Two-bucket pending uses a class-end anchor (attendance_date + period end_time,
-- IST wall-clock) vs now() in Asia/Kolkata, split at p_window_hours (default 48,
-- = session_feedback.window_hours; the service passes the live value).
-- statement_timeout bounds a wide-range scan. 2026-07-03 (rev: deep-review r4).
-- ============================================================================

-- Safe text→time parse: returns p_default on ANY parse failure. A regex guard
-- can't guarantee ::time succeeds (e.g. '25:00', '13:00 PM' pass a loose regex
-- but throw on cast, failing the whole rollup), so we use an exception block.
-- IMMUTABLE: time parsing does not depend on session settings.
CREATE OR REPLACE FUNCTION public.fn_scf_safe_time(p_text text, p_default time)
RETURNS time
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  -- NULL/empty must return the default, NOT NULL: NULL::time raises no exception
  -- but yields NULL, which would make session_end_local NULL and drop the row
  -- from BOTH the within and overdue buckets (breaking confirmed+within+overdue
  -- = total_present).
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN p_default;
  END IF;
  RETURN p_text::time;
EXCEPTION WHEN others THEN
  RETURN p_default;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_scf_safe_time(text, time) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_safe_time(text, time) TO authenticated;

-- DROP first: the return type changed (dropped the unused `sessions` column),
-- which CREATE OR REPLACE cannot do. Safe — the function is not yet deployed.
DROP FUNCTION IF EXISTS
  public.fn_scf_confirmation_rollup(date,date,uuid,uuid,uuid,uuid,integer);

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
  pending_overdue bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '20s'
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
    -- One row per (learner, date, period). A learner marked Present in two
    -- student_attendance rows for the same period/day (32 such tuples exist in
    -- prod — substitute / re-provisioned classes) is ONE attendance, not two,
    -- so DISTINCT ON the learner-session identity keeps a single row (earliest
    -- class-end — the most conservative anchor for the overdue bucket) and
    -- avoids inflating total_present / the confirmedPct denominator.
    SELECT DISTINCT ON (sa.attendance_date, period.key, (st ->> 'student_id'))
      sa.attendance_date,
      period.key                  AS period_id,
      (st ->> 'student_id')::uuid AS student_id,
      -- class-end wall-clock (IST): date + period end_time. The blob mixes 24h
      -- ("10:00:00") and 12h/meridian ("3:00 PM") formats (both parse via
      -- ::time); fn_scf_safe_time returns end-of-day on any unparseable value so
      -- one bad row can never fail the whole rollup.
      (sa.attendance_date
        + fn_scf_safe_time(period.value ->> 'end_time', TIME '23:59:59')
      )                           AS session_end_local
    FROM public.student_attendance sa
    -- jsonb_typeof guard on the OUTER expansion too: a row whose attendance_data
    -- is a JSON array/scalar/null would make jsonb_each abort the whole rollup.
    CROSS JOIN LATERAL jsonb_each(
                         CASE WHEN jsonb_typeof(sa.attendance_data) = 'object'
                              THEN sa.attendance_data
                              ELSE '{}'::jsonb END)                          AS period
    -- jsonb_typeof guard, not COALESCE: a JSON-null / scalar / object 'students'
    -- (JSON null ≠ SQL NULL, so COALESCE won't catch it) would make
    -- jsonb_array_elements raise and abort the WHOLE rollup. Non-array → treat
    -- as no students.
    CROSS JOIN LATERAL jsonb_array_elements(
                         CASE WHEN jsonb_typeof(period.value -> 'students') = 'array'
                              THEN period.value -> 'students'
                              ELSE '[]'::jsonb END) AS st
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
      -- Data scope: super_admin sees all; everyone else is bounded by
      -- role_has_institution_access, which ALREADY grants scope='all' roles
      -- every institution and scope='own' roles only their own + granted.
      -- is_admin() is deliberately NOT here: it is a hardcoded role-NAME bypass
      -- that ignores institution_scope, so a scope='own' admin could read other
      -- institutions' aggregates through this DEFINER RPC (verified leak: a
      -- role='admin' with role_has_institution_access(foreign)=false read 1,979
      -- foreign present marks). The student_attendance dashboard RLS carries the
      -- same is_admin() branch — a pre-existing over-grant we intentionally do
      -- NOT propagate here.
      AND (is_super_admin()
           OR role_has_institution_access(sa.institution_id))
    ORDER BY sa.attendance_date, period.key, (st ->> 'student_id'),
             session_end_local ASC
  ),
  scored AS (
    SELECT
      pm.*,
      -- Confirmed = a session_feedback row for (student_id, attendance_date,
      -- period_id) — period-only, matching canonical fn_scf_confirmation_status
      -- exactly. NOT scoped on timetable_id: a feedback row's timetable_id can
      -- legitimately differ (rescheduled/substitute class), which would
      -- UNDERCOUNT confirmations. Verified equal to a timetable-scoped join on
      -- current prod data (1120 = 1120), and DISTINCT ON above already prevents
      -- one feedback row confirming two present marks.
      EXISTS (
        SELECT 1 FROM public.session_feedback f
        WHERE f.student_id      = pm.student_id
          AND f.attendance_date = pm.attendance_date
          AND f.period_id       = pm.period_id
      ) AS is_confirmed
    FROM present_marks pm
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE is_confirmed)::bigint,
    count(*) FILTER (
      WHERE NOT is_confirmed
        AND (now() AT TIME ZONE 'Asia/Kolkata')
            <= session_end_local + make_interval(hours => GREATEST(p_window_hours, 1))
    )::bigint,
    count(*) FILTER (
      WHERE NOT is_confirmed
        AND (now() AT TIME ZONE 'Asia/Kolkata')
            >  session_end_local + make_interval(hours => GREATEST(p_window_hours, 1))
    )::bigint
  FROM scored;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.fn_scf_confirmation_rollup(date,date,uuid,uuid,uuid,uuid,integer)
  FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.fn_scf_confirmation_rollup(date,date,uuid,uuid,uuid,uuid,integer)
  TO authenticated;
