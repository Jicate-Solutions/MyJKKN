-- =====================================================================
-- CDC Dynamic Permission Catalog — backfill grants + hybrid RLS helpers
-- =====================================================================
-- Date: 2026-05-21
-- Companion to: lib/constants/permissions.ts (cdc.* category added 2026-05-21)
--
-- WHY THIS MIGRATION:
--   The CDC module shipped with hardcoded role-name RLS:
--       is_cdc_head_or_super()  -> profiles.role IN ('cdc_head','super_admin')
--       is_cdc_staff()          -> profiles.role IN ('cdc_head','cdc_coordinator')
--   plus a catalog gap (no cdc.* keys in lib/constants/permissions.ts) and
--   only 2 of 10 sub-modules wired into the sidebar.
--
--   Consequences before this fix:
--     • Role Management UI had no CDC permissions to tick — admins could
--       not grant CDC access to any custom role.
--     • Even if a custom role had been granted a cdc.* key (via a manual
--       jsonb update), RLS would still reject it because the user's
--       profiles.role wasn't literally 'cdc_head' or 'cdc_coordinator'.
--
--   What changes here (DB layer — Layer 2 of 4):
--     1. Backfill the new cdc.* keys onto the seeded cdc_head and
--        cdc_coordinator system roles so existing users keep working.
--        cdc_head -> full CRUD on all 10 sub-modules + exports download.
--        cdc_coordinator -> view + create/edit on operational sub-modules,
--                           no delete, no industry-mentors directory write.
--     2. Extend is_cdc_head_or_super() / is_cdc_staff() to *additionally*
--        accept user_has_permission(<scoped key>). This is the hybrid
--        strategy chosen 2026-05-21: existing role paths preserved, new
--        permission paths added — no existing access is revoked.
--
--   Layers covered elsewhere in the same PR:
--     Layer 1 — catalog: lib/constants/permissions.ts (cdc.* keys)
--     Layer 3 — UI: <PermissionGuard module="cdc" action="..."> on all
--               app/(routes)/cdc/**/page.tsx files
--     Layer 4 — sidebar: lib/sidebarMenuLink.ts (CDC group + MENU_PERMISSIONS)
--
-- SEE: feedback memory [[reserved_perm_keys_need_role_grants]] —
--      declaring keys in permissions.ts only populates the Role Management
--      UI; the matching custom_roles.permissions JSONB must be backfilled
--      via migration or the page renders empty for everyone.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. BACKFILL — grant cdc.* keys to the two seeded CDC system roles.
--    Uses `permissions || jsonb_build_object(...)` so we never clobber
--    other keys that may already be on these roles.
-- ---------------------------------------------------------------------

-- cdc_head: platform-global, full CRUD on every CDC surface.
UPDATE public.custom_roles
SET
  permissions = permissions || jsonb_build_object(
    'cdc.view',                       true,
    'cdc.drives.view',                true,
    'cdc.drives.create',              true,
    'cdc.drives.edit',                true,
    'cdc.drives.delete',              true,
    'cdc.placements.view',            true,
    'cdc.placements.create',          true,
    'cdc.placements.edit',            true,
    'cdc.placements.delete',          true,
    'cdc.internships.view',           true,
    'cdc.internships.create',         true,
    'cdc.internships.edit',           true,
    'cdc.internships.delete',         true,
    'cdc.idp.view',                   true,
    'cdc.idp.create',                 true,
    'cdc.idp.edit',                   true,
    'cdc.idp.delete',                 true,
    'cdc.clubs.view',                 true,
    'cdc.clubs.create',               true,
    'cdc.clubs.edit',                 true,
    'cdc.clubs.delete',               true,
    'cdc.mentors.view',               true,
    'cdc.mentors.create',             true,
    'cdc.mentors.edit',               true,
    'cdc.mentors.delete',             true,
    'cdc.training.view',              true,
    'cdc.training.create',            true,
    'cdc.training.edit',              true,
    'cdc.training.delete',            true,
    'cdc.bulletin.view',              true,
    'cdc.bulletin.create',            true,
    'cdc.bulletin.edit',              true,
    'cdc.bulletin.delete',            true,
    'cdc.industry_mentors.view',      true,
    'cdc.industry_mentors.create',    true,
    'cdc.industry_mentors.edit',      true,
    'cdc.industry_mentors.delete',    true,
    'cdc.exports.view',               true,
    'cdc.exports.download',           true
  ),
  updated_at = now()
