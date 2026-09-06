-- ============================================================
-- Migration: Grant startup_studio.problem_bank.view to super_admin
-- Created: 2026-08-10
-- APPLIED to prod 2026-08-10 (dry-run then commit, Director-authorized).
--
-- Half of why /startup-studio/problem-bank rendered EMPTY for the Director.
-- The role simply had no `startup_studio.problem_bank.view` key:
--
--   student          -> 'true'   (granted 2026-03-05, migration 20260305000002)
--   nif_coordinator  -> 'true'
--   super_admin      ->  NULL    <- the gap
--
-- So learners could reach the problem bank and the platform owner could not.
--
-- The OTHER half was not a permission at all — see the service change in this
-- same PR: the list API scopes every query to the caller's institution, and
-- the ingested rows carry institution_id NULL, so they were invisible to
-- everyone regardless of permissions. Granting this key alone did NOT make
-- the page work; that was proven in a real browser before the second fix was
-- written. Both are needed.
--
-- Scope: the VIEW key only. No manage/create/score keys are granted here.
-- Pattern: identical JSONB merge to 20260305000002 and 20260810080000.
--
-- Rollback:
--   UPDATE custom_roles
--   SET permissions = permissions - 'startup_studio.problem_bank.view'
--                                  - 'startup_studio.view',
--       updated_at = now()
--   WHERE role_key = 'super_admin';
-- ============================================================

BEGIN;

-- COALESCE guard: `NULL || jsonb` evaluates to NULL, which would erase the
-- role's entire permission map instead of adding one key.
UPDATE custom_roles
SET
  permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
    'startup_studio.view', true,
    'startup_studio.problem_bank.view', true
  ),
  updated_at = now()
WHERE role_key = 'super_admin';

-- Aggregate over every matched row rather than SELECT..INTO, which would
-- silently inspect one arbitrary row if more than one ever existed.
DO $$
DECLARE
  v_rows   INT;
  v_view   INT;
  v_manage INT;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE permissions->>'startup_studio.problem_bank.view' = 'true'),
    count(*) FILTER (WHERE permissions->>'startup_studio.problem_bank.manage' = 'true')
  INTO v_rows, v_view, v_manage
  FROM custom_roles
  WHERE role_key = 'super_admin';

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'no custom_roles row with role_key=super_admin';
  END IF;
  IF v_view <> v_rows THEN
    RAISE EXCEPTION 'problem_bank.view is true on only % of % super_admin rows', v_view, v_rows;
  END IF;
  IF v_manage > 0 THEN
    RAISE EXCEPTION 'super_admin unexpectedly gained problem_bank.manage on % row(s)', v_manage;
  END IF;
END $$;

COMMIT;
