-- Housekeeping rebuild, migration 4 of 4: permission keys and grants.
--
-- Catalog entry and role grants MUST ship together. A key that exists in
-- lib/constants/permissions.ts but in no role's custom_roles.permissions JSONB
-- produces a page that renders empty with no error anywhere -- the single most
-- confusing failure mode in this codebase.
--
-- Grants mirror exactly who held the three old keys before the teardown, so no
-- one gains or loses access from the rebuild itself:
--   .view + .schedule + .mark_done  ->  the six administrative roles
--   .view + .mark_done              ->  Housekeeping Staff
--
-- Learners are deliberately absent: booking authorisation is "you hold a live
-- allocation for this room", enforced inside fn_cl_housekeeping_book. The
-- Student role's housekeeping keys stay false.
--
-- Note jsonb_build_object values are booleans, not strings. A grant check is
-- (permissions->>'key')::boolean IS TRUE -- `permissions ? 'key'` is a FALSE
-- POSITIVE, true even when the value is false.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md section 7
--
-- APPLIED over a direct SQL connection, not scripts/apply-migration-file.mjs.
-- See the header of 20260907085000_housekeeping_teardown.sql for why.

-- == Full grant: the six administrative roles ==============================
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.view',                true,
  'campus_living.housekeeping.types_manage',        true,
  'campus_living.housekeeping.cleaners_manage',     true,
  'campus_living.housekeeping.availability_manage', true,
  'campus_living.housekeeping.assign',              true,
  'campus_living.housekeeping.execute',             true,
  'campus_living.housekeeping.cancel',              true,
  'campus_living.housekeeping.waive',               true
)
WHERE role_name IN (
  'Warden',
  'Chief Warden',
  'Hostel Office Admin',
  'Executive Administrative Officer',
  'Managing Director',
  'Chief Executive Officer'
);

-- == Housekeeping Staff: see the work, record the work, nothing else =======
-- They held .view + .mark_done before; .execute is the direct successor to
-- .mark_done. They must NOT configure types (cost data) or waive holds.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.view',                true,
  'campus_living.housekeeping.execute',             true,
  'campus_living.housekeeping.types_manage',        false,
  'campus_living.housekeeping.cleaners_manage',     false,
  'campus_living.housekeeping.availability_manage', false,
  'campus_living.housekeeping.assign',              false,
  'campus_living.housekeeping.cancel',              false,
  'campus_living.housekeeping.waive',               false
)
WHERE role_name = 'Housekeeping Staff';

-- == Every other role: explicit false ======================================
-- The access-audit module reports a key absent from a role differently from a
-- key present-and-false; the existing rows all carry explicit false.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.view',                false,
  'campus_living.housekeeping.types_manage',        false,
  'campus_living.housekeeping.cleaners_manage',     false,
  'campus_living.housekeeping.availability_manage', false,
  'campus_living.housekeeping.assign',              false,
  'campus_living.housekeeping.execute',             false,
  'campus_living.housekeeping.cancel',              false,
  'campus_living.housekeeping.waive',               false
)
WHERE role_name NOT IN (
  'Warden','Chief Warden','Hostel Office Admin',
  'Executive Administrative Officer','Managing Director',
  'Chief Executive Officer','Housekeeping Staff'
);
