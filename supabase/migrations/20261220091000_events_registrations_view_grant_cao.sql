-- ─── events.registrations.view — grant to the CAO ───────────────────────────
-- 2026-09-16
--
-- Follow-up to 20261220090000_events_registrations_view_permission_key.sql,
-- which introduced the key and seeded administrator / event_coordinator / coo.
-- The CAO was asked for on the same review.
--
-- custom_roles.role_key = 'cao' carries institution_scope = 'all', exactly like
-- 'coo', so the key alone is enough: the policy's institution arm
-- (role_has_institution_access(events.institution_id)) short-circuits true for
-- any role scoped to all institutions. No policy change is needed.
--
-- This is the shape the key was built for — widening the audience is now an
-- UPDATE on one row (or a toggle in Role Management), not a policy rewrite.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('events.registrations.view', true),
       updated_at  = now()
 WHERE role_key = 'cao'
   AND (permissions->>'events.registrations.view')::boolean IS NOT TRUE;

NOTIFY pgrst, 'reload schema';
