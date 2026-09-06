-- ============================================================================
-- ATTENDANCE MONTH CLOSE RESPECTS THE INSTITUTION GATE (2026-09-06) — PART F
--
-- Three separate holes in this module, all found by audit:
--
-- 1. THE CONSOLE LISTED EVERY INSTITUTION. hr_attendance_period_console scans
--    `FROM public.institutions` directly instead of going through
--    fn_hr_orgs_for_institutions, gated only on role_has_institution_access. An
--    institution excluded from the HR module still appeared in the month-close
--    list and in its "All institutions (n)" count.
--
-- 2. A PERIOD COULD STILL BE CLOSED FOR AN EXCLUDED INSTITUTION.
--    fn_hr_lock_attendance_period (BOTH overloads) and
--    fn_hr_reopen_attendance_period check hr.attendance.period.manage but not
--    whether the institution is in HR. They are SECURITY DEFINER, so they run as
--    the owner and RLS cannot stop them either.
--
--    Fixed with a TRIGGER on hr_attendance_periods rather than by editing three
--    function bodies. The trigger covers every write path — both overloads,
--    reopen, any future function, and direct SQL — and cannot be bypassed by
--    adding a fourth caller later. Patching the bodies would have left exactly
--    that gap open.
--
-- 3. fn_hr_lock_attendance_period(uuid,int,int,boolean,text) IS ANON-EXECUTABLE.
--    The 3-argument overload was revoked by 20260925000000; this 5-argument one
--    was added afterwards and never was. A new function is EXECUTE-able by
--    PUBLIC, and PUBLIC includes anon. NOT exploitable — its first statement
--    demands hr.attendance.period.manage, which anon cannot hold — but a WRITE
--    function that closes a payroll-relevant month should not be callable by
--    anonymous at all. Revoked below.
--
-- Plus restrictive policies for the attendance tables, matching Part E.
--
-- NO EXPLICIT BEGIN/COMMIT — see the note in 20260905120000.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The write gate. BEFORE INSERT OR UPDATE, so closing, reopening and any
--    direct write are all covered by one predicate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_attendance_period_institution_included()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_hr_institution_included(NEW.institution_id) THEN
    RAISE EXCEPTION
      'This institution is excluded from the HR module, so its attendance month cannot be closed or reopened.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hap_institution_included ON public.hr_attendance_periods;
CREATE TRIGGER trg_hap_institution_included
  BEFORE INSERT OR UPDATE ON public.hr_attendance_periods
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_attendance_period_institution_included();

-- ---------------------------------------------------------------------------
-- 2. Restrictive read policies, same mechanism as Part E: ANDed with the
--    existing policies, so nothing already written has to be rewritten.
--
--    period_summaries and regularizations carry no tenant column at all, so
--    they reach the institution through their parent row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_included_gate ON public.hr_attendance_periods;
CREATE POLICY hr_included_gate ON public.hr_attendance_periods
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_attendance_records;
CREATE POLICY hr_included_gate ON public.hr_attendance_records
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_attendance_exceptions;
CREATE POLICY hr_included_gate ON public.hr_attendance_exceptions
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_attendance_audit_log;
CREATE POLICY hr_included_gate ON public.hr_attendance_audit_log
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

DROP POLICY IF EXISTS hr_included_gate ON public.hr_attendance_status_types;
CREATE POLICY hr_included_gate ON public.hr_attendance_status_types
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_institution_included(institution_id));

-- Via the parent period.
DROP POLICY IF EXISTS hr_included_gate ON public.hr_attendance_period_summaries;
CREATE POLICY hr_included_gate ON public.hr_attendance_period_summaries
  AS RESTRICTIVE FOR SELECT USING (
    period_id IS NULL
    OR EXISTS (SELECT 1 FROM public.hr_attendance_periods p
                WHERE p.id = period_id
                  AND public.fn_hr_institution_included(p.institution_id))
  );

-- Via the staff member.
DROP POLICY IF EXISTS hr_included_gate ON public.hr_attendance_regularizations;
CREATE POLICY hr_included_gate ON public.hr_attendance_regularizations
  AS RESTRICTIVE FOR SELECT USING (public.fn_hr_staff_institution_included(employee_id));

