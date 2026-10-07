-- ============================================================================
-- Revoke: CIA Mark Entry (/academic/mark-entry) from hod, faculty, principal
-- 2026-10-07 — APPLIED to live out-of-band on this date.
--
-- 20261006120000_seed_mark_entry_permissions.sql granted
-- academic.mark-entry.{view,enter} to every role holding the matching
-- Question Papers key. This takes both keys back from three of those roles.
--
-- Still holding the keys afterwards: super_admin, coe, coe_office,
-- vice_principal.
--
-- DO NOT re-run the 20261006120000 seed after this: it is keyed off the live
-- Question Papers grants, which these three roles still hold, so it would
-- silently grant Mark Entry straight back to them.
--
-- Idempotent.
-- ============================================================================

UPDATE public.custom_roles
SET permissions = permissions - 'academic.mark-entry.view' - 'academic.mark-entry.enter',
    updated_at = now()
WHERE role_key IN ('hod', 'faculty', 'principal')
  AND (permissions ? 'academic.mark-entry.view' OR permissions ? 'academic.mark-entry.enter');
