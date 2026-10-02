-- ============================================================================
-- Migration: 20270507090000_hr_payroll_prepare_and_backdate_refuse_non_staff
-- Created:   2026-09-29
-- TIER:      BEHAVIOURAL (two CREATE OR REPLACE; no table, column, policy or row)
-- STATUS:    FILE ONLY. Draft PR. Rehearsed on a throwaway PostgreSQL 16;
--            never applied anywhere else. Waits for the Director's number.
-- ============================================================================
--
-- THE HOLE (on main today; unrelated to PR #4111's purpose)
--   fn_prepare_payroll_period and fn_backdate_payroll_period (20260629000000,
--   their only definition) guard with
--       IF NOT (is_super_admin() OR is_admin() OR <role expression>) THEN RAISE
--   where <role expression> reads v_caller_role := fn_get_caller_role_key(),
--   the caller's staff.role_key. For a caller with NO staff row that is NULL,
--   so `v_caller_role IN (...)` / `v_caller_role = 'director'` is NULL,
--   `NOT (false OR false OR NULL)` is NULL, and plpgsql skips the RAISE.
--   Any signed-in account without a staff row — a learner — could therefore
--   prepare a draft payroll period (and receive its pay_matrix_snapshot in the
--   returned row) or mark any period as backdated. Found while rehearsing #4111.
--
-- THE FIX
--   Only the role expression changes, to the form fn_advance_payroll_period and
--   fn_reject_payroll_period already use, so all four stage RPCs read alike:
--     prepare:  (v_caller_role IS NOT NULL AND v_caller_role IN ('hr_officer','hr_admin','hr_manager','director'))
--     backdate: (v_caller_role IS NOT NULL AND v_caller_role = 'director')
--   Everyone who passes today with a real role still passes; admins and super
--   admins are untouched.
--
-- WHY fn_prepare_payroll_period ALSO CARRIES A SECOND, NO-OP-TODAY CHANGE
--   PR #4111 (migration 20270506090000) also replaces fn_prepare_payroll_period:
--   it reads the pay matrix directly as the function's owner instead of via
--   fn_get_policy('hr.pay_scales', ...), because #4111 gates that key inside
--   fn_get_policy and the role-name preparers do not hold the salary key. If
--   this file carried main's old read and were applied after #4111, it would
--   silently undo that and break every role-name preparer. So this file carries
--   the SAME prepare body as #4111, byte for byte (pinned by the shared hash in
--   __tests__/hr/payroll-prepare-body-shared.test.ts, present in both PRs).
--   On main today the direct read is semantically identical to the old one: it
--   is fn_get_policy's own SELECT (20260731180000) with the key and scope
--   substituted, run as the same owner (both functions are SECURITY DEFINER and
--   bypass RLS the same way). Either apply order is now safe.
--
-- NOT CHANGED
--   fn_advance_payroll_period and fn_reject_payroll_period already guard with
--   `v_caller_role IS NOT NULL AND ...`. fn_get_caller_role_key() is called by
--   no other function in supabase/migrations. Grants are restated below
--   (authenticated keeps EXECUTE; anon and PUBLIC revoked).
--
-- BEFORE APPLYING: diff pg_get_functiondef of both functions against this file.
--   Whether the live bodies match 20260629000000 is UNVERIFIED: no production
--   read was made for this PR.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fn_prepare_payroll_period — role check refuses a NULL role (+ the shared
--    owner read of the matrix, see header)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_prepare_payroll_period(
  p_period_id uuid,
  p_comment text DEFAULT NULL
)
RETURNS public.hr_payroll_periods
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_period public.hr_payroll_periods;
  v_caller_role text;
  v_pay_matrix jsonb;
  v_dedn jsonb;
  v_period_start date;
  v_period_end date;
  v_total_days int;
  v_working_days int;
