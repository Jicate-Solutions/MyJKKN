-- ============================================================================
-- Attendance Dashboard > "Current Intake Readiness"
--
-- WHY THIS EXISTS
-- ---------------
-- The dashboard's Pending Attendance surface derives its rows from SCHEDULED
-- PERIODS: AttendanceDashboardService.getPendingAttendance() opens with
-- `.from('timetables')`. A section with NO timetable therefore produces no
-- expected periods, therefore no pending rows -- and so renders as perfectly
-- healthy on the very screen meant to catch unmarked attendance.
--
-- That blind spot is live. On 2026-07-28 one college placed 164 current-intake
-- learners into 10 sections that hold ZERO timetable rows. Every one of those
-- learners is invisible to the pending surface.
--
-- This function inverts the starting point. It begins at SECTIONS THAT HOLD
-- CURRENT-INTAKE LEARNERS and asks whether attendance is even possible there,
-- so a section can never disappear by having nothing scheduled.
--
-- CLASSIFICATION (readiness_status)
--   'blocked'     -- the section holds current-intake learners but has NO
--                    timetable row at all. Attendance cannot be marked. The
--                    learner_count is the size of the exposure.
--   'not_started' -- a timetable exists, but no attendance has been recorded in
--                    the trailing window (p_window_days, default 21).
--   'ok'          -- attendance was recorded within the window.
--
-- DEFINITIONS (verified against production, 2026-07-30)
--   "Current intake" = learners_profiles.admission_year_id resolving to an
--   admission_years row with is_current = true, and lifecycle_status = 'active'.
--   is_current is one-per-institution, so the IN-set below means "each learner's
--   own college's newest batch" and the all-colleges view stays correct without a
--   per-row institution correlation. Chosen over a semester-based rule because
--   semester data is not reliably advanced as learners progress.
--
--   "Marked" = a student_attendance row whose scalar section_id matches, OR whose
--   section_ids ARRAY contains the section. BOTH columns are populated in
--   production and they are NOT redundant: 856 rows carry section_ids naming a
--   section the scalar column does not. Checking only the scalar column would
--   silently misclassify every combined-section sitting as never-marked.
--
-- WHY 'blocked' keys on ANY timetable row rather than an ACTIVE one: an inactive
-- timetable is a different operational problem (a schedule that exists but was
-- switched off) from no schedule at all, and the two need different fixes. The
-- row still reports active_timetable_count so the UI can flag "timetable exists
-- but none is active" without collapsing it into the blocked bucket.
--
-- Read-only. Creates no table and touches no existing object, so it cannot
-- regress any current dashboard surface.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_attendance_fresher_readiness(
  p_window_days integer DEFAULT 21,
  p_institution_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  institution_id uuid,
  institution_name text,
  department_id uuid,
  department_name text,
  semester_id uuid,
  semester_name text,
  section_id uuid,
  section_name text,
  learner_count bigint,
  timetable_count bigint,
  active_timetable_count bigint,
  last_marked_date date,
  readiness_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20s'
AS $function$
DECLARE
  -- Clamp the caller-supplied window. A NULL, zero or absurd value would
  -- otherwise turn the trailing-window predicate into nonsense (or scan the
  -- whole table), and this parameter is reachable from the browser.
  v_window integer := GREATEST(1, LEAST(365, COALESCE(p_window_days, 21)));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_attendance_fresher_readiness: not authenticated';
  END IF;

  -- COALESCE every guard leg to false. A profile-less caller makes these helpers
  -- return NULL, and `NOT NULL` is NULL -- which is not TRUE, so an uncoalesced
  -- `IF NOT (...)` silently FALLS THROUGH instead of raising. Documented incident
  -- in this repo; do not remove the COALESCE.
  IF NOT (COALESCE(is_super_admin(), false)
          OR COALESCE(is_admin(), false)
          OR COALESCE(user_has_permission('academic.attendance.dashboard.view'), false))
  THEN
    RAISE EXCEPTION 'fn_attendance_fresher_readiness: not authorized';
  END IF;

  RETURN QUERY
  WITH accessible AS (
    -- Institution scoping via the platform helper, never a hardcoded role name.
    -- A scope='own' caller reads only its own institution even if it passes
    -- another institution's id in p_institution_id.
    SELECT i.id
    FROM public.institutions i
    WHERE COALESCE(is_super_admin(), false) OR role_has_institution_access(i.id)
  ),
  fresher AS (
    -- THE INVERSION: the row set starts here, at learners, not at timetables.
    -- Grouped by (institution, section) so the section is the unit of the check.
    -- A section whose learners span several departments still yields ONE row --
    -- grouping by department too would double-count the section itself.
    SELECT lp.institution_id AS inst_id,
           lp.section_id     AS sec_id,
           count(*)::bigint  AS learner_count
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = 'active'
      AND lp.section_id IS NOT NULL
      AND lp.institution_id IN (SELECT a.id FROM accessible a)
      AND lp.admission_year_id IN (
            SELECT ay.id FROM public.admission_years ay WHERE ay.is_current = true)
      AND (p_institution_id IS NULL OR lp.institution_id = p_institution_id)
      -- Department narrowing keys on the LEARNER's department, so this reads as
      -- "sections holding at least one current-intake learner of this department".
      AND (p_department_id IS NULL OR lp.department_id = p_department_id)
    GROUP BY 1, 2
  ),
  tt AS (
    SELECT t.section_id AS sec_id,
           count(*)::bigint                            AS timetable_count,
           count(*) FILTER (WHERE t.is_active)::bigint AS active_timetable_count
    FROM public.timetables t
    WHERE t.section_id IN (SELECT f.sec_id FROM fresher f)
    GROUP BY 1
  ),
  marked AS (
    -- Both shapes. `= ANY(section_ids)` covers combined-section sittings whose
    -- scalar section_id names a different section (856 such rows in production).
    SELECT f.sec_id, max(sa.attendance_date) AS last_marked_date
    FROM fresher f
    JOIN public.student_attendance sa
      ON (sa.section_id = f.sec_id OR f.sec_id = ANY(sa.section_ids))
    WHERE sa.attendance_date >= current_date - v_window
    GROUP BY 1
  )
  SELECT
    f.inst_id,
    COALESCE(i.name, 'Unknown Institution')::text,
    sc.department_id,
    COALESCE(d.department_name, 'Unassigned Department')::text,
    sc.semester_id,
    COALESCE(sm.semester_name, 'Unassigned Semester')::text,
    f.sec_id,
    COALESCE(sc.section_name, 'Unknown Section')::text,
    f.learner_count,
    COALESCE(t.timetable_count, 0),
    COALESCE(t.active_timetable_count, 0),
    m.last_marked_date,
    CASE
      WHEN COALESCE(t.timetable_count, 0) = 0 THEN 'blocked'
      WHEN m.last_marked_date IS NULL         THEN 'not_started'
      ELSE 'ok'
    END::text
  FROM fresher f
  LEFT JOIN tt      t  ON t.sec_id = f.sec_id
  LEFT JOIN marked  m  ON m.sec_id = f.sec_id
  LEFT JOIN public.institutions i  ON i.id  = f.inst_id
  -- Department/semester labels come from the SECTION's own row. A section whose
  -- learners span departments is labelled by the section, not by any one learner.
  LEFT JOIN public.sections     sc ON sc.id = f.sec_id
  LEFT JOIN public.departments  d  ON d.id  = sc.department_id
  LEFT JOIN public.semesters    sm ON sm.id = sc.semester_id;
END;
$function$;

-- Lock down execution. REVOKE FROM PUBLIC alone is NOT sufficient on Supabase:
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon`
-- gives anon a DIRECT grant on every newly created function, separate from
-- PUBLIC. Without the explicit anon revoke this would be callable by any
-- unauthenticated client holding the public anon key.
REVOKE EXECUTE ON FUNCTION public.fn_attendance_fresher_readiness(
  integer, uuid, uuid
) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_attendance_fresher_readiness(
  integer, uuid, uuid
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
