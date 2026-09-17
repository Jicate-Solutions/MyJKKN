-- ============================================================================
-- Casual Leave month overrides gain an optional EVIDENCE DATE.
-- Created: 2026-09-16.
--
-- WHY
-- ---
-- An overridden month (hr_leave_month_entries) always rendered as "Recorded by
-- admin (N)" in the ledger, with no date attached, even when the override was
-- actually backed by a real biometric LOP day. That label is indistinguishable
-- from a pure guess, which is exactly the complaint that drove this migration:
-- HR is correcting Casual Leave for Jun-Aug 2026 against payroll-verified
-- figures, and where a specific LOP-marked attendance day supports the number,
-- that day should show instead of an anonymous admin label.
--
-- Real dated hr_leave_applications rows are NOT a safe substitute here:
--   - August 2026 is a LOCKED attendance period for at least one institution
--     already, and hr_trig_block_leave_in_locked_period refuses ANY write to
--     hr_leave_applications touching a locked month, unconditionally, with no
--     super-admin bypass.
--   - hr_trig_leave_enforce_balance routinely refuses backdated corrections
--     that exceed simple month-by-month accrual, which is the whole reason
--     these months need correcting in the first place.
-- The override table (hr_leave_month_entries) is not gated by either trigger,
-- which is why the 2026-09-07 CL reset (20260907140000) used it instead of
-- applications for June and July. This migration keeps that same safe path and
-- only adds a way to remember WHICH day evidenced the override, for display.
--
-- WHAT CHANGES
-- ------------
--   1. hr_leave_month_entries gains a nullable evidence_date, constrained to
--      fall inside the entry's own month. NULL is the common case and means
--      exactly what "Recorded by admin" already means today: no specific date
--      to point to.
--   2. hr_leave_month_entry_set gains an optional p_evidence_date parameter
--      (trailing, defaulted, so every existing caller is unaffected) so this
--      is usable from the Adjust dialog for future manual corrections too, not
--      only this one-off.
--   3. fn_hr_leave_monthly_ledger emits the evidence date (falling back to the
--      1st of the month, today's behaviour) as the manual event's date, so the
--      UI can tell the two cases apart.
--   4. components/hr/leave-monthly-ledger.tsx (application-layer change, not
--      in this file) stops saying "Recorded by admin" when a real date is
--      present.
-- ============================================================================

-- ---- 1. Column + constraint --------------------------------------------------
ALTER TABLE public.hr_leave_month_entries
  ADD COLUMN evidence_date date NULL;

ALTER TABLE public.hr_leave_month_entries
  ADD CONSTRAINT hr_leave_month_entries_evidence_date_in_month
  CHECK (
    evidence_date IS NULL
    OR (evidence_date >= month_start
        AND evidence_date < (month_start + INTERVAL '1 month')::date)
  );

COMMENT ON COLUMN public.hr_leave_month_entries.evidence_date IS
  'Optional real date (e.g. a biometric LOP day) this override is evidenced by. '
  'NULL means the total is an admin judgement call with no specific day behind '
  'it -- the ledger shows "Recorded by admin" for those, and the real date for '
  'the rest.';

-- ---- 2. hr_leave_month_entry_set: accept and store it ------------------------
CREATE OR REPLACE FUNCTION public.hr_leave_month_entry_set(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_hr_academic_year_id uuid,
  p_month_start date,
  p_days numeric,
  p_mode text,
  p_reason text,
  p_evidence_date date DEFAULT NULL
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
  IF p_evidence_date IS NOT NULL
     AND (p_evidence_date < v_m OR p_evidence_date >= (v_m + INTERVAL '1 month')::date) THEN
    RAISE EXCEPTION 'Evidence date % does not fall inside %', p_evidence_date, v_m;
  END IF;

  IF NOT (public.is_super_admin()
          OR public.user_has_permission('hr.leave.balance.adjust')) THEN
    RAISE EXCEPTION
      'Insufficient permission: correcting a leave balance needs hr.leave.balance.adjust';
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
      month_start, days, added_days, evidence_date, reason, created_by)
    VALUES (p_employee_id, p_leave_type_id, p_hr_academic_year_id, v_org,
            v_m, v_new_total, v_added, p_evidence_date, btrim(p_reason), auth.uid())
    ON CONFLICT (employee_id, leave_type_id, hr_academic_year_id, month_start)
    DO UPDATE SET days = EXCLUDED.days, added_days = EXCLUDED.added_days,
                  evidence_date = EXCLUDED.evidence_date,
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
    jsonb_build_object('month', v_m, 'total', v_new_total, 'mode', p_mode,
                       'evidence_date', p_evidence_date),
    btrim(p_reason), auth.uid());

  RETURN jsonb_build_object(
    'ok', true, 'mode', p_mode, 'month', v_m,
    'total_before', v_old_total, 'total_after', v_new_total,
    'applications_in_month', v_apps_month, 'used_before', v_used);
END;
$function$;

-- Supabase re-grants EXECUTE to anon/authenticated on every CREATE OR REPLACE.
REVOKE ALL ON FUNCTION public.hr_leave_month_entry_set(
  uuid, uuid, uuid, date, numeric, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_leave_month_entry_set(
  uuid, uuid, uuid, date, numeric, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_month_entry_set(
  uuid, uuid, uuid, date, numeric, text, text, date) TO authenticated;

-- ---- 3. fn_hr_leave_monthly_ledger: surface the evidence date ----------------
-- Only two lines differ from the previous version (20260906130100): the
-- `entries` CTE now selects evidence_date, and the manual branch of `events`
-- dates itself at COALESCE(evidence_date, month_start) instead of always
-- month_start. Everything downstream (drawn_by's start_date) already just
-- passes that date through, so no other clause changes.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_monthly_ledger(p_staff_id uuid, p_leave_type_id uuid, p_hr_academic_year_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(month_start date, accrued_days numeric, opening_days numeric, consumed_days numeric, reserved_days numeric, closing_days numeric, taken_in_month numeric, pending_in_month numeric, manual_days numeric, is_overridden boolean, applications_days numeric, opening_adjustment numeric, drawn_by jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
    SELECT e.id, e.month_start, e.days, e.evidence_date
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
    -- anything dated the same day, since it is dated to the 1st (or its
    -- evidence date, when one is on record).
    SELECT e.id, COALESCE(e.evidence_date, e.month_start) AS on_date,
           NULL::date AS end_date, 'manual'::text AS status, e.days, 0 AS ord
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

REVOKE ALL ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_monthly_ledger(uuid, uuid, uuid) TO authenticated;
