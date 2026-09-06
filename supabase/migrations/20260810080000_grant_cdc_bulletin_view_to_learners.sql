-- ============================================================
-- Migration: Grant cdc.bulletin.view to the learner role (stored role_key = student)
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

-- COALESCE is load-bearing: `NULL || jsonb_build_object(...)` evaluates to
-- NULL, which would ERASE a role's entire permission map instead of adding one
-- key. Prod has 0 rows with NULL permissions (verified before the apply), so
-- this is defence for other environments and for any re-run.
UPDATE custom_roles
SET
  permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'cdc.bulletin.view', true
  ),
  updated_at = now()
WHERE role_key = 'student';

-- Verify: the student role must now hold the key, and must NOT have
-- picked up any staff-side bulletin keys in the process.
-- Aggregate over EVERY matched row, not `SELECT ... INTO` (which silently takes
-- one arbitrary row and would report success for a partial update if more than
-- one role_key='student' row ever existed).
DO $$
DECLARE
  v_rows      INT;
  v_view_ok   INT;
  v_manage    INT;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE permissions->>'cdc.bulletin.view' = 'true'),
    count(*) FILTER (WHERE permissions->>'cdc.bulletin.manage' = 'true')
  INTO v_rows, v_view_ok, v_manage
  FROM custom_roles
  WHERE role_key = 'student';

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'no custom_roles row with role_key=student — nothing was granted';
  END IF;
  IF v_view_ok <> v_rows THEN
    RAISE EXCEPTION 'cdc.bulletin.view is true on only % of % student rows', v_view_ok, v_rows;
  END IF;
  IF v_manage > 0 THEN
    RAISE EXCEPTION 'student unexpectedly holds cdc.bulletin.manage on % row(s) — aborting', v_manage;
  END IF;
END $$;

COMMIT;
