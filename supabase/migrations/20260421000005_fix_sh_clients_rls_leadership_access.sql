-- ================================================================================
-- Migration: Widen Solutions Hub management access to include C-suite + principal
--            roles (BUG-003291 reopened — CBO still blocked after PR #280).
-- Created:   2026-04-21
-- Supersedes: 20260421000003 (director/is_super_admin fix — still correct, but
--             incomplete because it only covered `is_admin()` roles).
--
-- Root cause (continuation from PR #280):
--   PR #280 rewrote sh_is_admin() to delegate to public.is_admin(), which matches:
--     - profiles.is_super_admin = true (director has this flag)
--     - profiles.role IN ('admin', 'super_admin', 'administrator')
--
--   director@jkkn.ac.in is unblocked because of the is_super_admin flag. But the
--   original reporter of BUG-003291 is CBO Mohanraj V (mohanraj_v@jkkn.ac.in),
--   whose profile is { role: 'cbo', is_super_admin: false }. None of the three
--   paths in sh_has_management_access() match:
--     sh_has_management_access() = sh_is_admin() OR sh_is_jicate_staff() OR sh_is_hod()
--                                = false           OR false               OR false
--   Postgres raises SQLSTATE 42501 ("insufficient_privilege"), which (after
--   PR #280's error-code preservation fix) now surfaces to the UI as the literal
--   "Insufficient Privileges" message CBO reports. Upgrade from the silent 500,
--   but still a dead-end for the user.
--
--   Five other C-suite-adjacent roles will hit the same bug the moment their
--   holders try the same flow: ceo (1 user), cao (1), coo (1), principal (4),
--   system_admin (6). Seven distinct users are currently one click away from the
--   same failure mode.
--
-- Fix shape chosen:
--   Introduce a new helper sh_is_leadership() that returns true for the
--   institution-leadership roles { cbo, ceo, cao, coo, principal, system_admin },
--   then OR it into sh_has_management_access(). Scoped to Solutions Hub only —
--   does NOT widen public.is_admin(), so billing/academic/admission RLS are
--   unaffected. Reversible: drop the helper and the OR clause, old behaviour
--   returns.
--
--   Roles NOT included (deliberate):
--     - coe, coe_office: exam-office roles, no Solutions Hub business rationale.
--     - accounts, accountant_assistant: finance roles, scoped to billing module.
--     - principal is IN — per Director (MD+CAIO) authority structure, college
--       principals routinely drive industry partnerships that surface as
--       Solutions Hub clients.
--     - system_admin is IN — IT admin role, already has effective admin across
--       most MyJKKN modules via other patterns.
--
-- Idempotent: CREATE OR REPLACE everywhere; DROP IF EXISTS not needed.
--
-- Verification (post-apply, CBO should be able to):
--   1. Log in as mohanraj_v@jkkn.ac.in
--   2. Navigate to /solutions/clients/new
--   3. Fill name + industry + contact person + contact phone
--   4. Click Create Client → expect success (no "Insufficient Privileges")
-- ================================================================================

-- New helper: leadership role check (institution C-suite + principal + sysadmin).
CREATE OR REPLACE FUNCTION public.sh_is_leadership()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('cbo', 'ceo', 'cao', 'coo', 'principal', 'system_admin')
    );
$$;

COMMENT ON FUNCTION public.sh_is_leadership() IS
    'Solutions Hub leadership check. True for institution C-suite (cbo/ceo/cao/coo), principals, and system_admin. Added 2026-04-21 for BUG-003291 reopen (CBO still blocked after PR #280).';

GRANT EXECUTE ON FUNCTION public.sh_is_leadership() TO authenticated;

-- Extend sh_has_management_access() to include the new leadership path.
-- CREATE OR REPLACE forces Postgres to re-plan the function; any policy that
-- calls sh_has_management_access() picks up the new body on next evaluation.
CREATE OR REPLACE FUNCTION public.sh_has_management_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT public.sh_is_admin()
        OR public.sh_is_jicate_staff()
        OR public.sh_is_hod()
        OR public.sh_is_leadership();
$$;

-- Re-grant (no-op if already granted, defensive per 2026-02-05 pattern).
GRANT EXECUTE ON FUNCTION public.sh_has_management_access() TO authenticated;
