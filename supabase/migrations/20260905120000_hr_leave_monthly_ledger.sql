-- ============================================================================
-- CASUAL LEAVE BECOMES A REAL MONTHLY ACCRUAL, WITH A MONTH-BY-MONTH LEDGER
-- (2026-09-05)
--
-- THREE THINGS WERE BROKEN, AND ONLY THE THIRD WAS VISIBLE.
--
-- 1. NO LEAVE TYPE WAS EVER PUT ON ACCRUAL. The engine landed on 2026-09-02
--    (fn_hr_leave_accrual_days, the accrued/pending view columns, and the
--    trg_hla_balance_guard trigger) but all 77 types were left at
--    accrual_type='none', accrual_rate=0. What Casual Leave actually had was
--    default_entitled_days=12 plus leave_max_days_per_period=2 -- "all twelve
--    available on 1 June, never more than two in a month". That is a CEILING,
--    not an accrual: unused months were not carried forward because there was
--    nothing to carry. HR believed it was granting one day a month.
--
-- 2. THE MONTH-BY-MONTH RPC WAS WRITTEN BUT NEVER APPLIED. Section 5 of
--    20260902160000_hr_leave_accrual_and_pending_reservation.sql declares
--    fn_hr_leave_monthly_breakdown "for the Balance tab". The applied body of
--    that migration (recorded as 20260902112409, 13,892 chars) does not contain
--    it, and the function is absent from the database. Somebody appended to a
--    migration file after applying it. That section has been removed from the
--    historical file by this change -- it never ran, and a migration directory
--    that claims work it never did is worse than one that is merely incomplete.
--
-- 3. THE ADMIN SCREEN COULD NOT SEE ACCRUAL AT ALL. The staff-facing side
--    already reads `accrued` and `pending` (leave-service.ts, the apply
--    drawer). hr_leave_balance_staff_detail builds its own cell JSON and
--    emitted neither, so /hr/admin/leave-balances showed entitled-only figures
--    that disagreed with what the staff member saw in their own drawer.
--
-- WHY THE LEDGER NEEDS NO TABLE, NO CRON AND NO BACKFILL. Accrual is
-- cumulative -- LEAST(entitled, months_elapsed * rate) -- so "unused days carry
-- forward" is not a step that runs, it is simply the absence of spending. The
-- month-wise view is therefore pure REPORTING over arithmetic that already
-- works. Nothing is materialised, so nothing can drift.
--
-- FIFO IS ATTRIBUTION, NOT ARITHMETIC. Because a month's credit never lapses
-- (confirmed as the policy: June's unused day is spendable in April), drawing
-- oldest-first changes no total. It only answers "which month did this day come
-- from", which is exactly what HR asked for. That is why there is no expiry
-- engine here -- adding one would be inventing policy nobody asked for.
-- ============================================================================

-- NO EXPLICIT BEGIN/COMMIT: every apply path used here (Supabase CLI,
-- the MCP apply_migration tool, and scripts/apply-migration-file.mjs via
-- exec_sql) already wraps a migration in one transaction. An inner BEGIN
-- would additionally make this file unrunnable through exec_sql, which
-- executes inside a function and so cannot contain transaction control.
-- The file is still all-or-nothing.

-- ---------------------------------------------------------------------------
-- 1. The month-by-month ledger
--
-- Buckets are cumulative RANGES, so FIFO falls out of a range overlap and needs
-- no loop. Bucket m spans (cum(m-1), cum(m)]; an application, ordered by date,
-- occupies (cum_before, cum_after]. The overlap of the two is the days that
-- request drew from that month:
--
--     overlap = GREATEST(0, LEAST(hi, cum_after) - GREATEST(lo, cum_before))
--
-- Worked: 1/month from June, nothing taken until a 2-day request on 12 Sep.
-- June's bucket is (0,1], July's (1,2]. The request occupies (0,2], so it
-- overlaps June by 1 and July by 1 -- "June and July went unused, carried
-- forward, and were spent in September". Which is the sentence HR wanted.
--
-- CUMULATIVE ACCRUAL COMES FROM fn_hr_leave_accrued_days, never from a second
-- copy of the formula. If the accrual rule ever changes, this ledger follows it
-- automatically; a local re-implementation would silently disagree the day
-- somebody edited one of the two.
--
-- PRIOR-YEAR CARRY-IN sits at the front of the first month's bucket rather than
-- getting a row of its own: it is available from day one exactly as June's
-- credit is, and is reported as that row's opening_days. Within June the two
-- are not distinguished -- a distinction with no consequence, since neither
-- lapses.
--
-- OVERDRAW IS NOT HIDDEN. Consumption beyond every bucket leaves the final
-- row's closing_days negative. That is the signal; there is no separate
-- "unattributed" column to be ignored.
--
-- AUTHORISATION INCLUDES hr.leave.balance.manage. The never-applied draft
-- checked only is_super_admin / own-staff / hr.leave.approve. `approve` is held
-- by 2 roles and `balance.manage` by 7 -- so five of the seven roles that can
-- open the Adjust dialog would have been refused by the very RPC that fills it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_monthly_ledger(
  p_staff_id            uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid DEFAULT NULL
)
RETURNS TABLE(
  month_start      date,
  accrued_days     numeric,
  opening_days     numeric,
  consumed_days    numeric,
  reserved_days    numeric,
  closing_days     numeric,
  taken_in_month   numeric,
  pending_in_month numeric,
  drawn_by         jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type  record;
  v_w     record;
  v_ay    uuid;
  v_carry numeric;
BEGIN
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
  -- a day entitlement to divide into months, and forcing one on them refused
  -- every comp-off claim the last time it was tried.
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

  SELECT COALESCE(carried_forward, 0) INTO v_carry
  FROM public.hr_leave_balances
  WHERE employee_id = p_staff_id
    AND leave_type_id = p_leave_type_id
    AND hr_academic_year_id = v_ay;
  v_carry := COALESCE(v_carry, 0);

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
  ranked AS (
    -- Oldest first: the cumulative position of each request is what maps it
    -- onto a bucket. Ties on start_date break on id so the walk is stable.
    SELECT ap.id, ap.start_date, ap.end_date, ap.status, ap.days,
           COALESCE(SUM(ap.days) OVER (ORDER BY ap.start_date, ap.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS cum_before,
           COALESCE(SUM(ap.days) OVER (ORDER BY ap.start_date, ap.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + ap.days AS cum_after
      FROM apps ap
  ),
  cal AS (
    -- The calendar view, kept apart from the bucket view: one says WHEN leave
    -- was taken, the other says WHICH MONTH'S credit paid for it. Aggregating
    -- both in the bucket GROUP BY would multiply rows through the overlap join.
    SELECT date_trunc('month', ap.start_date)::date AS m,
           COALESCE(SUM(ap.days) FILTER (WHERE ap.status = 'approved'), 0) AS taken,
           COALESCE(SUM(ap.days) FILTER (WHERE ap.status IN ('pending','escalated')), 0) AS pend
      FROM apps ap GROUP BY 1
  ),
  agg AS (
    SELECT r.m, r.m_end, r.accrued_this, r.hi,
           COALESCE(SUM(x.ov) FILTER (WHERE x.status = 'approved'), 0) AS consumed,
           COALESCE(SUM(x.ov) FILTER (WHERE x.status IN ('pending','escalated')), 0) AS reserved,
           jsonb_agg(jsonb_build_object(
             'id', x.id, 'start_date', x.start_date, 'end_date', x.end_date,
             'status', x.status, 'days', x.ov
           ) ORDER BY x.start_date) FILTER (WHERE x.id IS NOT NULL AND x.ov > 0) AS drawn
      FROM ranges r
      LEFT JOIN LATERAL (
        SELECT k.id, k.start_date, k.end_date, k.status,
               GREATEST(0, LEAST(r.hi, k.cum_after) - GREATEST(r.lo, k.cum_before)) AS ov
          FROM ranked k
         WHERE k.cum_after > r.lo AND k.cum_before < r.hi
      ) x ON true
     GROUP BY r.m, r.m_end, r.accrued_this, r.hi
  ),
  closed AS (
    SELECT a.m, a.m_end, a.accrued_this, a.hi, a.consumed, a.reserved, a.drawn,
           a.hi - COALESCE((SELECT SUM(ap.days) FROM apps ap
                             WHERE ap.start_date <= a.m_end), 0) AS closing
      FROM agg a
  )
  SELECT c.m,
         c.accrued_this,
         -- Opening is last month's closing; the first month opens on whatever
         -- the previous year handed over.
         COALESCE(LAG(c.closing) OVER (ORDER BY c.m), v_carry),
         c.consumed,
         c.reserved,
         c.closing,
         COALESCE(cl.taken, 0),
         COALESCE(cl.pend, 0),
         COALESCE(c.drawn, '[]'::jsonb)
    FROM closed c
    LEFT JOIN cal cl ON cl.m = c.m
   ORDER BY c.m;
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) IS
  'Month-by-month leave ledger for one staff member and day-leave type. consumed/reserved say which month''s credit paid for a request (FIFO, oldest first); taken_in_month/pending_in_month say when it was actually taken. closing_days is what carries into the next month and goes negative if more was spent than ever accrued. Accrual comes from fn_hr_leave_accrued_days so there is one definition of the rule.';

-- ---------------------------------------------------------------------------
-- 2. Pre-flight: refuse to switch if anybody is already over
--
-- trg_hla_balance_guard reads accrual the instant accrual_type flips, so this
-- UPDATE is not a config change -- it is an enforcement change for 185 staff
-- with 281 live Casual Leave requests. Measured on 2026-09-05 the worst case
-- was 3 days committed against 4 accrued, so nobody was over. That measurement
-- is not a guarantee for whenever this actually runs, which is what this block
-- is for: it re-measures at apply time and aborts rather than leaving people
-- unable to submit.
--
-- Uses fn_hr_leave_accrual_days with the PROSPECTIVE parameters, so the
-- pre-flight and the post-switch reality are computed by the same function.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  v_bad  integer;
  v_list text;
BEGIN
  WITH cl AS (
    SELECT id, default_entitled_days, skip_weekends, skip_holidays
      FROM public.hr_leave_types
     WHERE leave_type_code = 'CL' AND is_active AND request_category = 'leave'
  ),
  ay AS (
    SELECT id, start_date FROM public.hr_academic_years
     WHERE frozen_at IS NULL AND CURRENT_DATE BETWEEN start_date AND end_date
  ),
  committed AS (
    SELECT a.employee_id, cl.id AS type_id, ay.start_date, cl.default_entitled_days,
           SUM(public.hr_calc_leave_days(
                 a.start_date, a.end_date, a.duration_type,
                 COALESCE(cl.skip_weekends, true), COALESCE(cl.skip_holidays, true),
                 a.hr_organization_id, a.employee_id)) AS days
      FROM public.hr_leave_applications a
      JOIN cl ON cl.id = a.leave_type_id
      JOIN ay ON ay.id = a.hr_academic_year_id
     WHERE a.status IN ('approved', 'pending', 'escalated')
     GROUP BY 1, 2, 3, 4
  )
  SELECT count(*),
         string_agg(DISTINCT COALESCE(s.staff_id, s.id::text), ', ')
    INTO v_bad, v_list
  FROM committed c
  JOIN public.staff s ON s.id = c.employee_id
  WHERE c.days > public.fn_hr_leave_accrual_days(
          'monthly', 1, c.default_entitled_days,
          c.start_date, s.date_of_joining, CURRENT_DATE);

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Refusing to put Casual Leave on monthly accrual: % staff already hold more CL than 1/month would have accrued by today (%). Adjust those balances first, or the balance guard will block their next request.',
      v_bad, left(v_list, 400);
  END IF;

  RAISE NOTICE 'Pre-flight OK: no staff over accrued-to-date for Casual Leave.';
END
$do$;

-- ---------------------------------------------------------------------------
-- 3. Casual Leave: 12 a year becomes 1 a month, and the ceiling comes off
--
-- THE CEILING AND CARRY-FORWARD WERE CONTRADICTORY. leave_max_days_per_period=2
-- says "never more than 2 in a month, unused is lost"; accrual says "unused
-- rolls forward". Keeping both would have accrued 3 days by August and then
-- refused the third -- carry-forward that cannot be spent is not carry-forward.
-- HR chose accrual as the only limiter, so the ceiling is cleared.
--
-- default_entitled_days STAYS 12: it is the annual cap that LEAST() closes
-- accrual against, so it still governs the year's total.
--
-- accrual_rate is a LITERAL 1, not default_entitled_days/12. If the entitlement
-- is ever changed to something other than 12 this rate must be revisited --
-- accrual would run at 1/month and simply stop early when it hit the cap,
-- rather than re-dividing the new total across the year.
-- ---------------------------------------------------------------------------
UPDATE public.hr_leave_types
   SET accrual_type              = 'monthly',
       accrual_rate              = 1,
       leave_limit_period        = NULL,
       leave_max_days_per_period = NULL,
       updated_at                = now()
 WHERE leave_type_code = 'CL'
   AND is_active
   AND request_category = 'leave';

-- ---------------------------------------------------------------------------
-- 4. Grants. A newly created function is EXECUTE-able by PUBLIC, and PUBLIC
--    includes anon -- restoring captured grants is not enough, the REVOKE has
--    to come first.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) TO authenticated, service_role;

