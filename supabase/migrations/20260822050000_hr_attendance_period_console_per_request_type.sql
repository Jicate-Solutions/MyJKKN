-- Split the console's pending count by REQUEST TYPE.
--
-- One "12 pending" number told an HR Head that something was blocking the close
-- but not what, and the three request types live behind three different tabs of
-- the approvals screen. Naming them -- 7 leave, 4 short time off, 1 comp-off --
-- is the difference between "go and look" and "go to that tab".
--
-- The approved counts are split the same way, because after the close those are
-- the numbers that produced the frozen day counts, and a reader reconciling a
-- payslip wants them itemised.
--
-- DROP first: the RETURNS TABLE signature changed, and CREATE OR REPLACE cannot
-- alter a function's result type.

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
  forced              boolean,
  staff_with_records  integer,
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
         COALESCE(ap.forced, false),
         COALESCE(r.staff_ct, 0)::int,
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
             count(*)                       AS rec_ct,
             count(*) FILTER (WHERE st.code NOT IN (
               'PRESENT','REGULARIZED','HALF_DAY','ABSENT','WEEKLY_OFF',
               'HOLIDAY','LEAVE','ON_DUTY','on_clinical_posting')) AS unprocessed_ct
        FROM public.hr_attendance_records rr
        JOIN public.hr_attendance_status_types st ON st.id = rr.status_type_id
       WHERE rr.institution_id = i.id
         AND rr.work_date BETWEEN v_start AND v_end
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE la.status = 'pending')  AS p_total,
        count(*) FILTER (WHERE la.status = 'pending'  AND lt.request_category = 'leave')             AS p_leave,
        count(*) FILTER (WHERE la.status = 'pending'  AND lt.request_category = 'short_time_off')    AS p_sto,
        count(*) FILTER (WHERE la.status = 'pending'  AND lt.request_category = 'compensatory_off')  AS p_comp,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'leave')             AS a_leave,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'short_time_off')    AS a_sto,
        count(*) FILTER (WHERE la.status = 'approved' AND lt.request_category = 'compensatory_off')  AS a_comp
        FROM public.hr_leave_applications la
        JOIN public.hr_leave_types lt ON lt.id = la.leave_type_id
        JOIN public.staff s ON s.id = la.employee_id
       WHERE s.institution_id = i.id
         AND la.start_date <= v_end AND la.end_date >= v_start
    ) q ON true
   WHERE public.role_has_institution_access(i.id)
   -- Institutions with no data first (they need importing), then the ones still
   -- blocked by outstanding requests, then the ones ready to close.
   ORDER BY (COALESCE(r.rec_ct, 0) = 0) DESC,
            (COALESCE(q.p_total, 0) > 0) DESC,
            i.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_attendance_period_console(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_attendance_period_console(integer, integer) TO authenticated, service_role;
