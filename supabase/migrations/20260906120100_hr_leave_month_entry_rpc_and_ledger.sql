-- ============================================================================
-- WRITING A MONTH ENTRY, AND THE LEDGER LEARNING TO READ ONE (2026-09-06)
--
-- TWO MODES, BECAUSE THERE ARE TWO DIFFERENT PROBLEMS.
--
--   add         -- the leave happened and was never captured anywhere.
--                  `used` goes UP by the delta.
--   reclassify  -- the days are ALREADY counted in `used` (legacy backfill, or
--                  an earlier Adjust-dialog correction) and merely sit in the
--                  wrong months. `used` does not move; the entry only says
--                  where they belong.
--
-- Getting this wrong in either direction corrupts the balance: reclassifying
-- with `add` semantics double-counts 232 staff, and adding with `reclassify`
-- semantics records leave that never reduces anyone's balance.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hr_leave_month_entry_set(
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
  v_org      uuid;
  v_inst     uuid;
  v_type     record;
  v_w        record;
  v_old      numeric := 0;
  v_used     numeric := 0;
  v_app      numeric := 0;
  v_others   numeric := 0;
  v_room     numeric;
  v_delta    numeric;
  v_action   text;
BEGIN
  IF p_mode NOT IN ('add', 'reclassify') THEN
    RAISE EXCEPTION 'Unknown mode % (expected add or reclassify)', p_mode;
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required for every balance adjustment';
  END IF;
  IF p_days IS NULL OR p_days < 0 THEN
    RAISE EXCEPTION 'Days must be zero or more';
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

  -- Comp off is credit-backed and short time off is minute-backed; neither
  -- draws on a day entitlement, so a "days taken" entry against them would be
  -- recorded and then read by nothing.
  IF v_type.request_category IS DISTINCT FROM 'leave' THEN
    RAISE EXCEPTION 'Month entries apply to day-based leave only, not %',
      v_type.request_category;
  END IF;

  -- A permission check is never a tenant boundary.
  IF NOT public.role_has_institution_access(v_inst) THEN
    RAISE EXCEPTION 'Access denied: you do not have access to institution %', v_inst;
  END IF;

  -- The same key that guards writing `used` directly on the Used days tab --
  -- this moves the same number, so it must not be reachable by a wider set.
  IF NOT public.user_has_permission('hr.leave.policies.write') THEN
    RAISE EXCEPTION
      'Insufficient permission: hr.leave.policies.write required to record taken days';
  END IF;

  SELECT * INTO v_w FROM public.hr_leave_period_window('year', p_hr_academic_year_id, CURRENT_DATE);
  IF v_w.period_start IS NULL THEN
    RAISE EXCEPTION 'Could not resolve the academic year window';
  END IF;
  IF p_month_start < v_w.period_start OR p_month_start > v_w.period_end THEN
    RAISE EXCEPTION 'Month % falls outside the academic year (% to %)',
      p_month_start, v_w.period_start, v_w.period_end;
  END IF;

  -- Serialised per (employee, type) on the SAME key the balance guard uses, so
  -- a month entry and a leave submission cannot interleave on one balance.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_employee_id::text || ':' || p_leave_type_id::text || ':bal', 0));

  SELECT COALESCE(days, 0) INTO v_old
  FROM public.hr_leave_month_entries
  WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
    AND hr_academic_year_id = p_hr_academic_year_id
    AND month_start = date_trunc('month', p_month_start)::date;
  v_old := COALESCE(v_old, 0);

  SELECT COALESCE(used, 0) INTO v_used
  FROM public.hr_leave_balances
  WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
    AND hr_academic_year_id = p_hr_academic_year_id;
  v_used := COALESCE(v_used, 0);

  IF p_mode = 'reclassify' THEN
    -- How much of `used` is not yet explained by an application or another
    -- month entry. Reclassifying beyond it would make attributed consumption
    -- exceed `used`, which silently breaks the ledger's reconciliation to
    -- v_hr_leave_balance.available -- the property the whole screen rests on.
    SELECT COALESCE(SUM(public.hr_calc_leave_days(
             a.start_date, a.end_date, a.duration_type,
             COALESCE(v_type.skip_weekends, true), COALESCE(v_type.skip_holidays, true),
             a.hr_organization_id, a.employee_id)), 0)
      INTO v_app
    FROM public.hr_leave_applications a
    WHERE a.employee_id = p_employee_id AND a.leave_type_id = p_leave_type_id
      AND a.hr_academic_year_id = p_hr_academic_year_id
      AND a.status = 'approved'
      AND a.start_date BETWEEN v_w.period_start AND v_w.period_end;

    SELECT COALESCE(SUM(days), 0) INTO v_others
    FROM public.hr_leave_month_entries
    WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
      AND hr_academic_year_id = p_hr_academic_year_id
      AND month_start <> date_trunc('month', p_month_start)::date;

    v_room := v_used - v_app - v_others;

    IF p_days > v_room THEN
      RAISE EXCEPTION
        'Only % unexplained day(s) remain to reclassify (used %, applications %, other months %). Use Add instead to record leave that was never captured.',
        GREATEST(v_room, 0), v_used, v_app, v_others
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_days = 0 THEN
    DELETE FROM public.hr_leave_month_entries
    WHERE employee_id = p_employee_id AND leave_type_id = p_leave_type_id
      AND hr_academic_year_id = p_hr_academic_year_id
      AND month_start = date_trunc('month', p_month_start)::date;
    v_action := 'clear_month_entry';
  ELSE
    INSERT INTO public.hr_leave_month_entries (
      employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
      month_start, days, reason, created_by)
    VALUES (p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org,
            date_trunc('month', p_month_start)::date, p_days, btrim(p_reason), auth.uid())
    ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
    DO UPDATE SET days = EXCLUDED.days, reason = EXCLUDED.reason,
                  created_by = EXCLUDED.created_by, updated_at = now();
    v_action := 'set_month_entry';
  END IF;

  -- add moves the year total; reclassify explains days already in it.
  IF p_mode = 'add' THEN
    v_delta := p_days - v_old;
    IF v_delta <> 0 THEN
      INSERT INTO public.hr_leave_balances (
        employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
        entitled, used, carried_forward)
      VALUES (p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org,
              NULL, GREATEST(0, v_used + v_delta), 0)
      ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id)
      DO UPDATE SET used = GREATEST(0, public.hr_leave_balances.used + v_delta),
                    updated_at = now();
    END IF;
  END IF;

  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  VALUES (
    p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org, v_action,
    jsonb_build_object('month', p_month_start, 'days', v_old, 'used', v_used),
    jsonb_build_object('month', p_month_start, 'days', p_days, 'mode', p_mode),
    btrim(p_reason), auth.uid());

  RETURN jsonb_build_object(
    'ok', true, 'mode', p_mode, 'month', p_month_start,
    'days_before', v_old, 'days_after', p_days,
    'used_before', v_used,
    'used_after', CASE WHEN p_mode = 'add'
                       THEN GREATEST(0, v_used + (p_days - v_old)) ELSE v_used END);
