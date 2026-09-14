-- ============================================================================
-- A MONTH ENTRY BECOMES AN OVERRIDE OF THE MONTH'S TOTAL (2026-09-06)
--
-- WHAT CHANGED AND WHY. As shipped this morning an entry was an ADDITIVE
-- "manual days" component: month total = approved applications + entry. That
-- made the applications' own days uneditable -- a month showing 1.5 days from
-- three approved requests could only ever be corrected UPWARDS. HR needs to set
-- what a month actually was, including below what the requests claim.
--
-- An entry now means: THE TOTAL CONSUMED IN THIS MONTH IS EXACTLY `days`.
-- The ledger consequently EXCLUDES approved applications dated in an overridden
-- month -- their days are absorbed into the override rather than added to it.
-- Pending requests are untouched: they are reservations, not consumption, and
-- never formed part of `used`.
--
-- ZERO IS A REAL VALUE NOW. "This month was actually nothing" is a legitimate
-- override when applications say otherwise, so days >= 0 and removing an
-- override is its own mode ('clear') rather than being spelled days = 0.
--
-- added_days IS WHAT MAKES CLEARING REVERSIBLE. Two modes move `used`
-- differently -- add raises it, reclassify does not -- so on clear there is no
-- way to know how much to give back unless it was recorded at the time. Without
-- this column, create-with-add then clear would silently leave `used` inflated.
--
-- SUPER-ADMIN ONLY, matching 20260906130000, which moved every other lever in
-- the Adjust dialog to the same gate.
-- ============================================================================

-- 0 is now meaningful; the old CHECK forbade it.
ALTER TABLE public.hr_leave_month_entries
  DROP CONSTRAINT IF EXISTS hr_leave_month_entries_days_check;
ALTER TABLE public.hr_leave_month_entries
  ADD CONSTRAINT hr_leave_month_entries_days_check CHECK (days >= 0);

ALTER TABLE public.hr_leave_month_entries
  ADD COLUMN IF NOT EXISTS added_days numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hr_leave_month_entries.days IS
  'The TOTAL days consumed in this month. Overrides what approved applications dated in the month say; the ledger excludes them rather than adding to them.';
COMMENT ON COLUMN public.hr_leave_month_entries.added_days IS
  'How much of `days` was added to hr_leave_balances.used by add-mode writes. Given back on clear. Reclassify-mode writes leave it alone, because they moved no total.';

-- ---------------------------------------------------------------------------
-- The writer
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text);

