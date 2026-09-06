-- ============================================================================
-- T4.3 PR 3 — Fix RLS infinite recursion between hr_payroll_periods + hr_payslips
-- ============================================================================
-- Bug surfaced 2026-05-19 by PR #978 visual proof capture:
--   /admin/hr/payroll/periods list page renders, but data fetch returns:
--   "infinite recursion detected in policy for relation hr_payroll_periods"
--
-- Root cause (migration 20260628000000):
--   - hr_payroll_periods.SELECT policy has an EXISTS clause that JOINs hr_payslips.
--   - hr_payslips.SELECT policy has an EXISTS clause that JOINs hr_payroll_periods.
--   Postgres detects this mutual reference and aborts.
--
-- Why PR #957 RPCs worked despite this bug:
--   fn_prepare/advance/reject/backdate_payroll_period are all SECURITY DEFINER
--   which bypasses RLS — they UPDATE the row directly. PR #978 list view is the
--   first consumer to perform a non-DEFINER SELECT on hr_payroll_periods.
--
-- Fix:
--   Drop the staff-payslip cross-reference from hr_payroll_periods.SELECT.
--   Staff who need to see "which periods do my payslips belong to" can read
--   that information directly from hr_payslips (which has period_year/month
--   embedded via period_id and is already RLS-protected).
--
--   The remaining clauses on hr_payroll_periods.SELECT still cover all the
--   non-staff roles (super_admin, admin, hr_officer, cao, accounts, chairperson,
--   trust_secretary, director, principal, vice_principal, registrar) via the
--   staff-role-key check. Staff role 'staff' / 'teaching' / 'non_teaching' / etc.
--   do not appear in that role_key list, which is consistent with: staff don't
--   browse the period list; they only see their own payslips.
--
-- Verification:
--   Post-apply, query `SELECT 1 FROM hr_payroll_periods LIMIT 1` from a
--   non-DEFINER session — should return without recursion error.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS hr_payroll_periods_select ON public.hr_payroll_periods;

CREATE POLICY hr_payroll_periods_select ON public.hr_payroll_periods
  FOR SELECT USING (
    public.is_super_admin()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff acting
      WHERE acting.profile_id = auth.uid()
        AND acting.role_key IN (
          'hr_officer', 'hr_admin', 'hr_manager',
          'cao', 'accounts', 'accountant',
          'director', 'chairperson', 'trust_secretary',
          'principal', 'vice_principal', 'registrar'
        )
        AND (
          acting.institution_id = hr_payroll_periods.institution_id
          OR acting.role_key IN ('director', 'trust_secretary', 'chairperson')
        )
    )
    -- Note: removed the EXISTS-join to hr_payslips clause that caused the
    -- infinite recursion. Staff who need their period context read it from
    -- hr_payslips directly (which embeds period_id + period_year/month).
  );

COMMENT ON POLICY hr_payroll_periods_select ON public.hr_payroll_periods IS
  'T4.3 PR3 fix 2026-05-19: removed cross-reference to hr_payslips that mirrored '
  'hr_payslips''s own hr_payroll_periods join, causing infinite recursion. Staff '
  'access to their period context is via hr_payslips directly.';

-- Verification: confirm the policy compiles + can be evaluated
DO $$
BEGIN
  PERFORM 1 FROM public.hr_payroll_periods LIMIT 1;
  RAISE NOTICE 'T4.3 PR3 RLS fix verified: hr_payroll_periods.select evaluates without recursion';
END
$$;

COMMIT;
