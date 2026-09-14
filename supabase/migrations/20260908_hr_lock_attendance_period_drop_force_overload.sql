-- Month close is unusable: two overloads of fn_hr_lock_attendance_period (2026-09-08)
--
-- SYMPTOM. HR -> Attendance -> Close, on any institution-month:
--
--   Could not choose the best candidate function between:
--     public.fn_hr_lock_attendance_period(p_institution_id => uuid, p_year => integer, p_month => integer),
--     public.fn_hr_lock_attendance_period(p_institution_id => uuid, p_year => integer, p_month => integer,
--                                         p_force => boolean, p_force_reason => text)
--
-- AttendancePeriodService.lock() posts three named arguments. Both overloads can
-- accept that call — the second fills p_force / p_force_reason from its defaults —
-- so PostgREST refuses to pick one and NO month can be closed at all.
--
-- HOW BOTH CAME TO EXIST
--   20260822030000  created the 5-argument force version, plus the columns
--                   hr_attendance_periods.forced / .force_reason.
--   20260822070000  DELIBERATELY removed the override: dropped the 5-argument
--                   function, dropped both columns, created the 3-argument one.
--                   Its header is explicit about why — "a force path left in the
--                   function is still reachable over PostgREST by anyone holding
--                   hr.attendance.period.manage, so hiding the button would have
--                   made the rule a convention instead of a control."
--   20260827200000  set out to make comp-off obey the lock, and correctly noticed
--                   that the close counted only leave as outstanding. But it
--                   applied that fix by CREATE OR REPLACE-ing the OLD 5-argument
--                   signature. A different signature is a different function, so
--                   this ADDED one back rather than replacing anything.
--
-- So the 5-argument function is not a newer version — it is a five-day-old
-- deletion, resurrected by accident. Two further faults come with it:
--
--   * its final UPDATE sets `forced` and `force_reason`, columns 20260822070000
--     dropped. Had PostgREST ever managed to route to it, the close would have
--     failed with 42703 instead;
--   * its pending count reads la.status = 'pending' only, losing the 'escalated'
--     branch the 3-argument version has. An escalated request is still awaiting
--     somebody's decision, and a month closed over one strands it: after the
--     lock, trg_hla_block_locked_period refuses EVERY update to that row, so it
--     can never be decided. No row is 'escalated' today, which is the only
--     reason this has not already bitten.
--
-- THE FIX. Drop the resurrected overload and keep the deliberate 3-argument one,
-- carrying across the single thing 20260827200000 got right: pending COMP-OFF
-- CLAIMS count as outstanding too. Comp off spans two tables — booking is an
-- hr_leave_applications row, claiming a worked day is an hr_comp_off_credits row
-- — and only the first was ever counted. 16 credits sit 'pending' today.
--
-- The way out of a stuck month is unchanged: decide the requests. A Super
-- Administrator can approve or reject any of them directly, because
-- hr_trig_leave_enforce_approver returns early for one.
--
-- No BEGIN/COMMIT: scripts/apply-migration-file.mjs refuses transaction control.

DROP FUNCTION IF EXISTS public.fn_hr_lock_attendance_period(uuid, integer, integer, boolean, text);

CREATE OR REPLACE FUNCTION public.fn_hr_lock_attendance_period(
  p_institution_id uuid,
  p_year           integer,
  p_month          integer
)
RETURNS public.hr_attendance_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period   public.hr_attendance_periods;
  v_start    date;
  v_end      date;
  v_pending  integer;
  v_records  integer;
