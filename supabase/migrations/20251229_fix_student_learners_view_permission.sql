-- Migration: Fix student role missing learners.view permission
-- Created: 2025-12-29
-- Issue: Student role was missing learners.view permission, causing Learners Management menu to be hidden
-- Fix: Add learners.view permission to student role

BEGIN;

-- Update student role to add learners.view permission
UPDATE custom_roles
SET
  permissions = permissions || jsonb_build_object('learners.view', true),
  updated_at = now()
WHERE role_key = 'student'
  AND (permissions->>'learners.view' IS NULL OR permissions->>'learners.view' = 'false');

-- Verify the update
DO $$
DECLARE
  v_permission_value TEXT;
BEGIN
  SELECT permissions->>'learners.view' INTO v_permission_value
  FROM custom_roles
  WHERE role_key = 'student';

  IF v_permission_value = 'true' THEN
    RAISE NOTICE 'Student role successfully updated with learners.view permission';
  ELSE
    RAISE EXCEPTION 'Failed to update student role permissions';
  END IF;
END $$;

COMMIT;