CREATE FUNCTION public.hr_leave_month_entry_set(
  p_employee_id         uuid,
  p_leave_type_id       uuid,
  p_hr_academic_year_id uuid,
  p_month_start         date,
  p_days                numeric,
  p_mode                text,
  p_reason              text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org        uuid;
  v_inst       uuid;
  v_type       record;
  v_w          record;
  v_m          date := date_trunc('month', p_month_start)::date;
  v_entry      record;
  v_has_entry  boolean := false;
  v_apps_month numeric := 0;
  v_old_total  numeric;
  v_used       numeric := 0;
  v_explained  numeric := 0;
  v_adjust     numeric;
  v_increase   numeric;
  v_new_total  numeric;
  v_added      numeric;
  v_action     text;
BEGIN
  IF p_mode NOT IN ('add', 'reclassify', 'clear') THEN
    RAISE EXCEPTION 'Unknown mode % (expected add, reclassify or clear)', p_mode;
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required for every balance adjustment';
  END IF;
  IF p_mode <> 'clear' AND (p_days IS NULL OR p_days < 0) THEN
    RAISE EXCEPTION 'Days must be zero or more';
  END IF;

  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION
      'Insufficient permission: leave balance adjustments are restricted to super administrators';
  END IF;

  SELECT o.id, o.institution_id INTO v_org, v_inst
  FROM public.staff s
  JOIN public.hr_organizations o ON o.institution_id = s.institution_id
  WHERE s.id = p_employee_id AND s.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Unknown or inactive employee %', p_employee_id;
  END IF;

  SELECT skip_weekends, skip_holidays, request_category, hr_organization_id
    INTO v_type
  FROM public.hr_leave_types WHERE id = p_leave_type_id;
  IF NOT FOUND OR v_type.hr_organization_id <> v_org THEN
    RAISE EXCEPTION 'Leave type % does not belong to this employee''s organization',
      p_leave_type_id;
  END IF;
  IF v_type.request_category IS DISTINCT FROM 'leave' THEN
    RAISE EXCEPTION 'Month entries apply to day-based leave only, not %',
      v_type.request_category;
  END IF;

  IF NOT public.role_has_institution_access(v_inst) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %', v_inst;
  END IF;

  SELECT * INTO v_w FROM public.hr_leave_period_window('year', p_hr_academic_year_id, CURRENT_DATE);
  IF v_w.period_start IS NULL THEN
    RAISE EXCEPTION 'Could not resolve the academic year window';
  END IF;
  IF v_m < v_w.period_start OR v_m > v_w.period_end THEN
    RAISE EXCEPTION 'Month % falls outside the academic year (% to %)',
      v_m, v_w.period_start, v_w.period_end;
  END IF;

  -- Same key the balance guard locks on, so a month entry and a leave
  -- submission cannot interleave on one balance.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_employee_id::text || ':' || p_leave_type_id::text || ':bal', 0));

  SELECT e.days, e.added_days INTO v_entry
  FROM public.hr_leave_month_entries e
  WHERE e.employee_id = p_employee_id AND e.leave_type_id = p_leave_type_id
    AND e.hr_academic_year_id = p_hr_academic_year_id AND e.month_start = v_m;
  v_has_entry := FOUND;

  SELECT COALESCE(SUM(public.hr_calc_leave_days(
           a.start_date, a.end_date, a.duration_type,
           COALESCE(v_type.skip_weekends, true), COALESCE(v_type.skip_holidays, true),
           a.hr_organization_id, a.employee_id)), 0)
    INTO v_apps_month
  FROM public.hr_leave_applications a
  WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
    AND a.hr_academic_year_id = p_hr_academic_year_id
    AND a.status = 'approved'
    AND date_trunc('month', a.start_date)::date = v_m;

  -- Whatever the month reads today: the override if one exists, otherwise what
  -- its approved applications come to.
  v_old_total := CASE WHEN v_has_entry THEN v_entry.days ELSE v_apps_month END;

  SELECT COALESCE(used, 0) INTO v_used
  FROM public.hr_leave_balances
  WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
    AND hr_academic_year_id = p_hr_academic_year_id;
  v_used := COALESCE(v_used, 0);

  -- Everything `used` can already account for: overridden months at their
  -- override, every other month at its approved applications.
  SELECT COALESCE(SUM(x.total), 0) INTO v_explained FROM (
    SELECT e.days AS total
      FROM public.hr_leave_month_entries e
     WHERE e.employee_id = p_employee_id AND e.leave_type_id = p_leave_type_id
       AND e.hr_academic_year_id = p_hr_academic_year_id
    UNION ALL
    SELECT public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(v_type.skip_weekends, true), COALESCE(v_type.skip_holidays, true),
             a.hr_organization_id, a.employee_id)
      FROM public.hr_leave_applications a
     WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
       AND a.hr_academic_year_id = p_hr_academic_year_id
       AND a.status = 'approved'
       AND a.start_date BETWEEN v_w.period_start AND v_w.period_end
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_leave_month_entries e2
          WHERE e2.employee_id = p_employee_id AND e2.leave_type_id = p_leave_type_id
            AND e2.hr_academic_year_id = p_hr_academic_year_id
            AND e2.month_start = date_trunc('month', a.start_date)::date)
  ) x;

  v_adjust := GREATEST(0, v_used - v_explained);

  IF p_mode = 'clear' THEN
    IF NOT v_has_entry THEN
      RAISE EXCEPTION 'There is no override on % to remove', v_m;
    END IF;
    v_added := COALESCE(v_entry.added_days, 0);
    DELETE FROM public.hr_leave_month_entries
    WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
      AND hr_academic_year_id = p_hr_academic_year_id AND month_start = v_m;
    -- Give back exactly what add-mode writes put in. Reclassified days were
    -- never added, so they simply return to the unexplained pool.
    IF v_added <> 0 THEN
      UPDATE public.hr_leave_balances
         SET used = GREATEST(0, used - v_added), updated_at = now()
       WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
         AND hr_academic_year_id = p_hr_academic_year_id;
    END IF;
    v_action    := 'clear_month_entry';
    v_new_total := v_apps_month;

  ELSE
    v_new_total := p_days;
    v_increase  := v_new_total - v_old_total;

    IF p_mode = 'reclassify' AND v_increase > v_adjust THEN
      RAISE EXCEPTION
        'Raising % to % needs % more day(s) than the % unexplained day(s) available (used %, already explained %). Use Add instead to record leave that was never captured.',
        v_m, v_new_total, v_increase, v_adjust, v_used, v_explained
        USING ERRCODE = '23514';
    END IF;

    v_added := COALESCE(v_entry.added_days, 0)
             + CASE WHEN p_mode = 'add' THEN v_increase ELSE 0 END;

    INSERT INTO public.hr_leave_month_entries (
      employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
      month_start, days, added_days, reason, created_by)
    VALUES (p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org,
            v_m, v_new_total, v_added, btrim(p_reason), auth.uid())
    ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
    DO UPDATE SET days = EXCLUDED.days, added_days = EXCLUDED.added_days,
                  reason = EXCLUDED.reason, created_by = EXCLUDED.created_by,
                  updated_at = now();

    IF p_mode = 'add' AND v_increase <> 0 THEN
      INSERT INTO public.hr_leave_balances (
        employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
        entitled, used, carried_forward)
      VALUES (p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org,
              NULL, GREATEST(0, v_used + v_increase), 0)
      ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id)
      DO UPDATE SET used = GREATEST(0, public.hr_leave_balances.used + v_increase),
                    updated_at = now();
    END IF;

    v_action := 'set_month_entry';
  END IF;

  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  VALUES (
    p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org, v_action,
    jsonb_build_object('month', v_m, 'total', v_old_total, 'used', v_used,
                       'applications_in_month', v_apps_month),
    jsonb_build_object('month', v_m, 'total', v_new_total, 'mode', p_mode),
    btrim(p_reason), auth.uid());

  RETURN jsonb_build_object(
    'ok', true, 'mode', p_mode, 'month', v_m,
    'total_before', v_old_total, 'total_after', v_new_total,
    'applications_in_month', v_apps_month, 'used_before', v_used);
