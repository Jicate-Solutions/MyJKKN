-- =====================================================================
-- CDC Government-Job-Readiness Track — PR-4: permission key + role backfill
-- =====================================================================
-- Date: 2026-07-04
-- Source spec: specs/cdc-govt-jobs-readiness-2026-07-04.md (§5, §6)
-- Companion to: lib/constants/permissions.ts (cdc.govt_readiness.view added)
--               lib/sidebarMenuLink.ts (/cdc/govt-readiness → the key)
--
-- Additive + idempotent. NOT applied to prod by this build (draft PR).
--
-- WHY THIS MIGRATION (the "declare key without grant → empty UI" gotcha):
--   Declaring cdc.govt_readiness.view in permissions.ts only populates the
--   Role Management UI. Unless the matching key is written into the
--   custom_roles.permissions JSONB, the new /cdc/govt-readiness page renders
--   empty for cdc_head / cdc_coordinator (PermissionGuard denies), because
--   those roles gate on user_has_permission('cdc.govt_readiness.view'), not
--   the literal role name. This backfills the grant — mirroring
--   20260521T0500Z_cdc_dynamic_permissions_catalog_grants.sql.
--
--   No RLS helper change is needed: the cohort-overlap view reads
--   cdc_exam_syllabus_topics / cdc_exam_topic_map / cdc_training_types,
--   all of which already permit authenticated read. The permission key
--   gates the UI surface (sidebar + page), which is the intended contract.
-- =====================================================================

BEGIN;

-- Grant the new view key to both seeded CDC system roles. Uses
-- COALESCE(permissions, '{}') so a NULL permissions column does not collapse
-- the whole expression to NULL (jsonb NULL || x = NULL would silently wipe the
-- grant); the || merge otherwise preserves every existing key.
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('cdc.govt_readiness.view', true),
    updated_at = now()
WHERE role_key IN ('cdc_head', 'cdc_coordinator');

-- Verify the grant ONLY on roles that actually exist. A missing seeded role is
-- outside this additive migration's scope and must NOT abort the whole apply —
-- guard each check on row existence and RAISE NOTICE (not EXCEPTION) when absent.
DO $$
DECLARE
  v_head_exists  boolean;
  v_coord_exists boolean;
  v_head_ok      boolean;
  v_coord_ok     boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.custom_roles WHERE role_key = 'cdc_head')        INTO v_head_exists;
  SELECT EXISTS(SELECT 1 FROM public.custom_roles WHERE role_key = 'cdc_coordinator') INTO v_coord_exists;

  IF v_head_exists THEN
    SELECT COALESCE((permissions->>'cdc.govt_readiness.view')::boolean, false)
      INTO v_head_ok FROM public.custom_roles WHERE role_key = 'cdc_head';
    IF NOT v_head_ok THEN
      RAISE EXCEPTION 'cdc_head missing cdc.govt_readiness.view after backfill';
    END IF;
  ELSE
    RAISE NOTICE 'cdc_head role absent — govt_readiness grant skipped (no row to update)';
  END IF;

  IF v_coord_exists THEN
    SELECT COALESCE((permissions->>'cdc.govt_readiness.view')::boolean, false)
      INTO v_coord_ok FROM public.custom_roles WHERE role_key = 'cdc_coordinator';
    IF NOT v_coord_ok THEN
      RAISE EXCEPTION 'cdc_coordinator missing cdc.govt_readiness.view after backfill';
    END IF;
  ELSE
    RAISE NOTICE 'cdc_coordinator role absent — govt_readiness grant skipped (no row to update)';
  END IF;

  RAISE NOTICE 'CDC govt-readiness permission backfill complete (granted where the role exists)';
END $$;

COMMIT;
