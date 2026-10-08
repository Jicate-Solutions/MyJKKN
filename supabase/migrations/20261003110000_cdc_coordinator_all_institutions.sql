-- CDC Coordinator + CDC Head → all institutions (2026-10-03)
--
-- A campus drive is multi-college by design, so the CDC team works across
-- every institution. Live state before this file:
--   cdc_head         institution_scope = 'all'   (already)
--   cdc_coordinator  institution_scope = 'own'   ← the gap
--
-- institution_scope = 'all' is honoured by role_has_institution_access() and
-- get_user_accessible_institutions() for the role held as PRIMARY (profiles.role)
-- or SECONDARY (user_roles), so this single flag is the whole change: the CDC
-- pickers (programs / semesters / learners / staff), drive lists, registrations
-- and reports all widen with it. No permission keys change.
--
-- NOTE: the flag is role-wide, not CDC-only — a holder sees all institutions in
-- every module their permissions already let them open.
--
-- Apply out of band (SQL editor), or flip "Institution scope" to All for the
-- role in Role Management. Safe to re-run.

UPDATE public.custom_roles
   SET institution_scope = 'all',
       updated_at = now()
 WHERE role_key IN ('cdc_coordinator', 'cdc_head')
   AND institution_scope IS DISTINCT FROM 'all';
