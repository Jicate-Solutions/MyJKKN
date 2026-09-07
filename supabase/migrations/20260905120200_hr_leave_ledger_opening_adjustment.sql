-- ============================================================================
-- THE LEDGER MUST RECONCILE TO `used`, NOT TO THE APPLICATION LIST
-- (2026-09-05)
--
-- 20260905120000 attributed consumption purely from hr_leave_applications. That
-- is wrong here, and measurably so: of 775 Casual Leave balance rows in
-- 2026-2027, 298 have hr_leave_balances.used HIGHER than the sum of their
-- approved applications -- 505.5 days in total, worst case 7.5 days on one
-- person -- and 232 of those have used > 0 with NO applications in this system
-- at all. Those are the June 2026 balances backfilled from the legacy HR
-- exports, plus corrections typed into the Adjust dialog, which writes `used`
-- directly and creates no application.
--
-- An application-only ledger therefore told 232 people they had taken nothing
-- while the grid beside it said they had taken days, and its closing balance
-- disagreed with v_hr_leave_balance.available for 298 of 775 rows. Two screens
-- disagreeing about one person's leave is the exact failure this feature was
-- built to end.
--
-- THE GAP IS ONE-DIRECTIONAL, which is what makes the fix unambiguous:
-- used > applications on 298 rows, applications > used on ZERO. So the
-- remainder is always a real prior consumption with no request behind it, never
-- a missing trigger. It is attributed as an OPENING ADJUSTMENT occupying the
-- cumulative range (0, used - approved_applications] -- ahead of every
-- application, because legacy consumption is the oldest consumption and FIFO
-- drains the earliest buckets first.
--
-- `used` is now the authority for approved consumption and applications merely
-- explain it. closing_days consequently reconciles to available by
-- construction: hi - (adjustment + approved + pending) = accrued + carried -
-- used - pending.
--
-- DROP + CREATE, not CREATE OR REPLACE: the return type gains a column, which
-- REPLACE cannot do. A DROP takes the ACL with it and a new function is
-- EXECUTE-able by PUBLIC (which includes anon), so the REVOKE/GRANT pair at the
-- bottom is not decoration -- without it this function would be readable by
-- anonymous callers.
--
-- NO EXPLICIT BEGIN/COMMIT -- see the note in 20260905120000.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid);

