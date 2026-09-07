-- ============================================================================
-- ONE-OFF REPAIR — Casual Leave consumption, HR year 2026-2027.
-- Created: 2026-09-07.
--
-- WHY
-- ---
-- CL became a real 1-day-a-month accrual on 2026-09-05 (see
-- 20260905120000). The balances it inherited never matched: on 2026-09-07,
-- 298 of 776 CL rows carried a `used` figure higher than their approved
-- applications, and 232 carried `used` > 0 with no application at all — the
-- June legacy backfill plus Adjust-dialog corrections that write `used` and
-- create nothing to explain it.
--
-- fn_hr_leave_monthly_ledger treats `used` as the authority and books the
-- unexplained remainder as an OPENING ADJUSTMENT at cumulative position 0.
-- That is why the Adjust dialog opens June at -1.5 and every later month
-- inherits it: the arithmetic is right, the input is not.
--
-- THE POLICY THIS ENCODES (HR decision, 2026-09-07)
-- -------------------------------------------------
--   June 2026    every eligible staff member consumed that month's accrual  -> 1
--   July 2026    same                                                        -> 1
--   August 2026  at most ONE day; every further request is rejected
--   Sept - May   no consumption; approved CL there is rejected
--
-- "Eligible" is by date_of_joining: someone who joined in July gets July but
-- not June, someone who joined in August gets neither. You cannot consume a
-- month's credit you were never employed to earn — and a staff member whose
-- effective entitlement is ZERO is charged nothing at all.
--
-- June and July are written as MONTH OVERRIDES, not as applications. An
-- override is the month's TOTAL and absorbs that month's approved requests
-- rather than adding to them (20260906130000), so July's 14 approved requests
-- are folded in and never touched. That is deliberate and load-bearing:
-- trg_hla_block_leave_in_locked_period has NO super-admin bypass, and JKKN
-- Main Office's July is locked. Overriding the month sidesteps it entirely.
--
-- AUGUST IS NOT OVERRIDDEN. It reads naturally from its surviving approved
-- request, so `used` keeps moving correctly when HR later decides one of the
-- pending August requests. Only a month whose truth is a policy declaration
-- rather than a request gets an override.
--
-- WHAT `used` BECOMES
-- -------------------
--   used = june override + july override + approved CL in every other month
--
-- which is exactly hr_leave_month_entry_set's own "explained" formula, so the
-- opening adjustment lands on ZERO and the ledger stops disagreeing with the
-- balance.
--
-- ENTITLEMENT IS NEVER WRITTEN. `entitled` is NULL on 753 of 776 rows, which
-- correctly falls back to the leave type's default of 12 — COALESCE(override,
-- entitled, default). Writing 12 into the column would look identical today
-- and silently pin those rows if the policy ever changes.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- Rejecting an already-approved leave does NOT un-stamp attendance:
-- fn_recompute_attendance_on_leave_approval fires only on the transition TO
-- approved. Days already stamped LEAVE/HALF_DAY behind a rejected request stay
-- stamped, and the Salary Register keeps paying them. The function REPORTS
-- them in `attendance_followup` — re-run the August attendance recompute
-- before closing the month.
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
    'CL 2026-27 reset: June and July charged as that month''s accrual; August capped at one day.';
  v_bal       jsonb;
  v_entries   jsonb;
  v_rejects   jsonb;
  v_followup  jsonb;
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

  -- ---- 1. Every CL balance row in the year, with its month targets ---------
  -- NOBODY IS CHARGED CL THEY DO NOT HAVE. A row whose effective entitlement is
  -- zero gets no June or July charge, so its `used` settles at whatever its own
  -- approved applications come to — zero for all 11 such rows today. Charging
  -- them the monthly accrual would put their balance at -2 for leave they were
  -- never granted.
  --
  -- Effective entitlement is COALESCE(override, balances.entitled, type
  -- default) — the same ladder the balance screens resolve. The order matters:
  -- one Dental row carries entitled = 0 AND a per-staff override of 12, and the
  -- override wins, so reading balances.entitled alone would wrongly exempt them.
  CREATE TEMP TABLE _cl_target ON COMMIT DROP AS
  SELECT
    b.employee_id,
    b.leave_type_id,
    b.hr_organization_id,
    b.used AS used_now,
    (CASE WHEN ent.days > 0 AND s.date_of_joining < DATE '2026-07-01'
          THEN 1 ELSE 0 END)::numeric AS jun_days,
    (CASE WHEN ent.days > 0 AND s.date_of_joining < DATE '2026-08-01'
          THEN 1 ELSE 0 END)::numeric AS jul_days
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

  -- ---- 2. August: the ONE DAY each person keeps ---------------------------
  -- A RUNNING TOTAL in date order, not "the earliest request". The cap is one
  -- DAY, and two half-day requests come to exactly one day — keeping only the
  -- first would reject 5 requests that are inside the limit. Somebody whose
  -- earliest request is already 2 days keeps nothing: their running total is
  -- over the cap on the first row, and shortening a request the staff member
  -- submitted would rewrite their words, so it is rejected whole.
  CREATE TEMP TABLE _aug ON COMMIT DROP AS
  SELECT a.id, a.employee_id, a.leave_type_id, a.start_date, a.end_date, a.total_days,
         a.status, a.created_at
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types t ON t.id = a.leave_type_id
  WHERE t.leave_type_code = 'CL'
    AND a.hr_academic_year_id = v_year_id
    AND a.start_date >= DATE '2026-08-01'
    AND a.start_date <  DATE '2026-09-01'
    AND a.status IN ('approved', 'pending', 'escalated');

  CREATE TEMP TABLE _keep ON COMMIT DROP AS
  SELECT x.id, x.employee_id, x.leave_type_id, x.total_days, x.status
  FROM (
    SELECT a.*,
           SUM(a.total_days) OVER (PARTITION BY a.employee_id
                                   ORDER BY a.start_date, a.created_at
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
    FROM _aug a
  ) x
  WHERE x.running <= 1;

  -- A person can keep more than one request, so what August contributes to
  -- `used` is a SUM. Materialised once — three later statements read it, and a
  -- scalar subquery would silently take only the first row.
  --
  -- KEYED ON (employee, leave type), NOT ON THE EMPLOYEE. 29 staff hold a CL
  -- balance row for an institution they do not work at — generate_hr_leave_
  -- balances provisions per organization, so a Main Office employee can carry a
  -- Pharmacy CL row as well as their own. Summing by employee alone credited
  -- their single approved August day to EVERY one of those rows, leaving 13
  -- rows with 12.5 days that the row's own applications cannot explain — the
  -- very opening adjustment this function exists to drive to zero.
  CREATE TEMP TABLE _keep_approved ON COMMIT DROP AS
  SELECT employee_id, leave_type_id, SUM(total_days) AS days
  FROM _keep
  WHERE status = 'approved'
  GROUP BY employee_id, leave_type_id;

  -- ---- 3. What gets rejected ----------------------------------------------
  CREATE TEMP TABLE _reject ON COMMIT DROP AS
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.total_days, a.status,
         'August 2026 allows one Casual Leave day; this request is beyond it.' AS why
  FROM _aug a
  WHERE NOT EXISTS (SELECT 1 FROM _keep k WHERE k.id = a.id)
  UNION ALL
  SELECT a.id, a.employee_id, a.start_date, a.end_date, a.total_days, a.status,
         'Casual Leave outside June-August 2026 is reset for the 2026-27 year.' AS why
  FROM public.hr_leave_applications a
  JOIN public.hr_leave_types t ON t.id = a.leave_type_id
  WHERE t.leave_type_code = 'CL'
    AND a.hr_academic_year_id = v_year_id
    AND a.status = 'approved'
    AND a.start_date >= DATE '2026-09-01';

  -- A locked attendance month refuses every write to a request touching it,
  -- with no super-admin escape (hr_trig_block_leave_in_locked_period). Find
  -- them FIRST so a locked institution is a reported skip and not an abort
  -- half way through the run.
  CREATE TEMP TABLE _blocked ON COMMIT DROP AS
  SELECT DISTINCT r.id
  FROM _reject r
  JOIN public.staff s ON s.id = r.employee_id
  JOIN public.hr_attendance_periods ap
    ON ap.institution_id = s.institution_id
   AND ap.status = 'locked'
   AND make_date(ap.period_year, ap.period_month, 1) <= r.end_date
   AND (make_date(ap.period_year, ap.period_month, 1) + INTERVAL '1 month')::date > r.start_date;

  -- ---- 4. Attendance left stamped behind a rejected approval --------------
  -- Reported, never changed here. See the header.
  SELECT jsonb_build_object(
           'days_stamped', COUNT(DISTINCT ar.id),
           'staff',        COUNT(DISTINCT ar.employee_id))
    INTO v_followup
  FROM _reject r
  JOIN public.hr_attendance_records ar
    ON ar.employee_id = r.employee_id
   AND ar.work_date BETWEEN r.start_date AND r.end_date
  JOIN public.hr_attendance_status_types st ON st.id = ar.status_type_id
  WHERE r.status = 'approved'
    AND st.code IN ('LEAVE', 'HALF_DAY')
    AND NOT EXISTS (SELECT 1 FROM _blocked b WHERE b.id = r.id);

  -- ---- 5. Summaries (identical in dry-run and live) ------------------------
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
           c.jun_days + c.jul_days
             + COALESCE((SELECT ka.days FROM _keep_approved ka
                          WHERE ka.employee_id = c.employee_id
                            AND ka.leave_type_id = c.leave_type_id), 0) AS target
    FROM _cl_target c
  ) x;

  SELECT jsonb_build_object(
           'cleared', (SELECT COUNT(*) FROM public.hr_leave_month_entries e
                       JOIN public.hr_leave_types t ON t.id = e.leave_type_id
                       WHERE e.hr_academic_year_id = v_year_id AND t.leave_type_code = 'CL'),
           'written', (SELECT COUNT(*) FILTER (WHERE jun_days > 0)
                            + COUNT(*) FILTER (WHERE jul_days > 0) FROM _cl_target))
    INTO v_entries;

  SELECT jsonb_build_object(
           'august',     COUNT(*) FILTER (WHERE start_date < DATE '2026-09-01'),
           'september',  COUNT(*) FILTER (WHERE start_date >= DATE '2026-09-01'),
           'approved',   COUNT(*) FILTER (WHERE status = 'approved'),
           'pending',    COUNT(*) FILTER (WHERE status <> 'approved'),
           'days',       COALESCE(SUM(total_days), 0),
           'blocked_by_locked_period', (SELECT COUNT(*) FROM _blocked))
    INTO v_rejects
  FROM _reject r
  WHERE NOT EXISTS (SELECT 1 FROM _blocked b WHERE b.id = r.id);

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'academic_year', '2026-2027',
      'balances', v_bal, 'month_entries', v_entries, 'rejections', v_rejects,
      'attendance_followup', v_followup);
  END IF;

  -- ---- 6. Reject, FIRST ----------------------------------------------------
  -- Order matters: trg_hla_balance_update moves `used` on an approved ->
  -- rejected transition, so the absolute write in step 8 has to come after it
  -- or it would be undone. Every other trigger on the table early-returns for
  -- a status that is not pending/approved/escalated, and the approver gate
  -- passes on is_super_admin().
  UPDATE public.hr_leave_applications a
     SET status           = 'rejected',
         rejection_reason = r.why,
         updated_at       = now()
    FROM _reject r
   WHERE a.id = r.id
     AND NOT EXISTS (SELECT 1 FROM _blocked b WHERE b.id = r.id);

  -- ---- 7. Month overrides --------------------------------------------------
  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT e.employee_id, e.leave_type_id, v_year_id, e.hr_organization_id,
         'clear_month_entry',
         jsonb_build_object('month', e.month_start, 'total', e.days),
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

  -- added_days RECORDS WHAT THIS ENTRY PUT INTO `used`, and step 8 puts all of
  -- it there — so it is the day itself, not zero.
  --
  -- It was zero, on the reasoning that setting `used` absolutely left nothing
  -- for a later `clear` to hand back. That was wrong, and it broke the Adjust
  -- dialog: `clear` refunds exactly added_days, so removing a June charge
  -- deleted the entry and left `used` untouched — one day that no entry and no
  -- application explained, which is the opening adjustment this whole function
  -- exists to drive to zero. Re-running the reset is still safe: step 8 writes
  -- `used` absolutely, so nothing double-counts.
  INSERT INTO public.hr_leave_month_entries (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    month_start, days, added_days, reason, created_by)
  SELECT c.employee_id, c.leave_type_id, v_year_id, c.hr_organization_id,
         m.month_start, m.days, m.days, v_reason, v_actor
  FROM _cl_target c
  CROSS JOIN LATERAL (
    VALUES (DATE '2026-06-01', c.jun_days), (DATE '2026-07-01', c.jul_days)
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
    VALUES (DATE '2026-06-01', c.jun_days), (DATE '2026-07-01', c.jul_days)
  ) AS m(month_start, days)
  WHERE m.days > 0;

  -- ---- 8. `used`, absolutely ----------------------------------------------
  INSERT INTO public.hr_leave_balance_adjustments (
    employee_id, leave_type_id, hr_academic_year_id, hr_organization_id,
    action, old_value, new_value, reason, adjusted_by)
  SELECT c.employee_id, c.leave_type_id, v_year_id, c.hr_organization_id,
         'set_used',
         jsonb_build_object('used', c.used_now),
         jsonb_build_object('used', c.jun_days + c.jul_days
           + COALESCE((SELECT ka.days FROM _keep_approved ka
                        WHERE ka.employee_id = c.employee_id
                            AND ka.leave_type_id = c.leave_type_id), 0)),
         v_reason, v_actor
  FROM _cl_target c
  WHERE c.used_now IS DISTINCT FROM (c.jun_days + c.jul_days
    + COALESCE((SELECT ka.days FROM _keep_approved ka
                 WHERE ka.employee_id = c.employee_id
                            AND ka.leave_type_id = c.leave_type_id), 0));

  UPDATE public.hr_leave_balances b
     SET used = c.jun_days + c.jul_days
              + COALESCE((SELECT ka.days FROM _keep_approved ka
                           WHERE ka.employee_id = c.employee_id
                            AND ka.leave_type_id = c.leave_type_id), 0),
         updated_at = now()
    FROM _cl_target c
   WHERE b.employee_id         = c.employee_id
     AND b.leave_type_id       = c.leave_type_id
     AND b.hr_academic_year_id = v_year_id;

  RETURN jsonb_build_object(
    'dry_run', false, 'academic_year', '2026-2027',
    'balances', v_bal, 'month_entries', v_entries, 'rejections', v_rejects,
    'attendance_followup', v_followup);
END;
$function$;

COMMENT ON FUNCTION public.fn_hr_cl_reset_2026_27(boolean) IS
  'One-off 2026-09-07 repair of Casual Leave consumption for HR year 2026-2027. '
  'Super-admin only. p_dry_run defaults to true. See the migration header for the policy it encodes.';

-- Supabase grants EXECUTE to anon and authenticated on every new function, and
-- a later CREATE OR REPLACE silently re-grants it. Close it explicitly.
REVOKE ALL ON FUNCTION public.fn_hr_cl_reset_2026_27(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_hr_cl_reset_2026_27(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_cl_reset_2026_27(boolean) TO authenticated;
