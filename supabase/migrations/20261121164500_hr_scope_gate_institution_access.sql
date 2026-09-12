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

-- ---------------------------------------------------------------------------
-- 4. The reader-scope question for a candidate, asked once.
--
-- hr_recruitment_interviews and hr_recruitment_scorecards carry no institution
-- column of their own — the institution belongs to the CANDIDATE being hired.
-- This helper asks the scope question across that link, exactly the way
-- fn_hr_staff_institution_included (20260906160000) asks it across staff.
--
-- WHY SECURITY DEFINER. hr_recruitment_candidates carries its own RLS, and its
-- SELECT policy demands hr.recruitment.view on top of institution access. Asking
-- the question through a plain invoker-rights subquery would therefore silently
-- couple these two gates to a SECOND permission key: a reader holding only
-- hr.recruitment.scorecards.view would match no candidate row, and the
-- RESTRICTIVE policy would confine them to their own scorecards even inside
-- their own institution. The definer reads the institution link and nothing
-- else. It cannot widen anything on its own, because its answer is AND-ed
-- inside a RESTRICTIVE policy — it can only ever subtract.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_candidate_institution_in_scope(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_candidate_id IS NULL
      OR EXISTS (SELECT 1
                   FROM public.hr_recruitment_candidates c
                  WHERE c.id = p_candidate_id
                    AND public.role_has_institution_access(c.institution_id));
$$;

-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on every new function to
-- `anon` directly, separately from PUBLIC, so revoking PUBLIC alone leaves the
-- function callable with the anon key that ships in every browser bundle. Both
-- are named here. The resulting ACL matches the sibling gate helpers already in
-- production: authenticated + service_role, never anon.
REVOKE EXECUTE ON FUNCTION public.fn_hr_candidate_institution_in_scope(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_candidate_institution_in_scope(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Interview records — same ungated class as the three above. The permissive
--    policy grants on hr.recruitment.view alone, so every `own`-scoped holder
--    of that key reads every institution's interview schedule, panel and notes.
--    The parent hr_recruitment_candidates IS already scoped, which is what
--    makes this the leak it is: the candidate is hidden, their interview is not.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_scope_gate ON public.hr_recruitment_interviews;
CREATE POLICY hr_scope_gate ON public.hr_recruitment_interviews
  AS RESTRICTIVE FOR SELECT
  USING (
    (SELECT public.is_super_admin())
    OR candidate_id IS NULL
    OR public.fn_hr_candidate_institution_in_scope(candidate_id)
    -- identity path repeated from hr_recruitment_interviews_select_permission:
    -- a panel member keeps sight of the interview they are sitting on, whatever
    -- institution it belongs to.
    OR (SELECT auth.uid()) = ANY (panel_member_ids)
  );

-- ---------------------------------------------------------------------------
-- 6. Scorecards — the interviewer's written assessment of a candidate, granted
--    on hr.recruitment.scorecards.view with no institution dimension.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_scope_gate ON public.hr_recruitment_scorecards;
CREATE POLICY hr_scope_gate ON public.hr_recruitment_scorecards
  AS RESTRICTIVE FOR SELECT
  USING (
    (SELECT public.is_super_admin())
    OR candidate_id IS NULL
    OR public.fn_hr_candidate_institution_in_scope(candidate_id)
    -- identity path repeated from hr_recruitment_scorecards_select_permission:
    -- the interviewer who wrote a scorecard keeps their own.
    OR interviewer_id = (SELECT auth.uid())
  );
