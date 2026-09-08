-- 2026-11-21 — HR reads that ignore the reader's institution scope.
--
-- THE BUG. Three HR SELECT policies grant on a permission key alone, with no
-- institution dimension at all:
--
--   hr_recruitment_candidate_packages  hr.recruitment.packages.view
--   hr_staff_bank_accounts             hr.payroll.bank.view
--   hr_attendance_periods              hr.attendance.period.view / .view_self
--
-- A permission key says WHAT you may do; institution_scope says WHERE. These
-- policies read the first and never ask the second, so an `own`-scoped role
-- reads every institution's rows. Measured on production 2026-09-08:
-- `vice_principal` and `principal` are scoped `own` and hold
-- hr.recruitment.packages.view — 14 people currently able to read candidate
-- salary packages for all 13 institutions. hr_staff_bank_accounts exposes 386
-- bank accounts on the same shape.
--
-- WHY RESTRICTIVE, AND WHY A SECOND POLICY RATHER THAN AN EDIT. This repo
-- already established the pattern in 20260906160000: an institution question is
-- asked by its own RESTRICTIVE policy (`hr_included_gate`), AND-ed with whatever
-- the permissive policies allow, instead of being spliced into each one. That
-- keeps the permissive policies readable and means the gate cannot be lost when
-- someone later edits an unrelated branch. `hr_included_gate` asks "is this
-- institution part of HR at all"; this gate asks the sibling question the
-- platform was missing — "may THIS READER see this institution".
--
-- WHY NOTHING BREAKS FOR THE PEOPLE WHO NEED BREADTH. fn_my_hr_organization_ids()
-- returns every included org for any role whose institution_scope is 'all', so
-- hr_head (COO, CAO), ceo, coo, managing_director and accounts keep exactly the
-- reach they have today. Only `own`-scoped roles are confined — which is what
-- their scope already claimed.
--
-- WHY THE SELF BRANCHES ARE REPEATED HERE. A RESTRICTIVE policy AND-s with the
-- permissive ones, so a self-service path that is NOT institution-scoped would
-- otherwise be silently gated too: a recruiter who proposed a package for a
-- candidate at another institution would lose sight of their own proposal. Each
-- self path that exists in the permissive policy is therefore repeated as an
-- escape hatch, so this migration removes no access that is granted by identity
-- rather than by permission key.

-- ---------------------------------------------------------------------------
-- 1. Candidate salary packages — keyed by hr_organization_id.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_scope_gate ON public.hr_recruitment_candidate_packages;
CREATE POLICY hr_scope_gate ON public.hr_recruitment_candidate_packages
  AS RESTRICTIVE FOR SELECT
  USING (
    (SELECT public.is_super_admin())
    OR hr_organization_id IS NULL
    OR hr_organization_id = ANY (public.fn_my_hr_organization_ids())
    -- identity-based paths from hr_recruitment_packages_select_permission
    OR proposed_by = (SELECT auth.uid())
    OR approved_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.hr_recruitment_candidates c
      WHERE c.id = hr_recruitment_candidate_packages.candidate_id
        AND c.submitted_by = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Staff bank accounts — no institution column; the institution belongs to
--    the person, so the gate joins through staff, the same way
--    fn_hr_staff_institution_included does for the inclusion gate.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_scope_gate ON public.hr_staff_bank_accounts;
CREATE POLICY hr_scope_gate ON public.hr_staff_bank_accounts
  AS RESTRICTIVE FOR SELECT
  USING (
    (SELECT public.is_super_admin())
    OR staff_id IS NULL
    -- the reader's own record, whatever institution it sits in
    OR staff_id = ANY (public.fn_my_staff_ids())
    OR EXISTS (
      SELECT 1
      FROM public.staff s
      JOIN public.hr_organizations o ON o.institution_id = s.institution_id
      WHERE s.id = hr_staff_bank_accounts.staff_id
        AND o.id = ANY (public.fn_my_hr_organization_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Attendance periods — keyed by institution_id. Held broadly:
--    hr.attendance.view_self is carried by 76 roles / 1,388 people, so before
--    this gate every employee could read every institution's period rows.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_scope_gate ON public.hr_attendance_periods;
CREATE POLICY hr_scope_gate ON public.hr_attendance_periods
  AS RESTRICTIVE FOR SELECT
  USING (
    (SELECT public.is_super_admin())
    OR institution_id IS NULL
    OR public.role_has_institution_access(institution_id)
  );