BEGIN
  -- Load period (row-lock for the transaction)
  SELECT * INTO v_period
  FROM public.hr_payroll_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found: %', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Status guard: must be 'draft'
  IF v_period.status <> 'draft' THEN
    RAISE EXCEPTION 'Payroll period % is in status %, expected draft for fn_prepare_payroll_period',
      p_period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Role guard
  v_caller_role := public.fn_get_caller_role_key();

  IF NOT (
    public.is_super_admin()
    OR public.is_admin()
    OR (v_caller_role IS NOT NULL AND v_caller_role IN ('hr_officer','hr_admin','hr_manager','director'))
  ) THEN
    RAISE EXCEPTION 'Caller role % not authorized to prepare a payroll period (need hr_officer/hr_admin/hr_manager/director/admin)',
      COALESCE(v_caller_role, '<none>')
      USING ERRCODE = '42501';
  END IF;

  -- Snapshot pay matrix from platform_policies (global scope; per-institution
  -- override resolves via fn_get_policy's resolution priority)
  -- Updated 2026-09-29: read directly as the function's owner, not through
  -- fn_get_policy, whose pay-key gate (PR #4111) would refuse the role-name
  -- preparers. Same SELECT as fn_get_policy, key and scope substituted.
  v_pay_matrix := (
  SELECT value FROM platform_policies
  WHERE policy_key = 'hr.pay_scales' AND is_active = true
    AND (
      (scope_type='institution' AND scope_id=v_period.institution_id)
      OR (scope_type='global' AND scope_id IS NULL)
      OR (scope_type='role' AND scope_id IN (
            SELECT cr.id FROM custom_roles cr WHERE EXISTS (
              SELECT 1 FROM user_roles ur JOIN profiles p ON p.id=ur.user_id
              WHERE ur.role_id=cr.id AND p.id=auth.uid()
            )
          ))
      OR (scope_type='user' AND scope_id=auth.uid())
      -- cohort scope: the caller passes the batch's cohorts.id as p_scope_id.
      OR (scope_type='cohort' AND scope_id=v_period.institution_id)
      -- ...falling back to the programme-wide cohort default.
      OR (scope_type='cohort' AND scope_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN scope_type = 'user'                                  THEN 1
      WHEN scope_type = 'cohort' AND scope_id IS NOT NULL        THEN 2
      WHEN scope_type = 'institution'                            THEN 3
      WHEN scope_type = 'role'                                   THEN 4
      WHEN scope_type = 'cohort' AND scope_id IS NULL            THEN 5
      WHEN scope_type = 'global'                                 THEN 6
      ELSE 99
    END
  LIMIT 1
  );

  -- Snapshot deduction rates (5 policy keys nested into one jsonb)
  v_dedn := jsonb_build_object(
    'tds_slabs',          public.fn_get_policy('hr.payroll.tds_slabs',          v_period.institution_id),
    'pf_rate',            public.fn_get_policy('hr.payroll.pf_rate',            v_period.institution_id),
    'esi_rate',           public.fn_get_policy('hr.payroll.esi_rate',           v_period.institution_id),
    'professional_tax',   public.fn_get_policy('hr.payroll.professional_tax',   v_period.institution_id),
    'standard_deduction', public.fn_get_policy('hr.payroll.standard_deduction', v_period.institution_id)
  );

  -- Compute period bounds
  v_period_start := make_date(v_period.period_year, v_period.period_month, 1);
  v_period_end := (v_period_start + interval '1 month - 1 day')::date;
  v_total_days := (v_period_end - v_period_start) + 1;

  -- Working days = total calendar days
  --                MINUS Sundays in the range
  --                MINUS approved institution holidays (institution_leaves) that fall in-range
  WITH all_days AS (
    SELECT generate_series(v_period_start, v_period_end, interval '1 day')::date AS d
  ),
  non_sundays AS (
    SELECT d FROM all_days WHERE extract(dow from d) <> 0  -- Sunday = 0
  ),
  holidays_in_range AS (
    -- institution_leaves rows scoped to this institution + approved + overlapping the period
    SELECT DISTINCT d
    FROM non_sundays
    WHERE EXISTS (
      SELECT 1 FROM public.institution_leaves il
      WHERE il.institution_id = v_period.institution_id
        AND il.status = 'approved'
        AND il.scope_level = 'institution'  -- only institution-wide holidays subtract
        AND non_sundays.d BETWEEN il.start_date AND il.end_date
    )
  )
  SELECT (SELECT count(*) FROM non_sundays) - (SELECT count(*) FROM holidays_in_range)
  INTO v_working_days;

  -- Defensive floor: at least 1 working day so divisor never zero
  v_working_days := GREATEST(v_working_days, 1);

  -- Update period
  UPDATE public.hr_payroll_periods
  SET
    status = 'prepared',
    prepared_at = now(),
    prepared_by = auth.uid(),
    pay_matrix_snapshot = v_pay_matrix,
    deduction_rates_snapshot = v_dedn,
    working_days_count = v_working_days,
    total_calendar_days = v_total_days
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  -- Audit row
  INSERT INTO public.hr_payroll_period_approvals (period_id, stage, approver_id, comment)
  VALUES (p_period_id, 'prepared', auth.uid(), p_comment);

  RETURN v_period;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. fn_backdate_payroll_period — role check refuses a NULL role
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_backdate_payroll_period(
  p_period_id uuid,
  p_reason text
)
RETURNS public.hr_payroll_periods
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_period public.hr_payroll_periods;
  v_caller_role text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'fn_backdate_payroll_period requires a non-empty reason (Decision #20)'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_period
  FROM public.hr_payroll_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found: %', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Role guard: Director only (or admin override per spec RLS posture row 5)
  v_caller_role := public.fn_get_caller_role_key();

  IF NOT (
    public.is_super_admin()
    OR public.is_admin()
    OR (v_caller_role IS NOT NULL AND v_caller_role = 'director')
  ) THEN
    RAISE EXCEPTION 'Only Director (or admin/super_admin) can backdate a payroll period (Decision #20). Caller role: %',
      COALESCE(v_caller_role, '<none>')
      USING ERRCODE = '42501';
  END IF;

  -- Flip the flag + capture reason
  UPDATE public.hr_payroll_periods
  SET is_backdated = true,
      backdate_reason = trim(p_reason)
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  -- Audit row — dedicated stage value for Director sign-off, separate from
  -- the normal chain so the trail is unambiguous on Form 16 reconciliation.
  INSERT INTO public.hr_payroll_period_approvals (period_id, stage, approver_id, comment)
  VALUES (p_period_id, 'backdated_approval', auth.uid(), p_reason);

  RETURN v_period;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_backdate_payroll_period(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_backdate_payroll_period(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