END;
$function$;

COMMENT ON FUNCTION public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text) IS
  'Set the TOTAL days consumed in one month, overriding what approved applications in that month say. mode=add moves hr_leave_balances.used by the difference; mode=reclassify does not and is capped at the unexplained days; mode=clear removes the override and gives back exactly what add-mode writes contributed. SUPER-ADMIN ONLY.';

REVOKE ALL ON FUNCTION public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The ledger honours the override
--
-- An overridden month contributes ONE consumer sized at the override and its
-- approved applications are excluded -- absorbed, not added. Pending requests
-- are unaffected in every month: they are reservations, never part of `used`.
-- ---------------------------------------------------------------------------
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
  manual_days        numeric,
  is_overridden      boolean,
  applications_days  numeric,
  opening_adjustment numeric,
  drawn_by           jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type      record;
  v_w         record;
  v_ay        uuid;
  v_carry     numeric;
  v_used      numeric;
  v_explained numeric;
  v_adjust    numeric;
BEGIN
  IF NOT public.is_super_admin()
     AND NOT (p_staff_id = ANY (public.fn_my_staff_ids()))
     AND NOT public.user_has_permission('hr.leave.balance.manage'::text)
     AND NOT public.user_has_permission('hr.leave.approve'::text) THEN
    RAISE EXCEPTION 'Not authorized to read this leave ledger';
  END IF;

  SELECT skip_weekends, skip_holidays, request_category INTO v_type
  FROM public.hr_leave_types WHERE id = p_leave_type_id;
  IF NOT FOUND OR v_type.request_category IS DISTINCT FROM 'leave' THEN
    RETURN;
  END IF;

  v_ay := p_hr_academic_year_id;
  IF v_ay IS NULL THEN
    SELECT id INTO v_ay FROM public.hr_academic_years
     WHERE CURRENT_DATE BETWEEN start_date AND end_date
     ORDER BY start_date DESC LIMIT 1;
  END IF;

  SELECT * INTO v_w FROM public.hr_leave_period_window('year', v_ay, CURRENT_DATE);
  IF v_w.period_start IS NULL THEN RETURN; END IF;

  SELECT COALESCE(carried_forward, 0), COALESCE(used, 0) INTO v_carry, v_used
  FROM public.hr_leave_balances
  WHERE employee_id = p_staff_id AND leave_type_id = p_leave_type_id
    AND hr_academic_year_id = v_ay;
  v_carry := COALESCE(v_carry, 0);
  v_used  := COALESCE(v_used, 0);

  RETURN QUERY
  WITH months AS (
    SELECT gs::date AS m,
           LEAST((gs + interval '1 month - 1 day')::date, v_w.period_end) AS m_end
      FROM generate_series(v_w.period_start, v_w.period_end, interval '1 month') gs
  ),
  entries AS (
    SELECT e.id, e.month_start, e.days
      FROM public.hr_leave_month_entries e
     WHERE e.employee_id = p_staff_id AND e.leave_type_id = p_leave_type_id
       AND e.hr_academic_year_id = v_ay
  ),
  all_apps AS (
    SELECT a.id, a.start_date, a.end_date, a.status,
           date_trunc('month', a.start_date)::date AS m,
           public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(v_type.skip_weekends, true), COALESCE(v_type.skip_holidays, true),
             a.hr_organization_id, a.employee_id) AS days
      FROM public.hr_leave_applications a
     WHERE a.employee_id = p_staff_id AND a.leave_type_id = p_leave_type_id
       AND a.hr_academic_year_id = v_ay
       AND a.status IN ('approved', 'pending', 'escalated')
       AND a.start_date BETWEEN v_w.period_start AND v_w.period_end
  ),
  totals AS (
    SELECT
      COALESCE((SELECT SUM(days) FROM entries), 0)
      + COALESCE((SELECT SUM(a.days) FROM all_apps a
                   WHERE a.status = 'approved'
                     AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.month_start = a.m)), 0)
        AS explained
  ),
  events AS (
    -- An override replaces its month's approved requests. ord keeps it ahead of
    -- anything dated the same day, since it is dated to the 1st.
    SELECT e.id, e.month_start AS on_date, NULL::date AS end_date,
           'manual'::text AS status, e.days, 0 AS ord
      FROM entries e WHERE e.days > 0
    UNION ALL
    SELECT a.id, a.start_date, a.end_date, a.status, a.days, 1
      FROM all_apps a
     WHERE a.status <> 'approved'
        OR NOT EXISTS (SELECT 1 FROM entries e WHERE e.month_start = a.m)
  ),
  consumers AS (
    SELECT NULL::uuid AS id, NULL::date AS start_date, NULL::date AS end_date,
           'opening_adjustment'::text AS status,
           0::numeric AS cum_before,
           GREATEST(0, v_used - (SELECT explained FROM totals)) AS cum_after
     WHERE GREATEST(0, v_used - (SELECT explained FROM totals)) > 0
    UNION ALL
    SELECT v.id, v.on_date, v.end_date, v.status,
           GREATEST(0, v_used - (SELECT explained FROM totals))
             + COALESCE(SUM(v.days) OVER (ORDER BY v.on_date, v.ord, v.id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
           GREATEST(0, v_used - (SELECT explained FROM totals))
             + COALESCE(SUM(v.days) OVER (ORDER BY v.on_date, v.ord, v.id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + v.days
      FROM events v
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
           CASE WHEN b.m = v_w.period_start THEN 0
                ELSE v_carry + b.cum_acc_prev END AS lo,
           v_carry + b.cum_acc AS hi
      FROM buckets b
  ),
  cal AS (
    SELECT v.m,
           COALESCE(SUM(v.days) FILTER (WHERE v.status IN ('approved','manual')), 0) AS taken,
           COALESCE(SUM(v.days) FILTER (WHERE v.status IN ('pending','escalated')), 0) AS pend
      FROM (SELECT date_trunc('month', on_date)::date AS m, status, days FROM events) v
     GROUP BY v.m
  ),
  agg AS (
    SELECT r.m, r.m_end, r.accrued_this, r.hi,
           COALESCE(SUM(x.ov) FILTER (WHERE x.status IN ('approved','manual','opening_adjustment')), 0) AS consumed,
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
    SELECT a.*,
           a.hi - (GREATEST(0, v_used - (SELECT explained FROM totals))
                   + COALESCE((SELECT SUM(v.days) FROM events v
                                WHERE v.on_date <= a.m_end), 0)) AS closing
      FROM agg a
  )
  SELECT c.m,
         c.accrued_this,
         COALESCE(LAG(c.closing) OVER (ORDER BY c.m),
                  v_carry - GREATEST(0, v_used - (SELECT explained FROM totals))),
         c.consumed,
         c.reserved,
         c.closing,
         COALESCE(cl.taken, 0),
         COALESCE(cl.pend, 0),
         COALESCE((SELECT e.days FROM entries e WHERE e.month_start = c.m), 0),
         EXISTS (SELECT 1 FROM entries e WHERE e.month_start = c.m),
         COALESCE((SELECT SUM(a.days) FROM all_apps a
                    WHERE a.m = c.m AND a.status = 'approved'), 0),
         GREATEST(0, v_used - (SELECT explained FROM totals)),
         COALESCE(c.drawn, '[]'::jsonb)
    FROM closed c
    LEFT JOIN cal cl ON cl.m = c.m
   ORDER BY c.m;
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) IS
  'Month-by-month leave ledger. is_overridden marks a month whose total was set by an admin; for those months manual_days IS the total and applications_days records what the approved requests would otherwise have contributed. closing_days reconciles to v_hr_leave_balance.available by construction.';

REVOKE ALL ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) TO authenticated, service_role;
