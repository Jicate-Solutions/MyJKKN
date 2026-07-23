-- ============================================================================
-- Migration: 20260629000000_t4_3_pr2_payroll_rpcs
-- Phase: HR Module — T4.3 PR 2 (RPC layer for period state machine)
-- ============================================================================
-- Spec: specs/t4-payroll-design-lock-2026-05-15.md (20 decisions, lock 2026-05-15)
-- Substrate: supabase/migrations/20260628000000_t4_3_payroll_periods_approvals_payslips.sql
--            (3 tables landed in PR 1, commit 630cba3a4 on jicate/main)
--
-- This migration ships 4 SECURITY DEFINER RPCs that encode the 4-stage approval
-- chain (Decision #9, hard-block per Decision #17, Director backdate per Decision #20):
--
--   1. fn_prepare_payroll_period(period_id, comment)  → draft → prepared
--      Snapshots pay_matrix + deduction_rates from platform_policies, computes
--      working_days_count + total_calendar_days from institution_leaves.
--
--   2. fn_advance_payroll_period(period_id, comment)  → generic stage advance
--      prepared → cao_reviewed → accounts_verified → chairperson_approved
--                                                  → distributed → locked
--
--   3. fn_reject_payroll_period(period_id, comment)   → drop one stage back
--      Stamps audit row with stage='rejected_to_prior' + rejected_from_stage.
--
--   4. fn_backdate_payroll_period(period_id, reason)  → Director-only retroactive
--      Sets is_backdated=true + backdate_reason + audit row stage='backdated_approval'.
--
-- ALL 4 functions: SECURITY DEFINER + SET search_path = public, extensions.
-- ALL 4 functions: validate caller role against the allowed set for the target
--                  stage AND insert audit row AND update period row in a single
--                  transaction (PL/pgSQL block; any RAISE EXCEPTION rolls back).
-- ALL 4 functions: GRANT EXECUTE TO authenticated at the end.
--
-- TIER-0 safe-additive. Idempotent re-run safe (CREATE OR REPLACE FUNCTION).
-- Hits prod via Management API + probe per CLAUDE.md Rule 1 BEFORE PR flips
-- DRAFT → Ready.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Helper: detect whether caller is an admin/super_admin
-- ----------------------------------------------------------------------------
-- Reuses public.is_super_admin() + public.is_admin() defined by migration
-- 20251210_optimize_rls_policies.sql. No new helper needed.

-- ----------------------------------------------------------------------------
-- 0a. Helper: extract caller role_key (from staff table, NULL if not staff)
-- ----------------------------------------------------------------------------
-- Used internally by the 4 RPCs to determine whether the caller satisfies the
-- per-stage role guard. Defined here (private to this migration scope) rather
-- than inlining the same SELECT 4 times. SECURITY DEFINER so it bypasses the
-- staff-table RLS for self-lookup.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_caller_role_key()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT role_key
  FROM public.staff
  WHERE profile_id = auth.uid()
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.fn_get_caller_role_key() IS
  'T4.3 PR2 helper: returns staff.role_key for auth.uid(), NULL if not on staff. Used by the 4 payroll-period RPCs to enforce per-stage role guards. SECURITY DEFINER bypasses staff-table RLS for self-lookup only.';

-- ============================================================================
-- 1. fn_prepare_payroll_period — Decision #9 stage 1 (HR Officer flip)
-- ============================================================================
-- Caller role must be in: hr_officer, hr_admin, hr_manager, director, admin,
--                         super_admin.
-- Period must currently be in 'draft' state.
--
-- Side effects (all in one transaction):
--   1. status = 'prepared'
--   2. prepared_at = now(), prepared_by = auth.uid()
--   3. pay_matrix_snapshot   = platform_policies hr.pay_scales
--   4. deduction_rates_snapshot = jsonb with 5 nested policy values
--   5. working_days_count + total_calendar_days computed from the period_year/
--      period_month + institution_leaves (Sundays + gazetted holidays excluded)
--   6. INSERT audit row into hr_payroll_period_approvals
--
-- Returns the updated period row.
-- ============================================================================
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
    OR v_caller_role IN ('hr_officer','hr_admin','hr_manager','director')
  ) THEN
    RAISE EXCEPTION 'Caller role % not authorized to prepare a payroll period (need hr_officer/hr_admin/hr_manager/director/admin)',
      COALESCE(v_caller_role, '<none>')
      USING ERRCODE = '42501';
  END IF;

  -- Snapshot pay matrix from platform_policies (global scope; per-institution
  -- override resolves via fn_get_policy's resolution priority)
  v_pay_matrix := public.fn_get_policy('hr.pay_scales', v_period.institution_id);

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

COMMENT ON FUNCTION public.fn_prepare_payroll_period(uuid, text) IS
  'T4.3 PR2 — Decision #9 stage 1: HR Officer flips draft → prepared. Snapshots pay_matrix + deduction_rates from platform_policies at prepare time (Decision #3/#14), computes working_days_count from institution_leaves. Errors if status != draft or caller role not in {hr_officer, hr_admin, hr_manager, director, admin, super_admin}.';

GRANT EXECUTE ON FUNCTION public.fn_prepare_payroll_period(uuid, text) TO authenticated;

-- ============================================================================
-- 2. fn_advance_payroll_period — Decision #9 generic stage advance
-- ============================================================================
-- Target stage derived from current status:
--   prepared              → cao_reviewed           (cao | director | admin)
--   cao_reviewed          → accounts_verified      (accounts | accountant | director | admin)
--   accounts_verified     → chairperson_approved   (chairperson | director | admin)
--   chairperson_approved  → distributed            (hr_officer | hr_admin | hr_manager | director | admin)
--   distributed           → locked                 (director | admin)
--
-- Decision #17: HARD BLOCK on delegation. The caller must own the role for the
--               target stage, OR be Director / admin (which are the only valid
--               override roles per spec).
--
-- Side effects (transactional):
--   1. status = target
--   2. {target}_at = now(), {target}_by = auth.uid()
--   3. INSERT audit row
--
-- Returns the updated period row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_advance_payroll_period(
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
  v_target text;
  v_allowed_roles text[];
  v_is_director_or_admin boolean;
BEGIN
  SELECT * INTO v_period
  FROM public.hr_payroll_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found: %', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Derive target stage + allowed roles from current status
  CASE v_period.status
    WHEN 'prepared' THEN
      v_target := 'cao_reviewed';
      v_allowed_roles := ARRAY['cao','director'];
    WHEN 'cao_reviewed' THEN
      v_target := 'accounts_verified';
      v_allowed_roles := ARRAY['accounts','accountant','director'];
    WHEN 'accounts_verified' THEN
      v_target := 'chairperson_approved';
      v_allowed_roles := ARRAY['chairperson','director'];
    WHEN 'chairperson_approved' THEN
      v_target := 'distributed';
      v_allowed_roles := ARRAY['hr_officer','hr_admin','hr_manager','director'];
    WHEN 'distributed' THEN
      v_target := 'locked';
      v_allowed_roles := ARRAY['director'];
    ELSE
      RAISE EXCEPTION 'Payroll period % in status % cannot be advanced (terminal or pre-prepare)',
        p_period_id, v_period.status
        USING ERRCODE = 'P0001';
  END CASE;

  v_caller_role := public.fn_get_caller_role_key();
  v_is_director_or_admin := public.is_super_admin() OR public.is_admin();

  IF NOT (
    v_is_director_or_admin
    OR (v_caller_role IS NOT NULL AND v_caller_role = ANY (v_allowed_roles))
  ) THEN
    RAISE EXCEPTION 'Caller role % not authorized to advance period from % to % (need one of %)',
      COALESCE(v_caller_role, '<none>'), v_period.status, v_target, v_allowed_roles
      USING ERRCODE = '42501';
  END IF;

  -- Update the right pair of (target_at, target_by) columns based on v_target.
  -- Doing this as five branches keeps each UPDATE statically typed and lets
  -- Postgres pick the right index plan.
  CASE v_target
    WHEN 'cao_reviewed' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'cao_reviewed',
          cao_reviewed_at = now(),
          cao_reviewed_by = auth.uid()
      WHERE id = p_period_id
      RETURNING * INTO v_period;
    WHEN 'accounts_verified' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'accounts_verified',
          accounts_verified_at = now(),
          accounts_verified_by = auth.uid()
      WHERE id = p_period_id
      RETURNING * INTO v_period;
    WHEN 'chairperson_approved' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'chairperson_approved',
          chairperson_approved_at = now(),
          chairperson_approved_by = auth.uid()
      WHERE id = p_period_id
      RETURNING * INTO v_period;
    WHEN 'distributed' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'distributed',
          distributed_at = now(),
          distributed_by = auth.uid()
      WHERE id = p_period_id
      RETURNING * INTO v_period;
    WHEN 'locked' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'locked',
          locked_at = now(),
          locked_by = auth.uid()
      WHERE id = p_period_id
      RETURNING * INTO v_period;
  END CASE;

  -- Audit row
  INSERT INTO public.hr_payroll_period_approvals (period_id, stage, approver_id, comment)
  VALUES (p_period_id, v_target, auth.uid(), p_comment);

  RETURN v_period;
END;
$$;

COMMENT ON FUNCTION public.fn_advance_payroll_period(uuid, text) IS
  'T4.3 PR2 — Decision #9 generic stage advance. Target derived from current status. Decision #17 hard-block: caller must own the role for the target stage OR be Director/admin. prepared→cao_reviewed→accounts_verified→chairperson_approved→distributed→locked.';

GRANT EXECUTE ON FUNCTION public.fn_advance_payroll_period(uuid, text) TO authenticated;

-- ============================================================================
-- 3. fn_reject_payroll_period — drop one stage back
-- ============================================================================
-- Drops the period back to the immediately-prior stage. Caller must be one of:
--   - the role that approved the CURRENT stage (so they can undo their own
--     decision), OR
--   - director / admin / super_admin (override)
--
-- Side effects (transactional):
--   1. status = prior stage
--   2. clear {current}_at + {current}_by columns
--   3. INSERT audit row with stage='rejected_to_prior' + rejected_from_stage=current
--
-- Errors if current status is 'draft' (nothing to reject to) or 'locked'
-- (terminal — cannot be undone via reject; needs admin DELETE).
-- p_comment is REQUIRED for reject (auditing why).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_reject_payroll_period(
  p_period_id uuid,
  p_comment text
)
RETURNS public.hr_payroll_periods
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_period public.hr_payroll_periods;
  v_caller_role text;
  v_current text;
  v_prior text;
  v_allowed_to_reject text[];
  v_is_director_or_admin boolean;
BEGIN
  IF p_comment IS NULL OR length(trim(p_comment)) = 0 THEN
    RAISE EXCEPTION 'fn_reject_payroll_period requires a non-empty comment for audit'
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

  v_current := v_period.status;

  -- Determine prior stage + the role(s) that can reject from current.
  -- The roles allowed to reject FROM a stage are the roles that approved INTO
  -- that stage (per the advance fn's allowed_roles mapping).
  CASE v_current
    WHEN 'draft' THEN
      RAISE EXCEPTION 'Cannot reject from draft (nothing to reject to)'
        USING ERRCODE = 'P0001';
    WHEN 'locked' THEN
      RAISE EXCEPTION 'Cannot reject from locked (terminal). Use admin DELETE if cleanup needed.'
        USING ERRCODE = 'P0001';
    WHEN 'prepared' THEN
      v_prior := 'draft';
      v_allowed_to_reject := ARRAY['hr_officer','hr_admin','hr_manager','director'];
    WHEN 'cao_reviewed' THEN
      v_prior := 'prepared';
      v_allowed_to_reject := ARRAY['cao','director'];
    WHEN 'accounts_verified' THEN
      v_prior := 'cao_reviewed';
      v_allowed_to_reject := ARRAY['accounts','accountant','director'];
    WHEN 'chairperson_approved' THEN
      v_prior := 'accounts_verified';
      v_allowed_to_reject := ARRAY['chairperson','director'];
    WHEN 'distributed' THEN
      v_prior := 'chairperson_approved';
      v_allowed_to_reject := ARRAY['hr_officer','hr_admin','hr_manager','director'];
    ELSE
      RAISE EXCEPTION 'Unknown status: %', v_current
        USING ERRCODE = 'P0001';
  END CASE;

  v_caller_role := public.fn_get_caller_role_key();
  v_is_director_or_admin := public.is_super_admin() OR public.is_admin();

  IF NOT (
    v_is_director_or_admin
    OR (v_caller_role IS NOT NULL AND v_caller_role = ANY (v_allowed_to_reject))
  ) THEN
    RAISE EXCEPTION 'Caller role % not authorized to reject from % (need one of %)',
      COALESCE(v_caller_role, '<none>'), v_current, v_allowed_to_reject
      USING ERRCODE = '42501';
  END IF;

  -- Clear the timestamp+actor columns for the stage we're rejecting FROM.
  -- We deliberately keep the audit row (immutable) so the trail shows the
  -- forward-then-rejected sequence.
  CASE v_current
    WHEN 'prepared' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'draft',
          prepared_at = NULL,
          prepared_by = NULL
      WHERE id = p_period_id
      RETURNING * INTO v_period;
    WHEN 'cao_reviewed' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'prepared',
          cao_reviewed_at = NULL,
          cao_reviewed_by = NULL
      WHERE id = p_period_id
      RETURNING * INTO v_period;
    WHEN 'accounts_verified' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'cao_reviewed',
          accounts_verified_at = NULL,
          accounts_verified_by = NULL
      WHERE id = p_period_id
      RETURNING * INTO v_period;
    WHEN 'chairperson_approved' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'accounts_verified',
          chairperson_approved_at = NULL,
          chairperson_approved_by = NULL
      WHERE id = p_period_id
      RETURNING * INTO v_period;
    WHEN 'distributed' THEN
      UPDATE public.hr_payroll_periods
      SET status = 'chairperson_approved',
          distributed_at = NULL,
          distributed_by = NULL
      WHERE id = p_period_id
      RETURNING * INTO v_period;
  END CASE;

  -- Audit row (immutable per RLS — no UPDATE policy exists)
  INSERT INTO public.hr_payroll_period_approvals (period_id, stage, approver_id, comment, rejected_from_stage)
  VALUES (p_period_id, 'rejected_to_prior', auth.uid(), p_comment, v_current);

  RETURN v_period;
END;
$$;

COMMENT ON FUNCTION public.fn_reject_payroll_period(uuid, text) IS
  'T4.3 PR2 — drop period one stage back. Caller must be the role that approved the current stage OR director/admin. Clears the current {target}_at/{target}_by; status set to prior. Audit row carries stage=rejected_to_prior + rejected_from_stage. Comment required. Errors on status=draft|locked.';

GRANT EXECUTE ON FUNCTION public.fn_reject_payroll_period(uuid, text) TO authenticated;

-- ============================================================================
-- 4. fn_backdate_payroll_period — Decision #20 Director-only retroactive
-- ============================================================================
-- Director-only RPC to retroactively mark a period as backdated. Sets the flag
-- + reason + inserts a dedicated audit row of stage='backdated_approval'.
--
-- Does NOT change status — the period continues to flow through the normal
-- 4-stage chain. The is_backdated flag only signals downstream (PDF watermark,
-- backfill tool, Form 16 reconciliation) that this was a retroactive period.
--
-- Per Decision #20: caller MUST be director (or admin/super_admin override).
-- Other roles get RAISE EXCEPTION even if they own a payroll-write role_key.
--
-- Reason is REQUIRED (NOT NULL + non-empty after trim).
-- ============================================================================
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
    OR v_caller_role = 'director'
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

COMMENT ON FUNCTION public.fn_backdate_payroll_period(uuid, text) IS
  'T4.3 PR2 — Decision #20 Director-only retroactive backdate. Sets is_backdated=true + backdate_reason. Audit row stage=backdated_approval. Reason required. Other roles (even hr_officer/cao/accounts) get 42501.';

GRANT EXECUTE ON FUNCTION public.fn_backdate_payroll_period(uuid, text) TO authenticated;

-- ============================================================================
-- 5. Verification probe (SELECT-only per CLAUDE.md Rule 1 pitfall 4)
-- ============================================================================
-- Confirms all 5 functions (4 RPCs + 1 helper) exist with security_type=DEFINER.
-- No INSERT smoke test (would need real institution + staff + profile rows).
-- ============================================================================
DO $$
DECLARE
  v_definer_count int;
BEGIN
  SELECT count(*) INTO v_definer_count
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'fn_get_caller_role_key',
      'fn_prepare_payroll_period',
      'fn_advance_payroll_period',
      'fn_reject_payroll_period',
      'fn_backdate_payroll_period'
    )
    AND security_type = 'DEFINER';

  IF v_definer_count <> 5 THEN
    RAISE EXCEPTION 'T4.3 PR2: expected 5 SECURITY DEFINER functions, found %', v_definer_count;
  END IF;

  RAISE NOTICE 'T4.3 PR2 RPCs verified: 5 functions (1 helper + 4 stage RPCs), all SECURITY DEFINER.';
END
$$;
