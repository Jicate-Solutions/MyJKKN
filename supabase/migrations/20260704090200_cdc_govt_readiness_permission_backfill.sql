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
-- `permissions || jsonb_build_object(...)` so no existing key is clobbered.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object('cdc.govt_readiness.view', true),
    updated_at = now()
WHERE role_key IN ('cdc_head', 'cdc_coordinator');

-- Verify both roles now carry the key.
DO $$
DECLARE
  v_head  boolean;
  v_coord boolean;
BEGIN
  SELECT COALESCE((permissions->>'cdc.govt_readiness.view')::boolean, false)
    INTO v_head  FROM public.custom_roles WHERE role_key = 'cdc_head';
  SELECT COALESCE((permissions->>'cdc.govt_readiness.view')::boolean, false)
    INTO v_coord FROM public.custom_roles WHERE role_key = 'cdc_coordinator';

  IF NOT v_head THEN
    RAISE EXCEPTION 'cdc_head missing cdc.govt_readiness.view after backfill';
  END IF;
  IF NOT v_coord THEN
    RAISE EXCEPTION 'cdc_coordinator missing cdc.govt_readiness.view after backfill';
  END IF;

  RAISE NOTICE 'CDC govt-readiness permission backfill OK: cdc_head + cdc_coordinator granted cdc.govt_readiness.view';
END $$;

COMMIT;