CREATE FUNCTION public.fn_hr_leave_monthly_ledger(
  p_staff_id            uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid DEFAULT NULL
)
RETURNS TABLE(
  month_start        date,
  accrued_days       numeric,
  opening_days       numeric,
  consumed_days      numeric,
  reserved_days      numeric,
  closing_days       numeric,
  taken_in_month     numeric,
  pending_in_month   numeric,
  opening_adjustment numeric,
  drawn_by           jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type   record;
  v_w      record;
  v_ay     uuid;
  v_carry  numeric;
  v_used   numeric;
  v_app    numeric;
  v_adjust numeric;
BEGIN
  -- hr.leave.balance.manage is held by 7 roles and hr.leave.approve by 2. Gating
  -- on approve alone would refuse five of the seven roles that can open the
  -- Adjust dialog this function fills.
  IF NOT public.is_super_admin()
     AND NOT (p_staff_id = ANY (public.fn_my_staff_ids()))
     AND NOT public.user_has_permission('hr.leave.balance.manage'::text)
     AND NOT public.user_has_permission('hr.leave.approve'::text) THEN
    RAISE EXCEPTION 'Not authorized to read this leave ledger';
  END IF;

  SELECT skip_weekends, skip_holidays, request_category
    INTO v_type
  FROM public.hr_leave_types WHERE id = p_leave_type_id;

  -- Comp off is credit-backed and short time off is minute-backed. Neither has
  -- a day entitlement to divide into months.
  IF NOT FOUND OR v_type.request_category IS DISTINCT FROM 'leave' THEN
    RETURN;
  END IF;

  -- Resolve the year before filtering applications by it: passing NULL through
  -- to the filter below would match only rows whose year is itself NULL.
  v_ay := p_hr_academic_year_id;
  IF v_ay IS NULL THEN
    SELECT id INTO v_ay FROM public.hr_academic_years
     WHERE CURRENT_DATE BETWEEN start_date AND end_date
     ORDER BY start_date DESC LIMIT 1;
  END IF;

  SELECT * INTO v_w FROM public.hr_leave_period_window('year', v_ay, CURRENT_DATE);
  IF v_w.period_start IS NULL THEN RETURN; END IF;

  SELECT COALESCE(carried_forward, 0), COALESCE(used, 0)
    INTO v_carry, v_used
  FROM public.hr_leave_balances
  WHERE employee_id = p_staff_id
    AND leave_type_id = p_leave_type_id
    AND hr_academic_year_id = v_ay;
  v_carry := COALESCE(v_carry, 0);
  v_used  := COALESCE(v_used, 0);

  SELECT COALESCE(SUM(public.hr_calc_leave_days(
           a.start_date, a.end_date, a.duration_type,
           COALESCE(v_type.skip_weekends, true), COALESCE(v_type.skip_holidays, true),
           a.hr_organization_id, a.employee_id)), 0)
    INTO v_app
  FROM public.hr_leave_applications a
  WHERE a.employee_id         = p_staff_id
    AND a.leave_type_id       = p_leave_type_id
    AND a.hr_academic_year_id = v_ay
    AND a.status              = 'approved'
    AND a.start_date BETWEEN v_w.period_start AND v_w.period_end;

  -- Consumption of record with no request behind it: legacy backfill, or a
  -- correction typed into the Adjust dialog. GREATEST guards a direction that
  -- does not occur in the data today (applications never exceed `used`) but
  -- would otherwise push every application backwards into buckets it never
  -- touched.
  v_adjust := GREATEST(0, v_used - v_app);

  RETURN QUERY
  WITH months AS (
    SELECT gs::date AS m,
           LEAST((gs + interval '1 month - 1 day')::date, v_w.period_end) AS m_end
      FROM generate_series(v_w.period_start, v_w.period_end, interval '1 month') gs
  ),
  buckets AS (
    SELECT m.m, m.m_end,
           public.fn_hr_leave_accrued_days(p_staff_id, p_leave_type_id, v_ay, m.m_end) AS cum_acc,
           COALESCE(LAG(public.fn_hr_leave_accrued_days(p_staff_id, p_leave_type_id, v_ay, m.m_end))
                    OVER (ORDER BY m.m), 0) AS cum_acc_prev
      FROM months m
  ),
  ranges AS (
    SELECT b.m, b.m_end,
           b.cum_acc - b.cum_acc_prev AS accrued_this,
           -- Carry-in leads the first bucket; every later bucket starts where
           -- the previous one ended.
           CASE WHEN b.m = v_w.period_start THEN 0
                ELSE v_carry + b.cum_acc_prev END AS lo,
           v_carry + b.cum_acc AS hi
      FROM buckets b
  ),
  apps AS (
    SELECT a.id, a.start_date, a.end_date, a.status,
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(v_type.skip_weekends, true), COALESCE(v_type.skip_holidays, true),
             a.hr_organization_id, a.employee_id) AS days
      FROM public.hr_leave_applications a
     WHERE a.employee_id         = p_staff_id
       AND a.leave_type_id       = p_leave_type_id
       AND a.hr_academic_year_id = v_ay
       AND a.status IN ('approved', 'pending', 'escalated')
       AND a.start_date BETWEEN v_w.period_start AND v_w.period_end
  ),
  consumers AS (
    -- The opening adjustment sits at cumulative position 0, ahead of every
    -- request, so it drains the earliest months first.
    SELECT NULL::uuid AS id, NULL::date AS start_date, NULL::date AS end_date,
           'opening_adjustment'::text AS status,
           0::numeric AS cum_before, v_adjust AS cum_after
     WHERE v_adjust > 0
    UNION ALL
    -- Oldest first. Ties on start_date break on id so the walk is stable.
    SELECT ap.id, ap.start_date, ap.end_date, ap.status,
           v_adjust + COALESCE(SUM(ap.days) OVER (ORDER BY ap.start_date, ap.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
           v_adjust + COALESCE(SUM(ap.days) OVER (ORDER BY ap.start_date, ap.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + ap.days
      FROM apps ap
  ),
  cal AS (
    -- The calendar view, kept apart from the bucket view: one says WHEN leave
    -- was taken, the other says WHICH MONTH'S credit paid for it. Aggregating
    -- both in the bucket GROUP BY would multiply rows through the overlap join.
    -- The opening adjustment has no date and so appears in neither column here.
    SELECT date_trunc('month', ap.start_date)::date AS m,
           COALESCE(SUM(ap.days) FILTER (WHERE ap.status = 'approved'), 0) AS taken,
           COALESCE(SUM(ap.days) FILTER (WHERE ap.status IN ('pending','escalated')), 0) AS pend
      FROM apps ap GROUP BY 1
  ),
  agg AS (
    SELECT r.m, r.m_end, r.accrued_this, r.hi,
           COALESCE(SUM(x.ov) FILTER (WHERE x.status IN ('approved','opening_adjustment')), 0) AS consumed,
           COALESCE(SUM(x.ov) FILTER (WHERE x.status IN ('pending','escalated')), 0) AS reserved,
           jsonb_agg(jsonb_build_object(
             'id', x.id, 'start_date', x.start_date, 'end_date', x.end_date,
             'status', x.status, 'days', x.ov
           ) ORDER BY x.start_date NULLS FIRST) FILTER (WHERE x.ov > 0) AS drawn
      FROM ranges r
      LEFT JOIN LATERAL (
        SELECT k.id, k.start_date, k.end_date, k.status,
               GREATEST(0, LEAST(r.hi, k.cum_after) - GREATEST(r.lo, k.cum_before)) AS ov
          FROM consumers k
         WHERE k.cum_after > r.lo AND k.cum_before < r.hi
      ) x ON true
     GROUP BY r.m, r.m_end, r.accrued_this, r.hi
  ),
  closed AS (
    SELECT a.m, a.m_end, a.accrued_this, a.hi, a.consumed, a.reserved, a.drawn,
           -- Everything spent by the end of this month: the opening adjustment
           -- (which predates the year) plus every request dated up to it. This
           -- is what makes the final row equal available.
           a.hi - (v_adjust + COALESCE((SELECT SUM(ap.days) FROM apps ap
                                         WHERE ap.start_date <= a.m_end), 0)) AS closing
      FROM agg a
  )
  SELECT c.m,
         c.accrued_this,
         -- Opening is last month's closing; the first month opens on whatever
         -- the previous year handed over, less any opening adjustment.
         COALESCE(LAG(c.closing) OVER (ORDER BY c.m), v_carry - v_adjust),
         c.consumed,
         c.reserved,
         c.closing,
         COALESCE(cl.taken, 0),
         COALESCE(cl.pend, 0),
         v_adjust,
         COALESCE(c.drawn, '[]'::jsonb)
    FROM closed c
    LEFT JOIN cal cl ON cl.m = c.m
   ORDER BY c.m;
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) IS
  'Month-by-month leave ledger for one staff member and day-leave type. consumed/reserved say which month''s credit paid for a request (FIFO, oldest first); taken_in_month/pending_in_month say when it was actually taken. opening_adjustment is consumption recorded in hr_leave_balances.used with no application behind it (legacy backfill or an Adjust-dialog correction) and is drawn from the earliest months. closing_days is what carries into the next month and reconciles to v_hr_leave_balance.available by construction.';

-- A DROP took the ACL with it, and a new function is EXECUTE-able by PUBLIC --
-- which includes anon. Restoring the grant alone would leave anon in place.
REVOKE ALL ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) TO authenticated, service_role;