-- ---------------------------------------------------------------------------
-- 3. The overload that was never revoked. See the header.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer, boolean, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The console stops listing excluded institutions.
--    Body is 20260822080000 plus one predicate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_attendance_period_console(
  p_year  integer,
  p_month integer
)
RETURNS TABLE(
  institution_id      uuid,
  institution_name    text,
  period_id           uuid,
  status              text,
  locked_at           timestamptz,
  staff_with_records  integer,
  active_staff        integer,
  relieved_with_records integer,
  record_count        integer,
  pending_total       integer,
  pending_leave       integer,
  pending_short_time_off integer,
  pending_comp_off    integer,
  approved_leave      integer,
  approved_short_time_off integer,
  approved_comp_off   integer,
  unprocessed_days    integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := make_date(p_year, p_month, 1);
  v_end   date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
BEGIN
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.period.view')) THEN
    RAISE EXCEPTION 'hr.attendance.period.view is required to see the attendance close console.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT i.id,
         i.name::text,
         ap.id,
         COALESCE(ap.status, 'open')::text,
         ap.locked_at,
         COALESCE(r.staff_ct, 0)::int,
         COALESCE(h.active_ct, 0)::int,
         COALESCE(r.relieved_ct, 0)::int,
         COALESCE(r.rec_ct, 0)::int,
         COALESCE(q.p_total, 0)::int,
         COALESCE(q.p_leave, 0)::int,
         COALESCE(q.p_sto, 0)::int,
         COALESCE(q.p_comp, 0)::int,
         COALESCE(q.a_leave, 0)::int,
         COALESCE(q.a_sto, 0)::int,
         COALESCE(q.a_comp, 0)::int,
         COALESCE(r.unprocessed_ct, 0)::int
    FROM public.institutions i
    LEFT JOIN public.hr_attendance_periods ap
           ON ap.institution_id = i.id
          AND ap.period_year = p_year AND ap.period_month = p_month
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT rr.employee_id) AS staff_ct,
             count(DISTINCT rr.employee_id)
               FILTER (WHERE NOT COALESCE(s2.is_active, false)) AS relieved_ct,
             count(*)                       AS rec_ct,
             count(*) FILTER (WHERE st.code NOT IN (
               'PRESENT','REGULARIZED','HALF_DAY','ABSENT','WEEKLY_OFF',
               'HOLIDAY','LEAVE','ON_DUTY','on_clinical_posting')) AS unprocessed_ct
        FROM public.hr_attendance_records rr
        JOIN public.hr_attendance_status_types st ON st.id = rr.status_type_id
        LEFT JOIN public.staff s2 ON s2.id = rr.employee_id
       WHERE rr.institution_id = i.id
         AND rr.work_date BETWEEN v_start AND v_end
    ) r ON true
    -- The denominator. Active roster, regardless of whether anyone imported them.
    LEFT JOIN LATERAL (
      SELECT count(*) AS active_ct
        FROM public.staff s3
       WHERE s3.institution_id = i.id
         AND COALESCE(s3.is_active, false)
    ) h ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE la.status IN ('pending','escalated'))  AS p_total,
        count(*) FILTER (WHERE la.status IN ('pending','escalated') AND lt.request_category = 'leave')            AS p_leave,
        count(*) FILTER (WHERE la.status IN ('pending','escalated') AND lt.request_category = 'short_time_off')   AS p_sto,
        count(*) FILTER (WHERE la.status IN ('pending','escalated') AND lt.request_category = 'compensatory_off') AS p_comp,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'leave')                          AS a_leave,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'short_time_off')                 AS a_sto,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'compensatory_off')               AS a_comp
        FROM public.hr_leave_applications la
        JOIN public.hr_leave_types lt ON lt.id = la.leave_type_id
        JOIN public.staff s ON s.id = la.employee_id
       WHERE s.institution_id = i.id
         AND la.start_date <= v_end AND la.end_date >= v_start
    ) q ON true
   WHERE public.role_has_institution_access(i.id)
     -- The close console scans institutions directly rather than going
     -- through fn_hr_orgs_for_institutions, so the HR gate has to be
     -- repeated here. Without it an institution excluded from the HR
     -- module still appears in the month-close list and its "All
     -- institutions" count.
     AND public.fn_hr_institution_included(i.id)
   ORDER BY (COALESCE(r.rec_ct, 0) = 0) DESC,
            (COALESCE(q.p_total, 0) > 0) DESC,
            i.name;
END;
$function$;
