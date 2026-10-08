-- =============================================================================
-- 20271006110000_hr_attendance_console_hr_category_staff.sql
--
-- hr_attendance_period_console(): "active staff" counts only people in an HR
-- employment category.
--
-- THE BUG (found 2026-10-06 closing September for Dental)
-- -------------------------------------------------------
-- The Month Close screen warned "42 staff member(s) have no attendance data for
-- this month". The figure is `active_staff - staff_with_records`, and
-- active_staff was
--
--     SELECT count(*) FROM staff s3
--      WHERE s3.institution_id = i.id AND COALESCE(s3.is_active, false)
--
-- i.e. EVERY active staff row at the institution, including employment
-- categories excluded from HR (employment_categories.included_in_hr = false:
-- Ayaah, Driver, Security, Warden, Hostel, Cooking Master). Those people have no
-- biometric attendance in this module and are on no salary register, so they can
-- never be "covered" and the warning could never reach zero. At Dental:
--
--     148 active at Dental  -  106 with September records  =  42
--         22 of the 42 are categories excluded from HR (never meant to appear)
--         20 of the 42 are real HR staff with no September records
--             (10 have no biometric ID, 10 have an ID but no punches)
--
-- THE FIX
-- -------
-- Count active staff through employment_categories.included_in_hr, the same gate
-- v_hr_staff (and therefore the salary register and the close preview) already
-- uses. The institution gate stays where it was: the WHERE clause's
-- fn_hr_institution_included(i.id). Dental reads 20: the genuine gap.
--
-- staff_with_records is deliberately NOT narrowed: a record is a record, and the
-- biometric import matches on employee code whatever the category.
--
-- Only the `h` lateral changes. CREATE OR REPLACE with the identical signature,
-- options and search_path, so the existing GRANTs are kept.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hr_attendance_period_console(p_year integer, p_month integer)
 RETURNS TABLE(institution_id uuid, institution_name text, period_id uuid, status text, locked_at timestamp with time zone, staff_with_records integer, active_staff integer, relieved_with_records integer, record_count integer, pending_total integer, pending_leave integer, pending_short_time_off integer, pending_comp_off integer, approved_leave integer, approved_short_time_off integer, approved_comp_off integer, unprocessed_days integer, days_covered integer, days_in_month integer, first_covered_date date, last_covered_date date)
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
         (COALESCE(q.p_total, 0) + COALESCE(c.p_claims, 0))::int,
         COALESCE(q.p_leave, 0)::int,
         COALESCE(q.p_sto, 0)::int,
         (COALESCE(q.p_comp, 0) + COALESCE(c.p_claims, 0))::int,
         COALESCE(q.a_leave, 0)::int,
         COALESCE(q.a_sto, 0)::int,
         (COALESCE(q.a_comp, 0) + COALESCE(c.a_claims, 0))::int,
         COALESCE(r.unprocessed_ct, 0)::int,
         -- DISTINCT DATES, not records: a day is covered once anyone has a row
         -- on it. Weekly offs count, because the importer writes them too, so
         -- this is "how far through the month the import reached" and not a
         -- working-day figure.
         COALESCE(r.days_ct, 0)::int,
         (v_end - v_start + 1)::int,
         r.first_date,
         r.last_date
    FROM public.institutions i
    LEFT JOIN public.hr_attendance_periods ap
           ON ap.institution_id = i.id
          AND ap.period_year = p_year AND ap.period_month = p_month
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT rr.employee_id) AS staff_ct,
             count(DISTINCT rr.employee_id)
               FILTER (WHERE NOT COALESCE(s2.is_active, false)) AS relieved_ct,
             count(*)                       AS rec_ct,
             count(DISTINCT rr.work_date)   AS days_ct,
             min(rr.work_date)              AS first_date,
             max(rr.work_date)              AS last_date,
             count(*) FILTER (WHERE st.code NOT IN (
               'PRESENT','REGULARIZED','HALF_DAY','ABSENT','WEEKLY_OFF',
               'HOLIDAY','LEAVE','ON_DUTY','on_clinical_posting')) AS unprocessed_ct
        FROM public.hr_attendance_records rr
        JOIN public.hr_attendance_status_types st ON st.id = rr.status_type_id
        LEFT JOIN public.staff s2 ON s2.id = rr.employee_id
       WHERE rr.institution_id = i.id
         AND rr.work_date BETWEEN v_start AND v_end
    ) r ON true
    -- ACTIVE STAFF IN AN HR CATEGORY ONLY. Categories excluded from HR (Ayaah,
    -- Driver, Security, ...) have no attendance here and sit on no register, so
    -- counting them made "no attendance data" unreachable-to-zero. The same gate
    -- as v_hr_staff.
    LEFT JOIN LATERAL (
      SELECT count(*) AS active_ct
        FROM public.staff s3
        JOIN public.employment_categories ec
          ON ec.id = s3.category_id AND ec.included_in_hr
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
    -- Comp off CLAIMS. A different table from the bookings above, keyed on the
    -- worked day rather than a date range, and the half the gate blocks on.
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE cc.status = 'pending')  AS p_claims,
             count(*) FILTER (WHERE cc.status = 'approved') AS a_claims
        FROM public.hr_comp_off_credits cc
        JOIN public.staff s4 ON s4.id = cc.employee_id
       WHERE s4.institution_id = i.id
         AND cc.worked_date BETWEEN v_start AND v_end
    ) c ON true
   WHERE public.role_has_institution_access(i.id)
     AND public.fn_hr_institution_included(i.id)
   ORDER BY (COALESCE(r.rec_ct, 0) = 0) DESC,
            (COALESCE(q.p_total, 0) + COALESCE(c.p_claims, 0) > 0) DESC,
            i.name;
END;
$function$;