BEGIN
  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.attendance.period.manage')) THEN
    RAISE EXCEPTION 'hr.attendance.period.manage is required to close an attendance month.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be 1-12, got %', p_month USING ERRCODE = '22023';
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month - 1 day')::date;

  -- Refuse to close a month that has nothing in it: an empty close would freeze
  -- a set of zeroes and read as "everyone was absent".
  SELECT count(*) INTO v_records
    FROM public.hr_attendance_records
   WHERE institution_id = p_institution_id
     AND work_date BETWEEN v_start AND v_end;

  IF v_records = 0 THEN
    RAISE EXCEPTION 'No attendance records for that institution in %-%. Import the biometric data first.',
      p_year, lpad(p_month::text, 2, '0')
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.hr_attendance_periods (
    institution_id, period_year, period_month, status, created_by, updated_by
  ) VALUES (p_institution_id, p_year, p_month, 'open', auth.uid(), auth.uid())
  ON CONFLICT (institution_id, period_year, period_month) DO NOTHING;

  SELECT * INTO v_period
    FROM public.hr_attendance_periods
   WHERE institution_id = p_institution_id
     AND period_year = p_year AND period_month = p_month
   FOR UPDATE;

  IF v_period.status = 'locked' THEN
    RAISE EXCEPTION 'That attendance month is already closed (locked %).',
      to_char(v_period.locked_at, 'DD Mon YYYY') USING ERRCODE = 'P0001';
  END IF;

  -- BOTH TABLES. Booking comp off is an hr_leave_applications row; CLAIMING a
  -- worked day is an hr_comp_off_credits row keyed on worked_date, and counting
  -- only the first let a month close over an undecided claim — entitlement
  -- against a day whose attendance is already final.
  --
  -- 'escalated' counts as outstanding: it is still awaiting somebody's decision,
  -- and a request left undecided when the month locks can never be decided —
  -- trg_hla_block_locked_period then refuses every update to it.
  SELECT (
    (SELECT count(*)
       FROM public.hr_leave_applications la
       JOIN public.staff s ON s.id = la.employee_id
      WHERE s.institution_id = p_institution_id
        AND la.status IN ('pending', 'escalated')
        AND la.start_date <= v_end AND la.end_date >= v_start)
    +
    (SELECT count(*)
       FROM public.hr_comp_off_credits cc
       JOIN public.staff s2 ON s2.id = cc.employee_id
      WHERE s2.institution_id = p_institution_id
        AND cc.status = 'pending'
        AND cc.worked_date BETWEEN v_start AND v_end)
  ) INTO v_pending;

  -- Unconditional. There is no override, by decision 20260822070000.
  IF v_pending > 0 THEN
    RAISE EXCEPTION
      '% request(s) for this month are still awaiting a decision. Every leave, short time off and compensatory off must be decided before the month can be closed.',
      v_pending
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.fn_hr_compute_attendance_period_summary(v_period.id);

  UPDATE public.hr_attendance_periods
     SET status = 'locked',
         locked_at = now(),
         locked_by = auth.uid(),
         updated_by = auth.uid()
   WHERE id = v_period.id
  RETURNING * INTO v_period;

  RETURN v_period;
END;
$function$;

-- CREATE OR REPLACE keeps the existing ACL, but the DROP above took the sibling's
-- with it and a re-created function silently re-grants EXECUTE to PUBLIC — which
-- includes anon. State it explicitly rather than trusting either behaviour.
REVOKE ALL ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_lock_attendance_period(uuid, integer, integer) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- The close console must count what the close GATE counts.
--
-- hr_attendance_period_console derives pending_comp_off from hr_leave_applications
-- WHERE request_category='compensatory_off' — that is comp off BOOKINGS. CLAIMING
-- a worked day is an hr_comp_off_credits row, a different table, and the console
-- never looked at it. The gate above does.
--
-- Left alone, the two now disagree in the worst direction: Nursing's August reads
-- "1 outstanding" on screen, and closing it fails with "8 request(s) are still
-- awaiting a decision" — sending an HR head to hunt through a leave queue for
-- seven requests that were never in it.
--
-- Claims are folded into the EXISTING pending_comp_off / approved_comp_off rather
-- than given a column of their own: both are comp off awaiting the same decision,
-- the console's job is to say how much work is left before the month can close,
-- and pending_total must equal what the gate refuses on. Signature unchanged, so
-- CREATE OR REPLACE — a DROP would take the ACL with it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_attendance_period_console(p_year integer, p_month integer)
RETURNS TABLE(institution_id uuid, institution_name text, period_id uuid, status text,
              locked_at timestamp with time zone, staff_with_records integer, active_staff integer,
              relieved_with_records integer, record_count integer, pending_total integer,
              pending_leave integer, pending_short_time_off integer, pending_comp_off integer,
              approved_leave integer, approved_short_time_off integer, approved_comp_off integer,
              unprocessed_days integer)
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
     -- The close console scans institutions directly rather than going
     -- through fn_hr_orgs_for_institutions, so the HR gate has to be
     -- repeated here. Without it an institution excluded from the HR
     -- module still appears in the month-close list and its "All
     -- institutions" count.
     AND public.fn_hr_institution_included(i.id)
   ORDER BY (COALESCE(r.rec_ct, 0) = 0) DESC,
            (COALESCE(q.p_total, 0) + COALESCE(c.p_claims, 0) > 0) DESC,
            i.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_attendance_period_console(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_attendance_period_console(integer, integer) TO authenticated, service_role;
