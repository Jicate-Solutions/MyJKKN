-- Report BIOMETRIC COVERAGE, not just a staff count.
--
-- The console showed count(DISTINCT employee_id) from hr_attendance_records
-- under the heading "Staff", which reads as headcount and is not: it is how many
-- people appear in the imported file. For July that was 4 at Dental College
-- against 152 active staff, and 5 at Engineering against 91. Closing on those
-- numbers freezes day counts for four people and writes NOTHING for the other
-- 148 -- so payroll later finds no row rather than a zero, which is the quiet
-- kind of wrong.
--
-- active_staff is the denominator that makes the gap visible.
-- relieved_with_records is the other half of the same story: the biometric
-- import matches on the employee code alone and ignores staff.is_active, so 22
-- of July's 209 counted people have already left and still carry 31 days of
-- punches each. That is also why coverage can exceed 100% -- Nursing sat at 25
-- of 24 -- and the UI deliberately reports that rather than clamping it.

DROP FUNCTION IF EXISTS public.hr_attendance_period_console(integer, integer);

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
   ORDER BY (COALESCE(r.rec_ct, 0) = 0) DESC,
            (COALESCE(q.p_total, 0) > 0) DESC,
            i.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_attendance_period_console(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_attendance_period_console(integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_attendance_period_console(integer, integer) IS
  'Per-institution readiness for an attendance month close. staff_with_records is BIOMETRIC COVERAGE, not headcount -- active_staff is the denominator.';
