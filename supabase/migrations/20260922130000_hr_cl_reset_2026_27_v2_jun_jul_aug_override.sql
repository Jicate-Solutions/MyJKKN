-- ============================================================================
-- ONE-OFF REPAIR, v2 — Casual Leave consumption, HR year 2026-2027.
-- Created: 2026-09-22. Replaces fn_hr_cl_reset_2026_27 from 20260907140000.
--
-- WHY A v2
-- --------
-- v1 (2026-09-07) charged June and July as month OVERRIDES of one day each and
-- left August un-overridden, capped at one day by rejecting the surplus
-- requests. On 2026-09-16 a "Payroll-verified per Paid Leave Summary Jun-Aug"
-- correction then replaced those defaults for 312 staff (582 entries) with
-- per-sheet figures — June up to 6.5 days, August 191 rows up to 3. HR has
-- since ruled that correction wrong: the policy is ONE day per month, for
-- June, July AND August, for everyone eligible, and any staff member who did
-- not actually take a month's day is corrected one at a time through the
-- Adjust dialog's month editor.
--
-- THE POLICY THIS ENCODES (HR decision, 2026-09-22)
-- -------------------------------------------------
--   June 2026     every eligible staff member consumed that month's accrual -> 1
--   July 2026     same                                                       -> 1
--   August 2026   same                                                       -> 1
--   Sept - May    whatever the approved applications say; NOT touched here
--
-- "Eligible" is unchanged from v1: effective CL entitlement above zero, and
-- staff.date_of_joining before the FIRST OF THE NEXT MONTH — a July joiner is
-- charged July and August, not June. Nobody is charged a month they were not
-- employed to earn.
--
-- WHAT CHANGED FROM v1
-- --------------------
--   * August is now a month OVERRIDE like June and July. An override is the
--     month's TOTAL and absorbs that month's approved requests (20260906130100),
--     so August's 189 approved requests are folded into the one day and are
--     NOT rejected. That is also the only option: August 2026 is a LOCKED
--     attendance period for eight institutions and trg_hla_block_leave_in_
--     locked_period refuses every write to a request touching it, with no
--     super-admin bypass.
--   * No approved request is touched at all — v1's August cap and its
--     "reject CL outside June-August" rule are gone. September consumption
--     (13 approved, 95 pending on 2026-09-22) is real and stays on `used`
--     through the ordinary balance trigger.
--   * Still-PENDING requests dated June-August are rejected where their month
--     is not locked, because hr_trig_update_leave_balance is NOT override-aware:
--     approving one later would add its days to `used` a second time, on top of
--     the override, and the ledger would report it as "Unexplained". A pending
--     request in a locked month cannot be written and is reported instead
--     (one such row exists today: JKKN Main Office, July).
--   * Approved applications outside the overridden months are counted with
--     hr_calc_leave_days(), the SAME function fn_hr_leave_monthly_ledger and
--     hr_leave_month_entry_set use — not hr_leave_applications.total_days,
--     which v1 read. Any drift between the two would land on the ledger as an
--     opening adjustment, which is the figure this function exists to zero.
--
-- WHAT `used` BECOMES
-- -------------------
--   used = june override + july override + august override
--        + approved CL dated outside June-August (hr_calc_leave_days)
--
-- ENTITLEMENT IS NEVER WRITTEN. `entitled` is NULL on most rows, which correctly
-- falls back to the leave type's default of 12 — COALESCE(override, entitled,
-- default). Writing 12 into the column would silently pin those rows.
--
-- RE-RUNNABLE. Every existing CL month entry for the year is cleared and
-- rewritten and `used` is written absolutely, so a second run changes nothing.
-- The payroll-sheet figures it discards survive in hr_leave_balance_adjustments
-- (action 'clear_month_entry', old_value carries the month and total).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_hr_cl_reset_2026_27(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_year_id   uuid;
  v_frozen    timestamptz;
  v_start     date;
  v_end       date;
  v_actor     uuid := auth.uid();
  v_reason    constant text :=
    'CL 2026-27 reset v2: June, July and August charged as that month''s accrual (one day each).';
  v_reject    constant text :=
    'June-August 2026 Casual Leave is recorded as one day per month; this request is absorbed by that record.';
  v_bal       jsonb;
  v_entries   jsonb;
  v_rejects   jsonb;
  v_august    jsonb;
BEGIN
  -- Elevation is the whole point of this function, so the gate is its first
  -- statement. Same key as every other lever in the Adjust dialog.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION
      'Insufficient permission: the Casual Leave reset is restricted to super administrators'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, start_date, end_date, frozen_at
    INTO v_year_id, v_start, v_end, v_frozen
  FROM public.hr_academic_years
  WHERE year_name = '2026-2027';

  IF v_year_id IS NULL THEN
    RAISE EXCEPTION 'HR academic year 2026-2027 does not exist' USING ERRCODE = 'P0001';
  END IF;
  IF v_frozen IS NOT NULL THEN
    RAISE EXCEPTION 'HR academic year 2026-2027 was frozen on %; it can no longer be rewritten.',
      to_char(v_frozen, 'DD Mon YYYY') USING ERRCODE = 'P0001';
  END IF;

  -- ---- 1. Every CL balance row in the year, with its three month targets ---
  -- NOBODY IS CHARGED CL THEY DO NOT HAVE. A row whose effective entitlement is
  -- zero gets no charge at all. Effective entitlement is COALESCE(override,
  -- balances.entitled, type default) — the same ladder the balance screens
  -- resolve; one Dental row carries entitled = 0 AND a per-staff override of
  -- 12, and the override wins.
  CREATE TEMP TABLE _cl_target ON COMMIT DROP AS
  SELECT
    b.employee_id,
    b.leave_type_id,
    b.hr_organization_id,
    b.used AS used_now,
    (CASE WHEN ent.days > 0 AND s.date_of_joining < DATE '2026-07-01'
          THEN 1 ELSE 0 END)::numeric AS jun_days,
    (CASE WHEN ent.days > 0 AND s.date_of_joining < DATE '2026-08-01'
          THEN 1 ELSE 0 END)::numeric AS jul_days,
    (CASE WHEN ent.days > 0 AND s.date_of_joining < DATE '2026-09-01'
          THEN 1 ELSE 0 END)::numeric AS aug_days,
    t.skip_weekends,
    t.skip_holidays
  FROM public.hr_leave_balances b
  JOIN public.staff s          ON s.id = b.employee_id
  JOIN public.hr_leave_types t ON t.id = b.leave_type_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (SELECT o.entitled_days
         FROM public.hr_leave_entitlement_overrides o
        WHERE o.employee_id         = b.employee_id
          AND o.leave_type_id       = b.leave_type_id
          AND o.hr_academic_year_id = b.hr_academic_year_id),
      b.entitled,
      t.default_entitled_days,
      0) AS days
  ) ent
  WHERE b.hr_academic_year_id = v_year_id
    AND t.leave_type_code = 'CL';

  -- ---- 2. Approved CL OUTSIDE the overridden months --------------------------
  -- KEYED ON (employee, leave type), NOT ON THE EMPLOYEE: 29 staff hold a CL
  -- row at a second institution, and summing by employee alone would credit
  -- one person's September day to every one of their rows.
  --
  -- hr_calc_leave_days, not total_days — see the header.
  CREATE TEMP TABLE _other_approved ON COMMIT DROP AS
  SELECT a.employee_id, a.leave_type_id,
         SUM(public.hr_calc_leave_days(
               a.start_date, a.end_date, a.duration_type,
               COALESCE(c.skip_weekends, true), COALESCE(c.skip_holidays, true),
               a.hr_organization_id, a.employee_id)) AS days
  FROM public.hr_leave_applications a
  JOIN _cl_target c ON c.employee_id = a.employee_id AND c.leave_type_id = a.leave_type_id
  WHERE a.hr_academic_year_id = v_year_id
    AND a.status = 'approved'
    AND a.start_date BETWEEN v_start AND v_end
    AND (a.start_date < DATE '2026-06-01' OR a.start_date >= DATE '2026-09-01')
  GROUP BY a.employee_id, a.leave_type_id;

  -- ---- 3. Pending June-August requests: absorbed, so rejected -------------
  CREATE TEMP TABLE _pending ON COMMIT DROP AS
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.total_days, a.status
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types t ON t.id = a.leave_type_id
  WHERE t.leave_type_code = 'CL'
    AND a.hr_academic_year_id = v_year_id
    AND a.start_date >= DATE '2026-06-01'
    AND a.start_date <  DATE '2026-09-01'
    AND a.status IN ('pending', 'escalated');

  -- A locked attendance month refuses every write to a request touching it,
  -- with no super-admin escape (hr_trig_block_leave_in_locked_period). Find
  -- them FIRST so a locked institution is a reported skip and not an abort.
  CREATE TEMP TABLE _blocked ON COMMIT DROP AS
  SELECT DISTINCT p.id
  FROM _pending p
  JOIN public.staff s ON s.id = p.employee_id
  JOIN public.hr_attendance_periods ap
    ON ap.institution_id = s.institution_id
   AND ap.status = 'locked'
   AND make_date(ap.period_year, ap.period_month, 1) <= p.end_date
   AND (make_date(ap.period_year, ap.period_month, 1) + INTERVAL '1 month')::date > p.start_date;

  -- ---- 4. Summaries (identical in dry-run and live) ------------------------
  SELECT jsonb_build_object(
           'rows',        COUNT(*),
           'unchanged',   COUNT(*) FILTER (WHERE used_now = target),
           'increased',   COUNT(*) FILTER (WHERE target > used_now),
           'decreased',   COUNT(*) FILTER (WHERE target < used_now),
           'used_before', COALESCE(SUM(used_now), 0),
           'used_after',  COALESCE(SUM(target), 0))
    INTO v_bal
  FROM (
    SELECT c.used_now,
           c.jun_days + c.jul_days + c.aug_days
             + COALESCE((SELECT oa.days FROM _other_approved oa
                          WHERE oa.employee_id = c.employee_id
                            AND oa.leave_type_id = c.leave_type_id), 0) AS target
    FROM _cl_target c
  ) x;

  SELECT jsonb_build_object(
           'cleared', (SELECT COUNT(*) FROM public.hr_leave_month_entries e
                       JOIN public.hr_leave_types t ON t.id = e.leave_type_id
                       WHERE e.hr_academic_year_id = v_year_id AND t.leave_type_code = 'CL'),
           'payroll_verified_cleared',
                      (SELECT COUNT(*) FROM public.hr_leave_month_entries e
                       JOIN public.hr_leave_types t ON t.id = e.leave_type_id
                       WHERE e.hr_academic_year_id = v_year_id AND t.leave_type_code = 'CL'
                         AND e.reason ILIKE 'Payroll-verified%'),
           'written', (SELECT COUNT(*) FILTER (WHERE jun_days > 0)
                            + COUNT(*) FILTER (WHERE jul_days > 0)
                            + COUNT(*) FILTER (WHERE aug_days > 0) FROM _cl_target))
    INTO v_entries;

  SELECT jsonb_build_object(
           'pending', (SELECT COUNT(*) FROM _pending p
                       WHERE NOT EXISTS (SELECT 1 FROM _blocked b WHERE b.id = p.id)),
           'blocked_by_locked_period', (SELECT COUNT(*) FROM _blocked))
    INTO v_rejects;

  SELECT jsonb_build_object(
           'approved_requests_absorbed', COUNT(*),
           'approved_days_absorbed',     COALESCE(SUM(a.total_days), 0))
    INTO v_august
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types t ON t.id = a.leave_type_id
  WHERE t.leave_type_code = 'CL'
    AND a.hr_academic_year_id = v_year_id
    AND a.status = 'approved'
    AND a.start_date >= DATE '2026-08-01'
    AND a.start_date <  DATE '2026-09-01';

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'academic_year', '2026-2027', 'version', 2,
      'balances', v_bal, 'month_entries', v_entries, 'rejections', v_rejects,
      'august', v_august);
  END IF;

  -- ---- 5. Reject pending, FIRST --------------------------------------------
  -- Nothing here was approved, so trg_hla_balance_update leaves `used` alone;
  -- kept ahead of the absolute write in step 7 on principle, as in v1.
  UPDATE public.hr_leave_applications a
     SET status           = 'rejected',
         rejection_reason = v_reject,
         updated_at       = now()
    FROM _pending p
   WHERE a.id = p.id
     AND NOT EXISTS (SELECT 1 FROM _blocked b WHERE b.id = p.id);

  -- ---- 6. Month overrides --------------------------------------------------
  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT e.employee_id, e.leave_type_id, v_year_id, e.hr_organization_id,
         'clear_month_entry',
         jsonb_build_object('month', e.month_start, 'total', e.days,
                            'evidence_dates', to_jsonb(e.evidence_dates),
                            'previous_reason', e.reason),
         jsonb_build_object('month', e.month_start, 'total', 0),
         v_reason, v_actor
  FROM public.hr_leave_month_entries e
  JOIN public.hr_leave_types t ON t.id = e.leave_type_id
  WHERE e.hr_academic_year_id = v_year_id AND t.leave_type_code = 'CL';

  DELETE FROM public.hr_leave_month_entries e
  USING public.hr_leave_types t
  WHERE t.id = e.leave_type_id
    AND e.hr_academic_year_id = v_year_id
    AND t.leave_type_code = 'CL';

  -- added_days RECORDS WHAT THIS ENTRY PUT INTO `used`, and step 7 puts all of
  -- it there — so it is the day itself. `clear` in the Adjust dialog refunds
  -- exactly added_days; a zero here would leave one unexplained day behind
  -- every removed override (the v1 bug, fixed in 20260907140000).
  INSERT INTO public.hr_leave_month_entries (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    month_start, days, added_days, evidence_dates, reason, created_by)
  SELECT c.employee_id, c.leave_type_id, v_year_id, c.hr_organization_id,
         m.month_start, m.days, m.days, NULL, v_reason, v_actor
  FROM _cl_target c
  CROSS JOIN LATERAL (
    VALUES (DATE '2026-06-01', c.jun_days),
           (DATE '2026-07-01', c.jul_days),
           (DATE '2026-08-01', c.aug_days)
  ) AS m(month_start, days)
  WHERE m.days > 0;

  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT c.employee_id, c.leave_type_id, v_year_id, c.hr_organization_id,
         'set_month_entry',
         jsonb_build_object('month', m.month_start),
         jsonb_build_object('month', m.month_start, 'total', m.days, 'mode', 'reset'),
         v_reason, v_actor
  FROM _cl_target c
  CROSS JOIN LATERAL (
    VALUES (DATE '2026-06-01', c.jun_days),
           (DATE '2026-07-01', c.jul_days),
           (DATE '2026-08-01', c.aug_days)
  ) AS m(month_start, days)
  WHERE m.days > 0;

  -- ---- 7. `used`, absolutely ----------------------------------------------
  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT c.employee_id, c.leave_type_id, v_year_id, c.hr_organization_id,
         'set_used',
         jsonb_build_object('used', c.used_now),
         jsonb_build_object('used', c.jun_days + c.jul_days + c.aug_days
           + COALESCE((SELECT oa.days FROM _other_approved oa
                        WHERE oa.employee_id = c.employee_id
                          AND oa.leave_type_id = c.leave_type_id), 0)),
         v_reason, v_actor
  FROM _cl_target c
  WHERE c.used_now IS DISTINCT FROM (c.jun_days + c.jul_days + c.aug_days
    + COALESCE((SELECT oa.days FROM _other_approved oa
                 WHERE oa.employee_id = c.employee_id
                   AND oa.leave_type_id = c.leave_type_id), 0));

  UPDATE public.hr_leave_balances b
     SET used = c.jun_days + c.jul_days + c.aug_days
              + COALESCE((SELECT oa.days FROM _other_approved oa
                           WHERE oa.employee_id = c.employee_id
                             AND oa.leave_type_id = c.leave_type_id), 0),
         updated_at = now()
    FROM _cl_target c
   WHERE b.employee_id         = c.employee_id
     AND b.leave_type_id       = c.leave_type_id
     AND b.hr_academic_year_id = v_year_id;

  RETURN jsonb_build_object(
    'dry_run', false, 'academic_year', '2026-2027', 'version', 2,
    'balances', v_bal, 'month_entries', v_entries, 'rejections', v_rejects,
    'august', v_august);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_cl_reset_2026_27(boolean) IS
  'One-off repair (v2, 2026-09-22) of Casual Leave consumption for HR year 2026-2027: June, July '
  'and August charged as one-day month overrides for every eligible staff member; every existing '
  'CL month entry replaced; approved requests never touched. Super-admin only. p_dry_run defaults '
  'to true. See the migration header for the policy it encodes.';

-- Supabase grants EXECUTE to anon and authenticated on every new function, and
-- a later CREATE OR REPLACE silently re-grants it. Close it explicitly.
REVOKE ALL ON FUNCTION public.fn_hr_cl_reset_2026_27(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_cl_reset_2026_27(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_cl_reset_2026_27(boolean) TO authenticated;
