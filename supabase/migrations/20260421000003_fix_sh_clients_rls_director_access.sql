-- ================================================================================
-- Migration: Fix Solutions Hub sh_* RLS helper functions to include director +
--            is_super_admin flag (unblocks BUG-003291 "Internal server error"
--            when adding a client as director@jkkn.ac.in)
-- Created:   2026-04-21
-- Author:    Fix for BUG-003291
--
-- Root cause:
--   sh_is_admin() (created 2026-02-05 in migration 20260205000002) uses a
--   hardcoded role list: role IN ('super_admin', 'admin'). This predates the
--   dynamic permission system and does NOT include:
--     - profiles.is_super_admin = true  (the boolean flag used by every other
--       MyJKKN module's is_super_admin() function)
--     - profiles.role = 'director'      (valid role used across 2026-04
--       migrations: faculty-innovation, doctrines, etc.)
--     - profiles.role = 'administrator' (accepted by public.is_admin())
--
--   As a result, director@jkkn.ac.in (the reporter of BUG-003291) is blocked
--   from INSERT on sh_clients by policy "sh_clients_insert" which requires
--   sh_has_management_access() = sh_is_admin() OR sh_is_jicate_staff() OR
--   sh_is_hod(). None of those return true for role='director'.
--
--   Postgres raises SQLSTATE 42501 (insufficient_privilege). The service layer
--   wraps this into a generic Error (discarding the code), so withAuth's
--   PG_ERROR_MAP never sees 42501 and falls through to the generic 500
--   "Internal server error" response the user saw.
--
-- Fix:
--   Align sh_is_admin() with the canonical MyJKKN public.is_admin() pattern
--   by delegating to it. This:
--     - Picks up profiles.is_super_admin = true
--     - Accepts role IN ('admin', 'super_admin', 'administrator')
--     - Future-proofs against further role renames (one source of truth)
--
--   Also align sh_is_jicate_staff() / sh_is_hod() to rely on profiles.role
--   (unchanged behaviour — no-op for those two), but keep them in place so
--   sh_has_management_access() still grants department HODs and Jicate staff
--   access as originally intended.
--
--   The 'director' role is covered by the is_super_admin flag (director@jkkn.ac.in
--   has is_super_admin = true), so delegation to public.is_admin() is sufficient.
--   No hardcoding of 'director' needed.
--
-- Idempotent: CREATE OR REPLACE FUNCTION is safe to re-run.
--
-- Verification (post-merge, user should be able to):
--   1. Log in as director@jkkn.ac.in
--   2. Navigate to /solutions/clients/new
--   3. Fill minimal required fields (name, industry, contact_person, phone)
--   4. Click "Create Client" — expect success redirect to detail page
-- ================================================================================

-- Replace sh_is_admin() to delegate to canonical public.is_admin().
-- This picks up:
--   - profiles.is_super_admin = true  (director, root admins)
--   - profiles.role IN ('admin', 'super_admin', 'administrator')
CREATE OR REPLACE FUNCTION public.sh_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT public.is_admin();
$$;

-- sh_has_management_access() definition is unchanged at the SQL level, but
-- re-create it defensively so its body re-resolves to the NEW sh_is_admin()
-- (Postgres caches the function plan; an explicit OR REPLACE forces replan).
CREATE OR REPLACE FUNCTION public.sh_has_management_access()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT public.sh_is_admin() OR public.sh_is_jicate_staff() OR public.sh_is_hod();
$$;

-- Grant execute to authenticated users (matching the 2026-02-05 grant pattern
-- used by all other sh_* helpers — no-op if already granted).
GRANT EXECUTE ON FUNCTION public.sh_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sh_has_management_access() TO authenticated;

COMMENT ON FUNCTION public.sh_is_admin() IS
    'Solutions Hub admin check. Delegates to public.is_admin() to honour is_super_admin flag + admin/super_admin/administrator roles. Fixed 2026-04-21 for BUG-003291.';
