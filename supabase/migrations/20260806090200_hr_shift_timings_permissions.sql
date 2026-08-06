-- =====================================================================
-- hr_shift_timings — permission grants
-- =====================================================================
-- Plan: docs/superpowers/plans/2026-08-06-hr-shift-timings.md
--
-- Declaring a key in lib/constants/permissions.ts does NOTHING on its own —
-- a key only "exists" for a role once it is in that role's permissions JSONB.
-- Without this migration the page renders for nobody.
--
-- Guard on the VALUE, not key presence. `NOT (permissions ? 'key')` would skip
-- the many roles that already carry the key explicitly set to false.
--
-- Targets hr_admin + hr_head: the two roles that already hold every other
-- attendance-admin key (hr.attendance.override, .view_all, .thresholds.write).
-- super_admin needs no grant — is_super_admin() short-circuits every policy.
-- Other roles can be granted through Role Management now that the keys are
-- declared in the catalog.
-- =====================================================================

UPDATE public.custom_roles
   SET permissions = permissions
                   || jsonb_build_object('hr.shift_timings.view', true)
                   || jsonb_build_object('hr.shift_timings.manage', true),
       updated_at = now()
 WHERE role_key IN ('hr_admin', 'hr_head')
   AND COALESCE((permissions->>'hr.shift_timings.manage')::boolean, false) = false;
