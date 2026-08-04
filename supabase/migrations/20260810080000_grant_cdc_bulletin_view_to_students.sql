-- ============================================================
-- Migration: Grant cdc.bulletin.view to the student role
-- Created: 2026-08-04
-- Decision: Director, 2026-08-04 — learners should see the CDC
--           Opportunities Bulletin directly. Until now the page
--           (/cdc/bulletin, gated by cdc.bulletin.view in
--           lib/sidebarMenuLink.ts) was reachable by CDC staff
--           only, so externally-ingested scholarships never
--           reached the learners they are for.
-- Pattern:  identical to 20260305000002_add_startup_studio_
--           student_permissions.sql (permissions JSONB merge on
--           custom_roles, single role_key).
-- Rollback: UPDATE custom_roles
--           SET permissions = permissions - 'cdc.bulletin.view',
--               updated_at = now()
--           WHERE role_key = 'student';
-- ============================================================

BEGIN;

UPDATE custom_roles
SET
  permissions = permissions || jsonb_build_object(
    'cdc.bulletin.view', true
  ),
  updated_at = now()
WHERE role_key = 'student';

-- Verify: the student role must now hold the key, and must NOT have
-- picked up any staff-side bulletin keys in the process.
DO $$
DECLARE
  v_view TEXT;
  v_manage TEXT;
BEGIN
  SELECT
    permissions->>'cdc.bulletin.view',
    permissions->>'cdc.bulletin.manage'
  INTO v_view, v_manage
  FROM custom_roles
  WHERE role_key = 'student';

  IF v_view IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'cdc.bulletin.view was not granted to student (got %)', v_view;
  END IF;
  IF v_manage = 'true' THEN
    RAISE EXCEPTION 'student unexpectedly holds cdc.bulletin.manage — aborting';
  END IF;
END $$;

COMMIT;