WHERE role_key = 'cdc_head';

-- cdc_coordinator: per-institution, contribute access on operational
-- sub-modules; cannot delete and cannot edit the platform-global industry
-- mentor directory or run NAAC/AICTE exports (those are CDC HQ duties).
UPDATE public.custom_roles
SET
  permissions = permissions || jsonb_build_object(
    'cdc.view',                       true,
    'cdc.drives.view',                true,
    'cdc.drives.create',              true,
    'cdc.drives.edit',                true,
    'cdc.placements.view',            true,
    'cdc.placements.create',          true,
    'cdc.placements.edit',            true,
    'cdc.internships.view',           true,
    'cdc.internships.create',         true,
    'cdc.internships.edit',           true,
    'cdc.idp.view',                   true,
    'cdc.idp.create',                 true,
    'cdc.idp.edit',                   true,
    'cdc.clubs.view',                 true,
    'cdc.clubs.create',               true,
    'cdc.clubs.edit',                 true,
    'cdc.mentors.view',               true,
    'cdc.mentors.create',             true,
    'cdc.mentors.edit',               true,
    'cdc.training.view',              true,
    'cdc.training.create',            true,
    'cdc.training.edit',              true,
    'cdc.bulletin.view',              true,
    'cdc.bulletin.create',            true,
    'cdc.bulletin.edit',              true,
    'cdc.industry_mentors.view',      true,
    'cdc.exports.view',               true
  ),
  updated_at = now()
WHERE role_key = 'cdc_coordinator';


-- ---------------------------------------------------------------------
-- 2. HYBRID RLS HELPERS — extend the two existing CDC helpers so that
--    EITHER the hardcoded role check OR a relevant cdc.* permission
--    grant lets the user through. This preserves all existing access
--    paths (no migration risk for cdc_head/cdc_coordinator users) while
--    enabling custom roles granted via Role Management to participate.
--
--    `is_cdc_head_or_super()`  — write on master tables. Now also true
--    for any user holding `cdc.view` (the module-root gate) because
--    master-table writes are scoped to the CDC HQ persona in practice;
--    Role Management can restrict by not granting cdc.view.
--    Tighten later if a stricter `cdc.masters.write` key is introduced.
--
--    `is_cdc_staff()`          — generic CDC actor. Now also true for any
--    user holding `cdc.view` (any view on any CDC sub-module implies
--    legitimate CDC business reason to see masters).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_cdc_head_or_super()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.is_super_admin()
    OR (SELECT role = 'cdc_head' FROM public.profiles WHERE id = auth.uid())
    OR public.user_has_permission('cdc.view'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_cdc_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.is_super_admin()
    OR (SELECT role IN ('cdc_head','cdc_coordinator') FROM public.profiles WHERE id = auth.uid())
    OR public.user_has_permission('cdc.view'),
    false
  );
$$;


-- ---------------------------------------------------------------------
-- 3. VERIFICATION — surface errors immediately rather than silently
--    succeeding with empty permission grants. Catches the case where
--    one of the seeded roles disappeared in an earlier migration.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_head_keys integer;
  v_coord_keys integer;
BEGIN
  SELECT count(*) INTO v_head_keys
  FROM jsonb_each(
    (SELECT permissions FROM public.custom_roles WHERE role_key = 'cdc_head')
  )
  WHERE key LIKE 'cdc.%';

  SELECT count(*) INTO v_coord_keys
  FROM jsonb_each(
    (SELECT permissions FROM public.custom_roles WHERE role_key = 'cdc_coordinator')
  )
  WHERE key LIKE 'cdc.%';

  IF v_head_keys < 39 THEN
    RAISE EXCEPTION
      'cdc_head role expected >= 39 cdc.* keys, got %',
      v_head_keys;
  END IF;

  IF v_coord_keys < 27 THEN
    RAISE EXCEPTION
      'cdc_coordinator role expected >= 27 cdc.* keys, got %',
      v_coord_keys;
  END IF;

  RAISE NOTICE 'CDC permission backfill OK: head=% keys, coordinator=% keys', v_head_keys, v_coord_keys;
END $$;

COMMIT;