END;
$function$;

COMMENT ON FUNCTION public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text) IS
  'Record days taken in one month with no application behind them. mode=add raises hr_leave_balances.used by the delta; mode=reclassify leaves it alone and is capped at the days not yet explained by applications or other months. Days of 0 delete the entry. Balance-only: no attendance is stamped.';

REVOKE ALL ON FUNCTION public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_month_entry_set(uuid, uuid, uuid, date, numeric, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The ledger reads month entries as dated consumption
--
-- They join the FIFO walk positioned at month_start, so a day recorded in July
-- draws on July's credit (or on whatever earlier month still had room) exactly
-- as a July request would. The opening adjustment shrinks by whatever the
-- entries now explain -- which is the entire point of reclassify mode.
--
-- DROP + CREATE because the return type gains manual_days. That takes the ACL
-- with it, so the REVOKE/GRANT pair below is load-bearing: a new function is
-- EXECUTE-able by PUBLIC, and PUBLIC includes anon.
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
  v_manual numeric;
  v_adjust numeric;
BEGIN
  -- hr.leave.balance.manage is held by 7 roles and hr.leave.approve by 2.
  -- Gating on approve alone would refuse five of the seven roles that can open
  -- the Adjust dialog this function fills.
  IF NOT public.is_super_admin()
     AND NOT (p_staff_id = ANY (public.fn_my_staff_ids()))
     AND NOT public.user_has_permission('hr.leave.balance.manage'::text)
     AND NOT public.user_has_permission('hr.leave.approve'::text) THEN
    RAISE EXCEPTION 'Not authorized to read this leave ledger';
  END IF;

  SELECT skip_weekends, skip_holidays, request_category
    INTO v_type
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

  SELECT COALESCE(carried_forward, 0), COALESCE(used, 0)
    INTO v_carry, v_used
  FROM public.hr_leave_balances
  WHERE employee_id = p_staff_id AND leave_type_id = p_leave_type_id
    AND hr_academic_year_id = v_ay;
  v_carry := COALESCE(v_carry, 0);
  v_used  := COALESCE(v_used, 0);

  SELECT COALESCE(SUM(public.hr_calc_leave_days(
           a.start_date, a.end_date, a.duration_type,
           COALESCE(v_type.skip_weekends, true), COALESCE(v_type.skip_holidays, true),
           a.hr_organization_id, a.employee_id)), 0)
    INTO v_app
  FROM public.hr_leave_applications a
  WHERE a.employee_id = p_staff_id AND a.leave_type_id = p_leave_type_id
    AND a.hr_academic_year_id = v_ay AND a.status = 'approved'
    AND a.start_date BETWEEN v_w.period_start AND v_w.period_end;

  SELECT COALESCE(SUM(days), 0) INTO v_manual
  FROM public.hr_leave_month_entries
  WHERE employee_id = p_staff_id AND leave_type_id = p_leave_type_id
    AND hr_academic_year_id = v_ay;

  -- What `used` still does not explain once applications AND recorded months
  -- are accounted for. Shrinks to zero as an admin reclassifies the legacy
  -- figure month by month.
  v_adjust := GREATEST(0, v_used - v_app - v_manual);

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
     WHERE a.employee_id = p_staff_id AND a.leave_type_id = p_leave_type_id
       AND a.hr_academic_year_id = v_ay
       AND a.status IN ('approved', 'pending', 'escalated')
       AND a.start_date BETWEEN v_w.period_start AND v_w.period_end
  ),
  entries AS (
    SELECT e.id, e.month_start, e.days, e.reason
      FROM public.hr_leave_month_entries e
     WHERE e.employee_id = p_staff_id AND e.leave_type_id = p_leave_type_id
       AND e.hr_academic_year_id = v_ay
  ),
  events AS (
    -- ord orders a manual entry BEFORE a request dated the same day: the entry
    -- is dated to the 1st and represents older, previously unrecorded leave.
    SELECT e.id, e.month_start AS on_date, NULL::date AS end_date,
           'manual'::text AS status, e.days, 0 AS ord
      FROM entries e
    UNION ALL
    SELECT a.id, a.start_date, a.end_date, a.status, a.days, 1
      FROM apps a
  ),
  consumers AS (
    SELECT NULL::uuid AS id, NULL::date AS start_date, NULL::date AS end_date,
           'opening_adjustment'::text AS status,
           0::numeric AS cum_before, v_adjust AS cum_after
     WHERE v_adjust > 0
    UNION ALL
    SELECT v.id, v.on_date, v.end_date, v.status,
           v_adjust + COALESCE(SUM(v.days) OVER (ORDER BY v.on_date, v.ord, v.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
           v_adjust + COALESCE(SUM(v.days) OVER (ORDER BY v.on_date, v.ord, v.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + v.days
      FROM events v
  ),
  cal AS (
    -- Calendar view. A manual entry IS leave taken in that month, so it counts
    -- toward taken_in_month; manual_days breaks out how much of that figure has
    -- no request behind it and is therefore editable here.
    SELECT v.on_date AS m,
           COALESCE(SUM(v.days) FILTER (WHERE v.status IN ('approved','manual')), 0) AS taken,
           COALESCE(SUM(v.days) FILTER (WHERE v.status IN ('pending','escalated')), 0) AS pend,
           COALESCE(SUM(v.days) FILTER (WHERE v.status = 'manual'), 0) AS manual
      FROM (SELECT date_trunc('month', on_date)::date AS on_date, status, days FROM events) v
     GROUP BY v.on_date
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
    SELECT a.m, a.m_end, a.accrued_this, a.hi, a.consumed, a.reserved, a.drawn,
           a.hi - (v_adjust + COALESCE((SELECT SUM(v.days) FROM events v
                                         WHERE v.on_date <= a.m_end), 0)) AS closing
      FROM agg a
  )
  SELECT c.m,
         c.accrued_this,
         COALESCE(LAG(c.closing) OVER (ORDER BY c.m), v_carry - v_adjust),
         c.consumed,
         c.reserved,
         c.closing,
         COALESCE(cl.taken, 0),
         COALESCE(cl.pend, 0),
         COALESCE(cl.manual, 0),
         v_adjust,
         COALESCE(c.drawn, '[]'::jsonb)
    FROM closed c
    LEFT JOIN cal cl ON cl.m = c.m
   ORDER BY c.m;
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) IS
  'Month-by-month leave ledger for one staff member and day-leave type. consumed/reserved say which month''s credit paid for a request (FIFO, oldest first); taken_in_month/pending_in_month say when it was taken; manual_days is the part recorded by an admin with no application behind it. opening_adjustment is what `used` still does not explain. closing_days reconciles to v_hr_leave_balance.available by construction.';

REVOKE ALL ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) TO authenticated, service_role;
