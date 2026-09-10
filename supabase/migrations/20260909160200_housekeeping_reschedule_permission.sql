-- Housekeeping reschedule, migration 3 of 3: the permission key and its grants.
--
-- Catalog entry (lib/constants/permissions.ts) and role grants MUST ship
-- together. A key that exists in the catalog but in no role's
-- custom_roles.permissions JSONB produces a page that renders empty with no
-- error anywhere -- the most confusing failure mode in this codebase.
--
-- Grants mirror who already holds .assign: rescheduling is the same class of
-- act as assigning, done by the same six administrative roles. It is a separate
-- key so it can be revoked on its own -- moving a learner's booking is a
-- heavier act than naming who cleans it, and Housekeeping Staff (who hold
-- .execute and record the work) must not be able to move it at all.
--
-- Note jsonb_build_object values are booleans, not strings. A grant check is
-- (permissions->>'key')::boolean IS TRUE -- `permissions ? 'key'` is a FALSE
-- POSITIVE, true even when the value is false.
--
-- APPLIED as two separate statements through the Supabase MCP apply_migration
-- transport, recorded as 20260909061412 (housekeeping_reschedule_permission_
-- grant) and 20260909061420 (..._deny). Running the whole file through
-- scripts/apply-migration-file.mjs returned 57014 -- both UPDATEs over
-- custom_roles in one exec_sql statement exceed the PostgREST statement
-- timeout. Split, each one is well inside it.

UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.reschedule', true
)
WHERE role_name IN (
  'Warden',
  'Chief Warden',
  'Hostel Office Admin',
  'Executive Administrative Officer',
  'Managing Director',
  'Chief Executive Officer'
);

-- Every other role, Housekeeping Staff included: explicit false. The
-- access-audit module reports a key ABSENT from a role differently from a key
-- present-and-false, and every other housekeeping key on these rows is
-- explicitly false.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.reschedule', false
)
WHERE role_name NOT IN (
  'Warden',
  'Chief Warden',
  'Hostel Office Admin',
  'Executive Administrative Officer',
  'Managing Director',
  'Chief Executive Officer'
);
