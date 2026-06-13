-- ============================================================================
-- Seed default role -> permission mappings for Campus Living Premium Stay
-- ============================================================================
-- Created: 2026-05-19
-- Item 2 of 3 in the campus-living tech debt sweep PR.
--
-- Background:
--   lib/constants/permissions.ts already declares the 5 premium permission
--   keys (PRs #996 / #1001). However, no role had them mapped, so the UI
--   gates (premium dashboard, override, audit log) blocked even chief
--   wardens. This migration backfills sane defaults so the just-shipped
--   pages are actually reachable.
--
-- Pattern:
--   MyJKKN stores per-role permissions in `custom_roles.permissions` as a
--   flat JSONB object: `{ "<permission_key>": true | false, ... }`. There
--   is NO separate `role_permissions` table. To grant a permission we
--   merge an object literal into the existing JSONB using the `||`
--   operator (last-write-wins), which preserves all existing keys.
--
-- Role assignments:
--   - warden            -> premium.view_dashboard
--   - chief_warden      -> all 5 (configure_tier, pick_room, invite_roommate,
--                                  override_pick, view_dashboard)
--   - student           -> premium.pick_room, premium.invite_roommate
--   - super_admin       -> all 5 (super_admin in MyJKKN holds 106 explicit
--                                  permissions, NOT a bypass — verified)
--
-- Idempotent: re-running this migration only re-asserts the keys; no
-- duplicates, no data loss.
-- ============================================================================

BEGIN;

-- warden: only view_dashboard. (Override + tier config are chief-warden only.)
UPDATE public.custom_roles
SET    permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
         'campus_living.premium.view_dashboard', true
       ),
       updated_at = now()
WHERE  role_key = 'warden';

-- chief_warden: all 5 (premium admin)
UPDATE public.custom_roles
SET    permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
         'campus_living.premium.configure_tier',  true,
         'campus_living.premium.pick_room',       true,
         'campus_living.premium.invite_roommate', true,
         'campus_living.premium.override_pick',   true,
         'campus_living.premium.view_dashboard',  true
       ),
       updated_at = now()
WHERE  role_key = 'chief_warden';

-- student: learner-facing actions only
UPDATE public.custom_roles
SET    permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
         'campus_living.premium.pick_room',       true,
         'campus_living.premium.invite_roommate', true
       ),
       updated_at = now()
WHERE  role_key = 'student';

-- super_admin: all 5 (super_admin has 106 explicit perms in this project)
UPDATE public.custom_roles
SET    permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
         'campus_living.premium.configure_tier',  true,
         'campus_living.premium.pick_room',       true,
         'campus_living.premium.invite_roommate', true,
         'campus_living.premium.override_pick',   true,
         'campus_living.premium.view_dashboard',  true
       ),
       updated_at = now()
WHERE  role_key = 'super_admin';

-- ------------------------------------------------------------------
-- Verification (SELECT-only smoke; no INSERT so no NOT NULL pitfalls)
-- ------------------------------------------------------------------
DO $$
DECLARE
  v_warden_count        int;
  v_chief_warden_count  int;
  v_student_count       int;
  v_super_admin_count   int;
BEGIN
  SELECT count(*) INTO v_warden_count
  FROM   public.custom_roles cr, jsonb_object_keys(cr.permissions) AS k
  WHERE  cr.role_key = 'warden' AND k LIKE 'campus_living.premium.%';

  SELECT count(*) INTO v_chief_warden_count
  FROM   public.custom_roles cr, jsonb_object_keys(cr.permissions) AS k
  WHERE  cr.role_key = 'chief_warden' AND k LIKE 'campus_living.premium.%';

  SELECT count(*) INTO v_student_count
  FROM   public.custom_roles cr, jsonb_object_keys(cr.permissions) AS k
  WHERE  cr.role_key = 'student' AND k LIKE 'campus_living.premium.%';

  SELECT count(*) INTO v_super_admin_count
  FROM   public.custom_roles cr, jsonb_object_keys(cr.permissions) AS k
  WHERE  cr.role_key = 'super_admin' AND k LIKE 'campus_living.premium.%';

  IF v_warden_count < 1 THEN
    RAISE EXCEPTION 'seed_premium_permissions: warden expected >=1 premium key, got %', v_warden_count;
  END IF;
  IF v_chief_warden_count < 5 THEN
    RAISE EXCEPTION 'seed_premium_permissions: chief_warden expected >=5 premium keys, got %', v_chief_warden_count;
  END IF;
  IF v_student_count < 2 THEN
    RAISE EXCEPTION 'seed_premium_permissions: student expected >=2 premium keys, got %', v_student_count;
  END IF;
  IF v_super_admin_count < 5 THEN
    RAISE EXCEPTION 'seed_premium_permissions: super_admin expected >=5 premium keys, got %', v_super_admin_count;
  END IF;

  RAISE NOTICE 'seed_premium_permissions OK: warden=%, chief_warden=%, student=%, super_admin=%',
    v_warden_count, v_chief_warden_count, v_student_count, v_super_admin_count;
END $$;

COMMIT;
